import { lazy, Suspense } from 'react';

const MarkdownImpl = lazy(() => import('./MarkdownImpl'));

export interface MarkdownProps {
  content: string;
  className?: string;
}

/**
 * Thin wrapper that lazy-loads the heavy markdown renderer (marked + DOMPurify).
 * Suspense fallback is null — content appears once the chunk loads (first render only).
 * Heavy deps are split into their own async chunk, away from the initial bundle.
 */
export function Markdown({ content, className }: MarkdownProps) {
  return (
    <Suspense fallback={null}>
      <MarkdownImpl content={content} className={className} />
    </Suspense>
  );
}
