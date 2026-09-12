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
    <aside className="vf-sidebar flex">
      <div className="px-2 mb-6">
        <span className="vf-brand"><span className="vf-brand-mark" aria-hidden="true">S</span>Spargax VibeFlare</span>
      </div>
      <nav className="vf-navigation">
        {NAV_LINKS.map(({ href, label, icon }) => {
          const active = activePath.startsWith(href);
          return (
            <a
              key={href}
              href={href}
              className={[
                'vf-nav-link',
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
