import { type ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

export interface AppShellProps {
  /** Page content */
  children: ReactNode;
  /** Active path for sidebar highlight */
  activePath?: string;
  /** Title shown in TopBar */
  title?: ReactNode;
}

/**
 * Root application shell: Sidebar + TopBar + scrollable main content area.
 */
export function AppShell({ children, activePath, title }: AppShellProps) {
  return (
    <div className="vf-workspace">
      <Sidebar activePath={activePath} />
      <div className="vf-workspace-main">
        <TopBar title={title} />
        <main className="vf-main">
          {children}
        </main>
      </div>
    </div>
  );
}
