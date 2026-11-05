import { useCallback, useEffect, useState } from 'react';
import { loadPrefs, resolveTheme, savePrefs, type ThemePref } from '../lib/prefs.ts';

const LIGHT_QUERY = '(prefers-color-scheme: light)';

function systemLight(): boolean {
  try {
    return window.matchMedia(LIGHT_QUERY).matches;
  } catch {
    return false;
  }
}

function apply(pref: ThemePref) {
  const resolved = resolveTheme(pref, systemLight());
  const root = document.documentElement;
  root.setAttribute('data-theme', resolved);
  root.setAttribute('data-theme-pref', pref);
  root.style.colorScheme = resolved;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolved === 'light' ? '#f5f3fc' : '#0a0a14');
}

export function useTheme() {
  const [pref, setPrefState] = useState<ThemePref>(() => loadPrefs().theme);

  useEffect(() => {
    apply(pref);
    if (pref !== 'auto') return;
    // Auto: follow OS changes immediately.
    const mq = window.matchMedia(LIGHT_QUERY);
    const onChange = () => apply('auto');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [pref]);

  // Enable colour transitions only after the first paint.
  useEffect(() => {
    const id = requestAnimationFrame(() => requestAnimationFrame(() => document.documentElement.classList.add('theme-ready')));
    return () => cancelAnimationFrame(id);
  }, []);

  const setPref = useCallback((p: ThemePref) => {
    setPrefState(p);
    savePrefs({ theme: p });
  }, []);

  return { pref, setPref };
}
