import { useCallback, useEffect, useRef, useState } from 'react';
import type { Track } from '../../shared/types.ts';
import { loadPrefs, savePrefs, type RepeatMode } from '../lib/prefs.ts';

export interface QueueEntry {
  taskId: string;
  track: Track;
}

export function playableUrl(t: Track): string {
  return t.audioUrl || t.streamUrl;
}

/**
 * Picks the next queue entry.
 * - repeat 'one' + track ended → same track
 * - shuffle → random other track
 * - otherwise the following track; at the end of the queue it wraps when the user pressed
 *   Next or repeat is 'all', and stops (null) when playback simply ran out with repeat 'off'.
 */
export function nextEntry(q: QueueEntry[], currentId: string | undefined, opts: { shuffle: boolean; repeat: RepeatMode; ended: boolean; rand?: () => number }): QueueEntry | null {
  if (!q.length) return null;
  const idx = q.findIndex((e) => e.track.id === currentId);
  if (opts.ended && opts.repeat === 'one' && idx >= 0) return q[idx];
  if (opts.shuffle && q.length > 1) {
    const others = q.filter((_, i) => i !== idx);
    return others[Math.floor((opts.rand ?? Math.random)() * others.length) % others.length];
  }
  if (idx + 1 < q.length) return q[idx + 1];
  if (!opts.ended || opts.repeat === 'all') return q[0];
  return null;
}

export function usePlayer(queue: QueueEntry[]) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  if (!audioRef.current && typeof Audio !== 'undefined') {
    audioRef.current = new Audio();
    audioRef.current.preload = 'metadata';
  }
  const [current, setCurrent] = useState<QueueEntry | null>(null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(0.9);
  const [error, setError] = useState<string | null>(null);
  const [buffered, setBuffered] = useState(0);
  const [shuffle, setShuffleState] = useState(() => loadPrefs().shuffle);
  const [repeat, setRepeatState] = useState<RepeatMode>(() => loadPrefs().repeat);
  const modesRef = useRef({ shuffle, repeat });
  modesRef.current = { shuffle, repeat };
  /** Tracks played in this session, so Previous works sensibly in shuffle mode. */
  const historyRef = useRef<string[]>([]);
  const queueRef = useRef(queue);
  queueRef.current = queue;
  const currentRef = useRef(current);
  currentRef.current = current;

  const play = useCallback(async (entry: QueueEntry, opts: { record?: boolean } = {}) => {
    const audio = audioRef.current;
    if (!audio) return;
    const url = playableUrl(entry.track);
    if (!url) {
      setError('This track is not ready to play yet.');
      return;
    }
    setError(null);
    const same = currentRef.current?.track.id === entry.track.id && audio.src;
    if (!same) {
      if (currentRef.current && opts.record !== false) historyRef.current = [...historyRef.current, currentRef.current.track.id].slice(-50);
      setBuffered(0);
      audio.src = url;
      setTime(0);
      setDuration(entry.track.duration || 0);
      setCurrent(entry);
    }
    try {
      setLoading(true);
      await audio.play();
    } catch (err) {
      if (!(err instanceof DOMException && err.name === 'AbortError')) {
        setError('Playback could not start. The audio may have expired or is unavailable.');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const pause = useCallback(() => audioRef.current?.pause(), []);

  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !currentRef.current) return;
    if (audio.paused) void play(currentRef.current);
    else audio.pause();
  }, [play]);

  const step = useCallback((dir: 1 | -1, ended = false) => {
    const q = queueRef.current.filter((e) => playableUrl(e.track));
    if (!q.length) return;
    const audio = audioRef.current;
    const currentId = currentRef.current?.track.id;
    if (dir === 1) {
      const next = nextEntry(q, currentId, { ...modesRef.current, ended });
      if (!next) {
        // End of queue with repeat off: stop and rewind.
        if (audio) audio.currentTime = 0;
        setTime(0);
        return;
      }
      if (next.track.id === currentId && audio) {
        audio.currentTime = 0;
        void audio.play().catch(() => undefined);
        return;
      }
      void play(next);
      return;
    }
    if (audio && audio.currentTime > 3) {
      audio.currentTime = 0;
      return;
    }
    if (modesRef.current.shuffle) {
      const hist = historyRef.current;
      const prevId = hist[hist.length - 1];
      const prev = q.find((e) => e.track.id === prevId);
      if (prev) {
        historyRef.current = hist.slice(0, -1);
        void play(prev, { record: false });
        return;
      }
    }
    const idx = q.findIndex((e) => e.track.id === currentId);
    const prev = q[(idx - 1 + q.length) % q.length];
    if (prev) void play(prev);
  }, [play]);

  const toggleShuffle = useCallback(() => {
    setShuffleState((v) => {
      savePrefs({ shuffle: !v });
      return !v;
    });
  }, []);

  const cycleRepeat = useCallback(() => {
    setRepeatState((r) => {
      const next: RepeatMode = r === 'off' ? 'all' : r === 'all' ? 'one' : 'off';
      savePrefs({ repeat: next });
      return next;
    });
  }, []);

  const seek = useCallback((t: number) => {
    const audio = audioRef.current;
    if (audio && Number.isFinite(t)) audio.currentTime = t;
  }, []);

  const setVolume = useCallback((v: number) => {
    setVolumeState(v);
    if (audioRef.current) audioRef.current.volume = v;
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = volume;
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onTime = () => setTime(audio.currentTime);
    const onMeta = () => Number.isFinite(audio.duration) && setDuration(audio.duration);
    const onWaiting = () => setLoading(true);
    const onCanPlay = () => setLoading(false);
    const onEnded = () => step(1, true);
    const onProgress = () => {
      try {
        if (audio.buffered.length) setBuffered(audio.buffered.end(audio.buffered.length - 1));
      } catch {
        /* ignore */
      }
    };
    const onError = () => {
      setPlaying(false);
      setLoading(false);
      if (audio.src) setError('This audio could not be loaded. Files are kept by SunoAPI for 14 days.');
    };
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('loadedmetadata', onMeta);
    audio.addEventListener('durationchange', onMeta);
    audio.addEventListener('waiting', onWaiting);
    audio.addEventListener('canplay', onCanPlay);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onError);
    audio.addEventListener('progress', onProgress);
    return () => {
      audio.removeEventListener('progress', onProgress);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('loadedmetadata', onMeta);
      audio.removeEventListener('durationchange', onMeta);
      audio.removeEventListener('waiting', onWaiting);
      audio.removeEventListener('canplay', onCanPlay);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // Lock-screen / hardware media keys.
  useEffect(() => {
    if (!('mediaSession' in navigator) || !current) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: current.track.title,
      artist: 'AI Music Studio',
      album: current.track.tags,
      artwork: current.track.imageUrl ? [{ src: current.track.imageUrl, sizes: '512x512' }] : [],
    });
    navigator.mediaSession.setActionHandler('play', () => toggle());
    navigator.mediaSession.setActionHandler('pause', () => pause());
    navigator.mediaSession.setActionHandler('nexttrack', () => step(1));
    navigator.mediaSession.setActionHandler('previoustrack', () => step(-1));
  }, [current, toggle, pause, step]);

  useEffect(() => () => audioRef.current?.pause(), []);

  return {
    current, playing, loading, time, duration, buffered, volume, error, shuffle, repeat,
    play, pause, toggle, next: () => step(1), prev: () => step(-1), seek, setVolume, toggleShuffle, cycleRepeat,
    clearError: () => setError(null),
  };
}

export type Player = ReturnType<typeof usePlayer>;
