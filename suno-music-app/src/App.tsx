import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AppConfigResponse, GenerateRequest, Track } from '../shared/types.ts';
import { AccessGate } from './components/AccessGate.tsx';
import { Composer } from './components/Composer.tsx';
import { Library } from './components/Library.tsx';
import { PlayerBar } from './components/PlayerBar.tsx';
import { useLibrary } from './hooks/useLibrary.ts';
import { usePlayer, type QueueEntry } from './hooks/usePlayer.ts';
import { ApiError, api, getAccessCode, setAccessCode } from './lib/api.ts';

interface Toast {
  id: number;
  text: string;
  kind: 'info' | 'error';
}

export default function App() {
  const [config, setConfig] = useState<AppConfigResponse | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [credits, setCredits] = useState<number | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const ready = Boolean(config) && !locked;
  const library = useLibrary(ready);

  const queue = useMemo<QueueEntry[]>(
    () => library.items.flatMap((i) => i.tracks.map((track) => ({ taskId: i.taskId, track }))),
    [library.items],
  );
  const player = usePlayer(queue);

  const toast = useCallback((text: string, kind: Toast['kind'] = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 5000);
  }, []);

  const loadCredits = useCallback(async () => {
    try {
      setCredits((await api.credits()).credits);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setAccessCode('');
        setLocked(true);
      }
      setCredits(null);
    }
  }, []);

  useEffect(() => {
    api
      .config()
      .then((c) => {
        setConfig(c);
        if (c.accessCodeRequired && !getAccessCode()) setLocked(true);
        else void loadCredits();
      })
      .catch(() => setConfigError('The studio could not connect to its server. Please refresh the page.'));
  }, [loadCredits]);

  const onCreated = (taskId: string, req: GenerateRequest) => {
    library.addTask(taskId, req);
    toast('Generation started — we’ll update the library as it progresses.');
    setTimeout(() => void loadCredits(), 3000);
  };

  // Notify when a task finishes.
  const [notified] = useState(() => new Set<string>());
  useEffect(() => {
    for (const i of library.items) {
      if (notified.has(i.taskId)) continue;
      if (Date.now() - i.updatedAt > 10_000) {
        if (i.phase === 'complete' || i.phase === 'failed') notified.add(i.taskId);
        continue;
      }
      if (i.phase === 'complete') {
        notified.add(i.taskId);
        toast(`“${i.tracks[0]?.title || 'Your song'}” is ready.`);
        void loadCredits();
      } else if (i.phase === 'failed') {
        notified.add(i.taskId);
        toast(i.errorMessage || 'A generation failed.', 'error');
      }
    }
  }, [library.items, notified, toast, loadCredits]);

  const onDownload = async (taskId: string, track: Track) => {
    setDownloadingId(track.id);
    try {
      await api.download(taskId, track.id, `${track.title || 'track'}.mp3`);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Download failed.', 'error');
      // Fallback: open the source file directly so the user can still save it.
      if (track.audioUrl && !(err instanceof ApiError && [401, 429].includes(err.status))) {
        window.open(track.audioUrl, '_blank', 'noopener');
      }
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <div className={`app ${player.current ? 'has-player' : ''}`}>
      <div className="bg" aria-hidden>
        <span className="orb o1" />
        <span className="orb o2" />
        <span className="orb o3" />
      </div>

      <header className="topbar">
        <div className="brand">
          <div className="logo" aria-hidden>
            <svg viewBox="0 0 32 32" width="22" height="22"><path d="M12 22V9l12-2.5V19" stroke="#fff" strokeWidth="2.4" fill="none" strokeLinejoin="round" /><circle cx="9" cy="22.5" r="3.5" fill="#fff" /><circle cx="21" cy="19.5" r="3.5" fill="#fff" /></svg>
          </div>
          <div>
            <h1>AI Music Studio</h1>
            <span className="tagline">Powered by SunoAPI</span>
          </div>
        </div>
        <div className="top-right">
          {config?.mock && <span className="badge mock" title="SUNO_MOCK=true — no real generation">Demo mode</span>}
          {credits !== null && (
            <span className="credits" title="Remaining SunoAPI credits" data-testid="credits">
              <span className="credit-dot" /> {credits.toLocaleString()} credits
            </span>
          )}
        </div>
      </header>

      {configError && <div className="alert banner" role="alert">{configError}</div>}

      <main className="layout">
        <Composer onCreated={onCreated} disabled={!ready} />
        <Library
          items={library.items}
          player={player}
          onRemove={library.remove}
          onClear={library.clear}
          onResume={library.resume}
          onDownload={onDownload}
          downloadingId={downloadingId}
        />
      </main>

      <footer className="foot muted small">
        Songs are generated by SunoAPI.org. Your history is stored only in this browser; generated files are kept by SunoAPI for 14 days.
      </footer>

      <PlayerBar player={player} onDownload={onDownload} downloading={downloadingId === player.current?.track.id} />

      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>{t.text}</div>
        ))}
      </div>

      {locked && (
        <AccessGate
          onUnlocked={(c) => {
            setLocked(false);
            setCredits(c);
          }}
        />
      )}
    </div>
  );
}
