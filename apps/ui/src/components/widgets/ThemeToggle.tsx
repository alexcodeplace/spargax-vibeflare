import { useEffect, useState } from 'react';
import { Button } from '../primitives/Button';
import { Icon } from '../primitives/Icon';
import { toggleTheme, THEME_CHANGED_EVENT, type ThemeMode } from '../../lib/theme';

/**
 * Tiny theme-toggle island. Mounted with client:idle in TopBar.astro.
 * Reads persisted theme from localStorage and toggles on click.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<ThemeMode>('dark');

  useEffect(() => {
    const sync = () => setTheme(document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');
    sync();
    window.addEventListener(THEME_CHANGED_EVENT, sync);
    return () => window.removeEventListener(THEME_CHANGED_EVENT, sync);
  }, []);

  function handleToggle() {
    const next = toggleTheme();
    setTheme(next);
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      aria-label="Toggle theme"
      onClick={handleToggle}
      leftIcon={<Icon name={theme === 'dark' ? 'Sun' : 'Moon'} size="sm" />}
    >
      {theme === 'dark' ? 'Light' : 'Dark'}
    </Button>
  );
}
