import { useCallback, useEffect, useRef, useState } from 'react';
import type { Track } from '../../shared/types.ts';

export interface QueueEntry {
  taskId: string;
  track: Track;
}

export function playableUrl(t: Track): string {
  return t.audioUrl || t.streamUrl;
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
  const queueRef = useRef(queue);
  queueRef.current = queue;
  const currentRef = useRef(current);
  currentRef.current = current;

  const play = useCallback(async (entry: QueueEntry) => {
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

  const step = useCallback((dir: 1 | -1) => {
    const q = queueRef.current.filter((e) => playableUrl(e.track));
    if (!q.length) return;
    const idx = q.findIndex((e) => e.track.id === currentRef.current?.track.id);
    const audio = audioRef.current;
    if (dir === -1 && audio && audio.currentTime > 3) {
      audio.currentTime = 0;
      return;
    }
    const next = q[(idx + dir + q.length) % q.length];
    if (next) void play(next);
  }, [play]);

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
    const onEnded = () => step(1);
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
    return () => {
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

  return { current, playing, loading, time, duration, volume, error, play, pause, toggle, next: () => step(1), prev: () => step(-1), seek, setVolume, clearError: () => setError(null) };
}

export type Player = ReturnType<typeof usePlayer>;
