import { useState } from 'react';
import type { Track } from '../../shared/types.ts';
import { formatTime, relativeTime } from '../lib/format.ts';
import { isExpired, type HistoryItem } from '../lib/history.ts';
import { playableUrl, type Player } from '../hooks/usePlayer.ts';
import { Artwork } from './Artwork.tsx';
import { DownloadIcon, HeartIcon, LyricsIcon, PauseIcon, PlayIcon, RefreshIcon, TrashIcon } from './Icons.tsx';

const STEPS = [
  { phase: 'pending', label: 'Queued' },
  { phase: 'text', label: 'Writing' },
  { phase: 'first', label: 'First track' },
  { phase: 'complete', label: 'Complete' },
] as const;

function stepIndex(phase: HistoryItem['phase']): number {
  return Math.max(0, STEPS.findIndex((s) => s.phase === phase));
}

function Progress({ item }: { item: HistoryItem }) {
  const idx = stepIndex(item.phase);
  const pct = [12, 45, 78, 100][idx];
  return (
    <div className="progress" aria-label={`Generation progress: ${STEPS[idx].label}`}>
      <div className="progress-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
        <span style={{ width: `${pct}%` }} />
      </div>
      <ol className="steps">
        {STEPS.map((s, i) => (
          <li key={s.phase} className={i < idx ? 'done' : i === idx ? 'current' : ''}>{s.label}</li>
        ))}
      </ol>
    </div>
  );
}

function TrackRow({ item, track, player, onDownload, downloading, favorite, onToggleFavorite }: { item: HistoryItem; track: Track; player: Player; onDownload: (t: Track) => void; downloading: boolean; favorite: boolean; onToggleFavorite: () => void }) {
  const [showLyrics, setShowLyrics] = useState(false);
  const isCurrent = player.current?.track.id === track.id;
  const isPlaying = isCurrent && player.playing;
  const canPlay = Boolean(playableUrl(track));
  const streamingOnly = !track.audioUrl && Boolean(track.streamUrl);

  return (
    <li className={`track ${isCurrent ? 'current' : ''}`}>
      <button
        type="button"
        className="track-art"
        disabled={!canPlay}
        onClick={() => (isPlaying ? player.pause() : player.play({ taskId: item.taskId, track }))}
        aria-label={isPlaying ? `Pause ${track.title}` : `Play ${track.title}`}
      >
        <Artwork src={track.imageUrl} alt="" size={64} />
        <span className="art-overlay">{isPlaying ? <PauseIcon /> : <PlayIcon />}</span>
        {isPlaying && <span className="eq" aria-hidden><i /><i /><i /></span>}
      </button>
      <div className="track-meta">
        <div className="track-title">{track.title}</div>
        <div className="track-sub">
          {track.tags && <span className="tags">{track.tags}</span>}
          <span>{formatTime(track.duration)}</span>
          {streamingOnly && <span className="badge live">Preview stream</span>}
        </div>
        {showLyrics && track.lyrics && <pre className="lyrics">{track.lyrics}</pre>}
      </div>
      <div className="track-actions">
        {track.audioUrl && (
          <button
            type="button"
            className={`icon-btn heart ${favorite ? 'on' : ''}`}
            aria-pressed={favorite}
            onClick={onToggleFavorite}
            aria-label={favorite ? `Remove ${track.title} from favorites` : `Add ${track.title} to favorites`}
            title={favorite ? 'Remove from favorites' : 'Add to favorites'}
            data-testid="favorite"
          >
            <HeartIcon filled={favorite} />
          </button>
        )}
        {track.lyrics && (
          <button type="button" className="icon-btn" aria-pressed={showLyrics} onClick={() => setShowLyrics((s) => !s)} aria-label="Show lyrics" title="Lyrics">
            <LyricsIcon />
          </button>
        )}
        <button
          type="button"
          className="icon-btn"
          disabled={!track.audioUrl || downloading}
          onClick={() => onDownload(track)}
          aria-label={`Download ${track.title}`}
          title={track.audioUrl ? 'Download MP3' : 'Available when the track is complete'}
        >
          {downloading ? <span className="spinner small" aria-hidden /> : <DownloadIcon />}
        </button>
      </div>
    </li>
  );
}

export function TaskCard({ item, tracks = item.tracks, favorites, onToggleFavorite, player, onRemove, onResume, onDownload, downloadingId }: {
  item: HistoryItem;
  tracks?: Track[];
  favorites: Set<string>;
  onToggleFavorite: (trackId: string) => void;
  player: Player;
  onRemove: () => void;
  onResume: () => void;
  onDownload: (t: Track) => void;
  downloadingId: string | null;
}) {
  const active = item.phase !== 'complete' && item.phase !== 'failed';
  const expired = isExpired(item);
  const summary = item.request.mode === 'simple' ? item.request.prompt : item.request.title || item.request.style;

  return (
    <article className={`task-card ${item.phase}`} data-testid="task-card" data-phase={item.phase}>
      <header className="task-head">
        <div className="task-info">
          <div className="task-summary" title={summary}>{summary || 'Untitled request'}</div>
          <div className="task-sub">
            <span>{relativeTime(item.createdAt)}</span>
            <span className="dot" />
            <span>{item.request.instrumental ? 'Instrumental' : 'Vocal'}</span>
            <span className="dot" />
            <span>{item.request.model.replace('_', ' ')}</span>
            {item.request.style && <><span className="dot" /><span className="clip">{item.request.style}</span></>}
          </div>
        </div>
        <button type="button" className="icon-btn subtle" onClick={onRemove} aria-label="Remove from history" title="Remove">
          <TrashIcon width={18} height={18} />
        </button>
      </header>

      {active && !item.stalled && <Progress item={item} />}

      {item.phase === 'failed' && (
        <div className="alert" role="status">{item.errorMessage || 'Generation failed.'}</div>
      )}
      {item.stalled && item.phase !== 'failed' && (
        <div className="alert warn" role="status">
          <span>{item.errorMessage || 'Status checks paused.'}</span>
          <button type="button" className="ghost-btn" onClick={onResume}><RefreshIcon width={16} height={16} /> Check again</button>
        </div>
      )}
      {expired && item.phase === 'complete' && (
        <div className="note">Generated files are kept for 14 days — these links may have expired.</div>
      )}

      {tracks.length > 0 && (
        <ul className="tracks">
          {tracks.map((t) => (
            <TrackRow key={t.id} item={item} track={t} player={player} onDownload={onDownload} downloading={downloadingId === t.id} favorite={favorites.has(t.id)} onToggleFavorite={() => onToggleFavorite(t.id)} />
          ))}
        </ul>
      )}
    </article>
  );
}
