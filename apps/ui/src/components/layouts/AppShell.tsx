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
    <div className="flex h-screen overflow-hidden bg-[var(--color-bg)]">
      <Sidebar activePath={activePath} />
      <div className="flex flex-col flex-1 min-w-0">
        <TopBar title={title} />
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
