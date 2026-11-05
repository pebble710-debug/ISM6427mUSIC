import { useState } from 'react';
import type { Track } from '../../shared/types.ts';
import type { HistoryItem } from '../lib/history.ts';
import type { Player } from '../hooks/usePlayer.ts';
import { MusicNoteIcon } from './Icons.tsx';
import { TaskCard } from './TaskCard.tsx';

export function Library({ items, player, onRemove, onClear, onResume, onDownload, downloadingId }: {
  items: HistoryItem[];
  player: Player;
  onRemove: (taskId: string) => void;
  onClear: () => void;
  onResume: (taskId: string) => void;
  onDownload: (taskId: string, t: Track) => void;
  downloadingId: string | null;
}) {
  const [filter, setFilter] = useState('');
  const q = filter.trim().toLowerCase();
  const visible = q
    ? items.filter((i) =>
        [i.request.prompt, i.request.title, i.request.style, ...i.tracks.map((t) => `${t.title} ${t.tags}`)]
          .join(' ')
          .toLowerCase()
          .includes(q),
      )
    : items;

  return (
    <section className="panel library" aria-labelledby="library-title">
      <div className="panel-head">
        <div>
          <h2 id="library-title">Library</h2>
          <p className="muted">{items.length ? `${items.length} generation${items.length === 1 ? '' : 's'} on this device` : 'Your songs will appear here.'}</p>
        </div>
        {items.length > 0 && (
          <button
            type="button"
            className="ghost-btn"
            onClick={() => {
              if (confirm('Clear your generation history on this device?')) onClear();
            }}
          >
            Clear
          </button>
        )}
      </div>

      {items.length > 2 && (
        <input className="search" type="search" placeholder="Search your library" aria-label="Search your library" value={filter} onChange={(e) => setFilter(e.target.value)} />
      )}

      {items.length === 0 ? (
        <div className="empty">
          <div className="empty-icon"><MusicNoteIcon width={34} height={34} /></div>
          <h3>No songs yet</h3>
          <p className="muted">Describe a song and press Generate. Progress, playback and downloads show up here.</p>
        </div>
      ) : (
        <div className="task-list">
          {visible.map((item) => (
            <TaskCard
              key={item.taskId}
              item={item}
              player={player}
              onRemove={() => onRemove(item.taskId)}
              onResume={() => onResume(item.taskId)}
              onDownload={(t) => onDownload(item.taskId, t)}
              downloadingId={downloadingId}
            />
          ))}
          {visible.length === 0 && <p className="muted center">No matches.</p>}
        </div>
      )}
    </section>
  );
}
