import type { Track } from '../../shared/types.ts';
import type { HistoryItem } from '../lib/history.ts';
import type { LibraryView, SortOrder, VisibleItem } from '../lib/library.ts';
import type { Player } from '../hooks/usePlayer.ts';
import { HeartIcon, MusicNoteIcon } from './Icons.tsx';
import { Segmented } from './Segmented.tsx';
import { TaskCard } from './TaskCard.tsx';

export function Library({ items, visible, view, onViewChange, favorites, onToggleFavorite, player, onRemove, onClear, onResume, onDownload, downloadingId }: {
  items: HistoryItem[];
  visible: VisibleItem[];
  view: LibraryView;
  onViewChange: (v: LibraryView) => void;
  favorites: Set<string>;
  onToggleFavorite: (trackId: string) => void;
  player: Player;
  onRemove: (taskId: string) => void;
  onClear: () => void;
  onResume: (taskId: string) => void;
  onDownload: (taskId: string, t: Track) => void;
  downloadingId: string | null;
}) {
  const favCount = items.reduce((n, i) => n + i.tracks.filter((t) => favorites.has(t.id)).length, 0);

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

      {items.length > 0 && (
        <div className="library-toolbar">
          <input
            className="search"
            type="search"
            placeholder="Search songs by title"
            aria-label="Search songs by title"
            value={view.query}
            onChange={(e) => onViewChange({ ...view, query: e.target.value })}
          />
          <select aria-label="Sort library" value={view.sort} onChange={(e) => onViewChange({ ...view, sort: e.target.value as SortOrder })}>
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="title">Title A–Z</option>
          </select>
          <Segmented
            label="Library filter"
            value={view.favoritesOnly ? 'fav' : 'all'}
            onChange={(v) => onViewChange({ ...view, favoritesOnly: v === 'fav' })}
            options={[
              { value: 'all', label: 'All' },
              { value: 'fav', label: <><HeartIcon width={14} height={14} filled={view.favoritesOnly} /> Favorites {favCount > 0 && <span className="fav-count">{favCount}</span>}</>, ariaLabel: 'Favorites' },
            ]}
          />
        </div>
      )}

      {items.length === 0 ? (
        <div className="empty">
          <div className="empty-icon"><MusicNoteIcon width={34} height={34} /></div>
          <h3>No songs yet</h3>
          <p className="muted">Describe a song and press Generate. Progress, playback and downloads show up here.</p>
        </div>
      ) : (
        <div className="task-list">
          {visible.map(({ item, tracks }) => (
            <TaskCard
              key={item.taskId}
              item={item}
              tracks={tracks}
              player={player}
              favorites={favorites}
              onToggleFavorite={onToggleFavorite}
              onRemove={() => onRemove(item.taskId)}
              onResume={() => onResume(item.taskId)}
              onDownload={(t) => onDownload(item.taskId, t)}
              downloadingId={downloadingId}
            />
          ))}
          {visible.length === 0 && (
            <p className="muted center" data-testid="library-empty-filter">
              {view.favoritesOnly && !view.query ? 'No favorites yet — tap the heart on a finished song.' : 'No songs match your search.'}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
