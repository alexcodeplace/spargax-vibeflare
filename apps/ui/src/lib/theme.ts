/** Theme mode persisted across Astro navigation, with a memory fallback for restricted storage. */
export type ThemeMode = 'dark' | 'light';
const THEME_KEY = 'vf-theme';
export const THEME_CHANGED_EVENT = 'vf:theme-changed';
let memoryTheme: ThemeMode | undefined;
export function getTheme(): ThemeMode {
  if (typeof document === 'undefined') return 'dark';
  // A user choice in this document wins even when storage can be read but not written.
  if (memoryTheme) return memoryTheme;
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch { /* Browser storage policy does not disable the theme control. */ }
  return memoryTheme ?? (document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');
}
export function setTheme(mode: ThemeMode): void {
  if (typeof document === 'undefined') return;
  memoryTheme = mode;
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
