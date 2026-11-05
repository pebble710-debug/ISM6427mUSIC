/* Runs synchronously in <head>, before the stylesheet paints, so the page never flashes
   the wrong theme. Kept as an external file because the CSP disallows inline scripts.
   Mirrors resolveTheme() in src/lib/prefs.ts. */
(function () {
  var pref = 'auto';
  try {
    var raw = localStorage.getItem('ams.prefs.v1');
    var parsed = raw ? JSON.parse(raw) : null;
    if (parsed && (parsed.theme === 'light' || parsed.theme === 'dark' || parsed.theme === 'auto')) pref = parsed.theme;
  } catch (e) { /* storage unavailable: use auto */ }
  var dark = true;
  try { dark = pref === 'dark' || (pref === 'auto' && !window.matchMedia('(prefers-color-scheme: light)').matches); } catch (e) {}
  var root = document.documentElement;
  root.setAttribute('data-theme', dark ? 'dark' : 'light');
  root.setAttribute('data-theme-pref', pref);
  root.style.colorScheme = dark ? 'dark' : 'light';
})();
