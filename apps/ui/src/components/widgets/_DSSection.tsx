import type { ReactNode } from 'react';
import { Card } from '../primitives/Card';
import { CodeBlock } from '../primitives/CodeBlock';

export interface DSSectionProps {
  title: string;
  description?: string;
  children: ReactNode;
  code?: string;
}

/** Design-system gallery section — consistent section chrome for every primitive/widget showcase. */
export function DSSection({ title, description, children, code }: DSSectionProps) {
  return (
    <section className="space-y-4">
      <div className="border-b border-[var(--color-border)] pb-2">
        <h2 className="text-lg font-semibold text-[var(--color-text)]">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-[var(--color-muted)]">{description}</p>}
      </div>
      <Card variant="outlined" className="p-4">
        {children}
      </Card>
      {code && <CodeBlock language="tsx" code={code} />}
    </section>
  );
}
