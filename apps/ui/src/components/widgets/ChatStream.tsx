import { useEffect, useRef, useState } from 'react';
import { ChatMessage, type Role } from './ChatMessage';
import { Spinner } from '../primitives/Spinner';
import { Card } from '../primitives/Card';

export interface Message {
  id: string;
  role: Role;
  content: string;
  createdAt?: string;
}

export interface ChatStreamProps {
  /** SSE endpoint — defaults to /v1/chat/completions */
  endpoint?: string;
  /** Initial messages to display */
  initialMessages?: Message[];
}

/**
 * List of ChatMessage rows + EventSource consumer for SSE streaming.
 * Auto-scrolls to bottom as new tokens arrive.
 */
export function ChatStream({
  endpoint = '/v1/chat/completions',
  initialMessages = [],
}: ChatStreamProps) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [streaming, setStreaming] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const esRef = useRef<EventSource | null>(null);

  // Auto-scroll on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (typeof EventSource === 'undefined') return;
    setStreaming(true);
    const es = new EventSource(endpoint);
    esRef.current = es;

    let streamingId = `stream-${Date.now()}`;

    es.onmessage = (e) => {
      if (e.data === '[DONE]') {
        setStreaming(false);
        es.close();
        return;
      }
      try {
        const chunk = JSON.parse(e.data) as { delta?: string };
        const delta = chunk.delta ?? '';
        setMessages(prev => {
          const last = prev[prev.length - 1];
          if (last?.id === streamingId) {
            return [...prev.slice(0, -1), { ...last, content: last.content + delta }];
          }
          return [...prev, { id: streamingId, role: 'assistant', content: delta }];
        });
      } catch {
        // non-JSON chunk — ignore
      }
    };

    es.onerror = () => {
      setStreaming(false);
      es.close();
    };

    return () => { es.close(); };
  }, [endpoint]);

  return (
    <div className="flex flex-col gap-4 p-2">
      {messages.length === 0 && !streaming && (
        <Card variant="outlined" className="p-6 text-center text-sm text-[var(--color-muted)]">
          No messages yet. Start a conversation below.
        </Card>
      )}
      {messages.map(m => (
        <ChatMessage key={m.id} role={m.role} content={m.content} createdAt={m.createdAt} />
      ))}
      {streaming && <Spinner size="sm" />}
      <div ref={bottomRef} />
    </div>
  );
}
