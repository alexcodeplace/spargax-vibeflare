/** Theme mode persisted for the root Astryx neutral theme. */
export type ThemeMode = 'dark' | 'light';

const THEME_KEY = 'vf-theme';

/** Get the persisted preference. Invalid/stale values fail closed to dark. */
export function getTheme(): ThemeMode {
  if (typeof localStorage === 'undefined') return 'dark';
  return localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark';
}

/**
 * Astryx resolves light-dark() tokens from the root data-theme/color-scheme.
 * Keep both modes explicit: removing data-theme means "system", not "dark".
 */
export function setTheme(mode: ThemeMode): void {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-astryx-theme', 'neutral');
  document.documentElement.setAttribute('data-theme', mode);
  if (typeof localStorage !== 'undefined') localStorage.setItem(THEME_KEY, mode);
}

export function toggleTheme(): ThemeMode {
  const next = getTheme() === 'dark' ? 'light' : 'dark';
  setTheme(next);
  return next;
}

/** Call on app boot to restore the persisted theme. */
export function initTheme(): void {
  setTheme(getTheme());
}
