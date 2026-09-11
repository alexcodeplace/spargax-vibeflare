import { CodeBlock as AstryxCodeBlock } from '@astryxdesign/core/CodeBlock';

export interface CodeBlockProps {
  code: string;
  language?: string;
  className?: string;
}

export function CodeBlock({ code, language = 'text', className }: CodeBlockProps) {
  return <AstryxCodeBlock code={code} language={language} className={className} />;
}
