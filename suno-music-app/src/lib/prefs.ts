/**
 * Per-browser preferences (theme, preferred genres, vocal/instrumental, player modes).
 * Stored under their own key — the song history (`ams.history.v1`) is never touched here.
 */
export type ThemePref = 'light' | 'dark' | 'auto';
export type RepeatMode = 'off' | 'all' | 'one';

export interface Prefs {
  theme: ThemePref;
  genres: string[];
  instrumental: boolean;
  shuffle: boolean;
  repeat: RepeatMode;
}

export const PREFS_KEY = 'ams.prefs.v1';

export const DEFAULT_PREFS: Prefs = { theme: 'auto', genres: [], instrumental: false, shuffle: false, repeat: 'off' };

export function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    const p = raw ? JSON.parse(raw) : {};
    return {
      theme: p.theme === 'light' || p.theme === 'dark' || p.theme === 'auto' ? p.theme : DEFAULT_PREFS.theme,
      genres: Array.isArray(p.genres) ? p.genres.filter((g: unknown) => typeof g === 'string').slice(0, 6) : DEFAULT_PREFS.genres,
      instrumental: typeof p.instrumental === 'boolean' ? p.instrumental : DEFAULT_PREFS.instrumental,
      shuffle: typeof p.shuffle === 'boolean' ? p.shuffle : DEFAULT_PREFS.shuffle,
      repeat: p.repeat === 'all' || p.repeat === 'one' || p.repeat === 'off' ? p.repeat : DEFAULT_PREFS.repeat,
    };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

/** Merges a partial update into the stored preferences. */
export function savePrefs(update: Partial<Prefs>): void {
  try {
    // Merge with only what was explicitly saved before, so untouched preferences stay unset.
    let stored: Record<string, unknown> = {};
    try {
      const parsed = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}');
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) stored = parsed;
    } catch {
      stored = {};
    }
    localStorage.setItem(PREFS_KEY, JSON.stringify({ ...stored, ...update }));
  } catch {
    /* storage unavailable */
  }
}

/** Has the user ever saved a value for this preference? */
export function hasPref(key: keyof Prefs): boolean {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    return Boolean(raw && key in JSON.parse(raw));
  } catch {
    return false;
  }
}

export function resolveTheme(pref: ThemePref, systemPrefersLight: boolean): 'light' | 'dark' {
  if (pref === 'auto') return systemPrefersLight ? 'light' : 'dark';
  return pref;
}
