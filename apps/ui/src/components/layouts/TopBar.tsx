import { useEffect, useState, type ReactNode } from 'react';
import { Button } from '../primitives/Button';
import { Icon } from '../primitives/Icon';
import { DailyUsage } from '../widgets/DailyUsage';
import { toggleTheme, getTheme, type ThemeMode } from '../../lib/theme';

export interface TopBarProps {
  /** Page title shown on the left */
  title?: ReactNode;
}

/**
 * Top navigation bar: page title slot + DailyUsage (compact) + theme toggle.
 */
export function TopBar({ title }: TopBarProps) {
  const [theme, setTheme] = useState<ThemeMode>('dark');

  useEffect(() => {
    setTheme(getTheme());
  }, []);

  function handleThemeToggle() {
    const next = toggleTheme();
    setTheme(next);
  }

  return (
    <header className="flex items-center justify-between h-14 px-6 border-b border-[var(--color-border)] bg-[var(--color-surface)] shrink-0">
      <div className="text-base font-semibold text-[var(--color-text)]">
        {title ?? 'VibeFlare'}
      </div>
      <div className="flex items-center gap-4">
        <DailyUsage compact />
        <Button
          variant="ghost"
          size="sm"
          aria-label="Toggle theme"
          onClick={handleThemeToggle}
          leftIcon={<Icon name={theme === 'dark' ? 'Sun' : 'Moon'} size="sm" />}
        >
          {theme === 'dark' ? 'Light' : 'Dark'}
        </Button>
      </div>
    </header>
  );
}
