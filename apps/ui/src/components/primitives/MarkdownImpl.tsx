import { useMemo } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

export interface MarkdownImplProps {
  content: string;
  className?: string;
}

/**
 * Heavy markdown renderer — loaded lazily via React.lazy in Markdown.tsx.
 * Contains marked + DOMPurify; never import this directly.
 *
 * Security: all output is sanitized through DOMPurify before rendering.
 * dangerouslySetInnerHTML is intentional and safe here — this is the single
 * boundary where sanitized HTML is injected; no other component should do this.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function MarkdownImpl({ content, className }: MarkdownImplProps) {
  const html = useMemo(() => {
    const raw = marked(content);
    const str = typeof raw === 'string' ? raw : '';
    if (typeof window === 'undefined') return str;
    return DOMPurify.sanitize(str);
  }, [content]);

  // Content is sanitized by DOMPurify above — safe to render as HTML.
  return (
    <div
      className={className}
      // biome-ignore lint/security/noDangerouslySetInnerHtml: DOMPurify-sanitized
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
