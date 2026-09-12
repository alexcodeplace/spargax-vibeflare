/** Theme mode persisted for the root Astryx theme with Spargax semantic colors. */
export type ThemeMode = 'dark' | 'light';
const THEME_KEY = 'vf-theme';
export const THEME_CHANGED_EVENT = 'vf:theme-changed';
export function getTheme(): ThemeMode {
  try { return localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark'; }
  catch { return typeof document !== 'undefined' && document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'; }
}
export function setTheme(mode: ThemeMode): void {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-astryx-theme', 'neutral');
  document.documentElement.setAttribute('data-theme', mode);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', mode === 'light' ? '#edf4fc' : '#061329');
  try { localStorage.setItem(THEME_KEY, mode); } catch { /* Private mode/storage policy: the UI still works. */ }
  window.dispatchEvent(new CustomEvent(THEME_CHANGED_EVENT, { detail: mode }));
}
export function toggleTheme(): ThemeMode {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  setTheme(next);
  return next;
}
export function initTheme(): void { setTheme(getTheme()); }
