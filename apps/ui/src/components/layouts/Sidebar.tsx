import { Icon } from '../primitives/Icon';
import type { IconName } from '../primitives/Icon';

interface NavLink {
  href: string;
  label: string;
  icon: IconName;
}

const NAV_LINKS: NavLink[] = [
  { href: '/chat',      label: 'Chat',       icon: 'MessageSquare' },
  { href: '/files',     label: 'Files',      icon: 'File' },
  { href: '/keys',      label: 'API Keys',   icon: 'Key' },
  { href: '/analytics', label: 'Analytics',  icon: 'BarChart2' },
  { href: '/settings',  label: 'Settings',   icon: 'Settings' },
];

export interface SidebarProps {
  activePath?: string;
}

/**
 * Left navigation sidebar with icon + label links.
 * Active link highlighted via --color-accent.
 */
export function Sidebar({ activePath = '' }: SidebarProps) {
  return (
    <aside className="flex flex-col w-56 shrink-0 border-r border-[var(--color-border)] bg-[var(--color-surface)] h-full min-h-screen px-3 py-6 gap-1">
      <div className="px-2 mb-6">
        <span className="text-base font-bold text-[var(--color-accent)] tracking-tight">VibeFlare</span>
      </div>
      <nav className="flex flex-col gap-1">
        {NAV_LINKS.map(({ href, label, icon }) => {
          const active = activePath.startsWith(href);
          return (
            <a
              key={href}
              href={href}
              className={[
                'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                active
                  ? 'bg-[var(--color-accent)]/10 text-[var(--color-accent)]'
                  : 'text-[var(--color-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-border)]/40',
              ].join(' ')}
              aria-current={active ? 'page' : undefined}
            >
              <Icon name={icon} size="sm" />
              {label}
            </a>
          );
        })}
      </nav>
    </aside>
  );
}
