import type { Track } from '../../shared/types.ts';
import type { HistoryItem } from './history.ts';

export type SortOrder = 'newest' | 'oldest' | 'title';

export interface LibraryView {
  query: string;
  sort: SortOrder;
  favoritesOnly: boolean;
}

export interface VisibleItem {
  item: HistoryItem;
  /** Tracks to show for this item (only favorites when the Favorites filter is on). */
  tracks: Track[];
}

export function itemTitle(item: HistoryItem): string {
  return item.tracks[0]?.title || item.request.title || item.request.prompt || item.request.style || '';
}

/**
 * Filters and sorts the library for display. Pure — never mutates or drops saved history.
 * Search matches song titles (and the request's title/description so in-progress items are findable).
 */
export function selectLibrary(items: HistoryItem[], view: LibraryView, favorites: Set<string>): VisibleItem[] {
  const q = view.query.trim().toLowerCase();
  let out: VisibleItem[] = items.map((item) => ({ item, tracks: item.tracks }));

  if (view.favoritesOnly) {
    out = out
      .map((v) => ({ ...v, tracks: v.tracks.filter((t) => favorites.has(t.id)) }))
      .filter((v) => v.tracks.length > 0);
  }

  if (q) {
    out = out
      .map((v) => {
        const requestMatch = [v.item.request.title, v.item.request.prompt].some((s) => s?.toLowerCase().includes(q));
        const matching = v.tracks.filter((t) => t.title.toLowerCase().includes(q));
        return { ...v, tracks: matching.length ? matching : requestMatch ? v.tracks : [], match: matching.length > 0 || requestMatch };
      })
      .filter((v) => v.match)
      .map(({ item, tracks }) => ({ item, tracks }));
  }

  const sorted = [...out];
  if (view.sort === 'newest') sorted.sort((a, b) => b.item.createdAt - a.item.createdAt);
  else if (view.sort === 'oldest') sorted.sort((a, b) => a.item.createdAt - b.item.createdAt);
  else {
    const title = (v: VisibleItem) => (v.tracks[0]?.title || itemTitle(v.item)).toLowerCase();
    sorted.sort((a, b) => title(a).localeCompare(title(b)) || b.item.createdAt - a.item.createdAt);
  }
  return sorted;
}
