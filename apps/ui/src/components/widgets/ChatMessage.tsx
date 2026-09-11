import { Card } from '../primitives/Card';
import { Badge } from '../primitives/Badge';
import { Markdown } from '../primitives/Markdown';

export type Role = 'user' | 'assistant' | 'tool';

export interface Attachment {
  type: 'image' | 'file';
  url: string;
  name: string;
}

export interface ChatMessageProps {
  role: Role;
  content: string;
  attachments?: Attachment[];
  createdAt?: string;
}

const roleVariant: Record<Role, 'info' | 'default' | 'muted'> = {
  user: 'info',
  assistant: 'default',
  tool: 'muted',
};

/**
 * Single chat message: role badge + markdown content + optional attachments grid.
 */
export function ChatMessage({ role, content, attachments, createdAt }: ChatMessageProps) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <Badge variant={roleVariant[role]} size="sm">{role}</Badge>
        {createdAt && (
          <span className="text-xs text-[var(--color-muted)]">{createdAt}</span>
        )}
      </div>
      <Card variant={role === 'user' ? 'outlined' : 'default'} className="p-3">
        <Markdown
          content={content}
          className="prose-sm text-[var(--color-text)] text-sm leading-relaxed [&_code]:font-mono [&_code]:text-[var(--color-accent)] [&_pre]:bg-[var(--color-bg)] [&_pre]:p-3 [&_pre]:rounded-md"
        />
        {attachments && attachments.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {attachments.map((a) => (
              <Card key={a.url} variant="outlined" className="p-1.5 flex items-center gap-2">
                {a.type === 'image' ? (
                  <img
                    src={a.url}
                    alt={a.name}
                    className="h-16 w-16 rounded object-cover"
                    width={64}
                    height={64}
                    style={{ aspectRatio: '1/1' }}
                  />
                ) : (
                  <span className="text-xs text-[var(--color-muted)] px-1">{a.name}</span>
                )}
              </Card>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
