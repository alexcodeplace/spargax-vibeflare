import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { parseHistoryMetadata, type HistoryMetadata } from '@vibeflare/shared';
import { HistoryAttachments } from './HistoryAttachments';
import { createChat, getChatMessages, notifyModelsChanged, notifyQuotaChanged, redirectToLoginOnce, uploadFile } from '../../lib/api';
import {
  ChatComposer,
  ChatComposerDrawer,
  ChatComposerInput,
  ChatLayout,
  ChatMessage as AstryxChatMessage,
  ChatMessageBubble,
  ChatMessageList,
} from '@astryxdesign/core/Chat';
import { Avatar } from '@astryxdesign/core/Avatar';
import { Icon } from '../primitives/Icon';
import { BrandArtwork } from '../brand/BrandArtwork';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Markdown } from '@astryxdesign/core/Markdown';
import { Heading, Text } from '@astryxdesign/core/Text';
import { Token } from '@astryxdesign/core/Token';
import { AudioTranscribePanel } from './AudioTranscribePanel';
import { ModelPicker } from './ModelPicker';
import { Card } from '../primitives/Card';
import { Badge } from '../primitives/Badge';
import { Tabs } from '../primitives/Tabs';
import { Toast } from '../primitives/Toast';
import { HydratedIsland } from '../HydratedIsland';
import { Spinner } from '../primitives/Spinner';
import { cacheCreatedChat, notifyChatNavigation, refreshChats } from '../../lib/api/chats';

let msgCounter = 0;
function nextId() { return `msg-${++msgCounter}`; }

interface UiMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  attachments?: HistoryMetadata | null;
}

const TASK_ITEMS = [
  { value: 'text-generation', label: 'Text' },
  { value: 'text-to-image', label: 'Image' },
  { value: 'text-embeddings', label: 'Embeddings' },
  { value: 'automatic-speech-recognition', label: 'Audio' },
];

const chatFill: CSSProperties = { minHeight: 0, flex: 1 };
const composerInputStyle: CSSProperties = { minHeight: 90 };

const STARTERS = [
  { title: 'Think it through', detail: 'Turn a thought into a plan', art: 'lightbulb-glass' as const, prompt: 'Help me think through an idea. Ask me a few questions to understand what I am trying to achieve.' },
  { title: 'Build something', detail: 'Work through code together', art: 'workflow-panels' as const, prompt: 'Help me build a small project. First, ask what I want to make and which tools I use.' },
  { title: 'Make it clearer', detail: 'Find the words that fit', art: 'template-panels' as const, prompt: 'Help me make a piece of writing clearer. Ask me for the text and who it is for.' },
];

/**
 * VibeFlare's chat follows Astryx's AI Chat Landing for the zero state and
 * AI Chat Conversation for active threads. Product-specific controls (model,
 * task, files and provider calls) stay thin around those templates.
 */
function ChatPageInner() {
  const [activeTask, setActiveTask] = useState('text-generation');
  const [model, setModel] = useState('');
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState<Array<{ id: string; name: string }>>([]);
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const composerRef = useRef<HTMLDivElement>(null);

  const [imagePrompt, setImagePrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);

  const [toast, setToast] = useState<{ open: boolean; title: string; variant: 'default' | 'danger' }>({
    open: false,
    title: '',
    variant: 'default',
  });
  const notify = (title: string, variant: 'default' | 'danger' = 'default') => {
    setToast({ open: true, title, variant });
  };

  const [loadingHistory, setLoadingHistory] = useState(true);
  const chatIdRef = useRef<string | null>(null);
  const operationRef = useRef(false);
  const [audioBusy, setAudioBusy] = useState(false);
  const busy = sending || generating || audioBusy || loadingHistory;

  useEffect(() => () => abortRef.current?.abort(), []);

  const isImageMode = activeTask === 'text-to-image';
  const isAudioMode = activeTask === 'automatic-speech-recognition';
  const isEmbeddingMode = activeTask === 'text-embeddings';

  async function loadHistory(id: string, signal: AbortSignal) {
    const detail = await getChatMessages(id, signal);
    if (signal.aborted || chatIdRef.current !== id) return;
    const history: UiMessage[] = detail.messages
      .filter(message => message.role === 'user' || message.role === 'assistant')
      .map(message => ({ id: message.id, role: message.role as 'user' | 'assistant', content: message.content, attachments: parseHistoryMetadata(message.attachments) }));
    const task = [...history].reverse().find(message => message.attachments)?.attachments?.task ?? detail.chat.task ?? 'text-generation';
    setActiveTask(task);
    setModel(detail.chat.model);
    setMessages(history);
    refreshChats();
  }

  useEffect(() => {
    const cid = new URLSearchParams(window.location.search).get('chat_id');
    if (!cid) { setLoadingHistory(false); return; }
    const controller = new AbortController();
    chatIdRef.current = cid;
    void loadHistory(cid, controller.signal)
      .catch(() => {
        if (controller.signal.aborted) return;
        chatIdRef.current = null;
        notify('This chat could not be loaded.', 'danger');
      })
      .finally(() => { if (!controller.signal.aborted) setLoadingHistory(false); });
    return () => controller.abort();
  }, []);

  async function ensureConversation(title: string, signal: AbortSignal): Promise<string> {
    if (chatIdRef.current) return chatIdRef.current;
    const chat = await createChat(title, model, signal);
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    chatIdRef.current = chat.id;
    const location = new URL(window.location.href);
    location.searchParams.set('chat_id', chat.id);
    window.history.replaceState(null, '', location.toString());
    await cacheCreatedChat(chat);
    notifyChatNavigation();
    return chat.id;
  }

  function handleTaskChange(task: string) {
    if (operationRef.current || audioBusy || loadingHistory) return;
    setActiveTask(task);
    setModel('');
    setMessages([]);
    chatIdRef.current = null;
    setImageError(null);
    setAttachedFiles([]);
    setInput('');
    setImagePrompt('');
    const url = new URL(window.location.href);
    url.searchParams.delete('chat_id');
    window.history.replaceState(null, '', url.toString());
    notifyChatNavigation();
  }

  const handleModelChange = useCallback((name: string, task: string) => {
    setModel(name);
    if (task) setActiveTask(task);
  }, []);

  async function addFiles(files: File[]) {
    if (files.length === 0) return;
    setUploadingFiles(true);
    try {
      const records = await Promise.all(files.map(uploadFile));
      setAttachedFiles((previous) => [
        ...previous,
        ...records.map((record) => ({ id: record.id, name: record.name })),
      ]);
    } catch (error) {
      notify(error instanceof Error ? error.message : 'File upload failed', 'danger');
    } finally {
      setUploadingFiles(false);
    }
  }

  async function sendMessage(value = input) {
    const text = value.trim();
    if (!text || operationRef.current || busy) return;
    if (!model) {
      notify('Choose a model first.');
      return;
    }

    operationRef.current = true;
    const userMessage: UiMessage = { id: nextId(), role: 'user', content: text };
    const assistantId = nextId();
    setMessages((previous) => [
      ...previous,
      userMessage,
      { id: assistantId, role: 'assistant', content: '' },
    ]);
    setInput('');
    setSending(true);
    abortRef.current = new AbortController();

    try {
      const activeChatId = await ensureConversation(text, abortRef.current.signal);
      if (isEmbeddingMode) {
        const response = await fetch(`/v1/embeddings?chat_id=${encodeURIComponent(activeChatId)}`, {
          method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'x-vf-browser': '1' },
          body: JSON.stringify({ model, input: text }), signal: abortRef.current.signal,
        });
        if (response.status === 401) { redirectToLoginOnce(); return; }
        if (!response.ok) {
          const error = await response.json().catch(() => ({})) as { error?: { type?: string; message?: string } };
          if (error.error?.type === 'paid_plan_required' || error.error?.type === 'paid_model_excluded') notifyModelsChanged();
          throw new Error(error.error?.message ?? `Request failed (${response.status})`);
        }
        await loadHistory(activeChatId, abortRef.current.signal);
        notifyQuotaChanged();
        return;
      }
      const url = new URL('/v1/chat/completions', window.location.origin);
      url.searchParams.set('chat_id', activeChatId);
      const response = await fetch(url.toString(), {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          'x-vf-browser': '1',
        },
        body: JSON.stringify({
          model,
          stream: true,
          messages: [...messages, userMessage].map((message) => ({ role: message.role, content: message.content })),
          ...(attachedFiles.length > 0 ? { file_ids: attachedFiles.map((file) => file.id) } : {}),
        }),
        signal: abortRef.current.signal,
      });

      if (response.status === 401) {
        redirectToLoginOnce();
        return;
      }
      if (!response.ok) {
        const error = await response.json().catch(() => ({})) as { error?: { type?: string; message?: string } };
        if (error.error?.type === 'paid_plan_required' || error.error?.type === 'paid_model_excluded') notifyModelsChanged();
        throw new Error(error.error?.message ?? `Request failed (${response.status})`);
      }
      if (!response.body) throw new Error('The model returned an empty response.');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let doneEvent = false;
      while (!doneEvent) {
        const { done, value: chunkValue } = await reader.read();
        if (done) break;
        buffer += decoder.decode(chunkValue, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') {
            doneEvent = true;
            break;
          }
          try {
            const chunk = JSON.parse(data) as { choices?: Array<{ delta?: { content?: string } }> };
            const delta = chunk.choices?.[0]?.delta?.content ?? '';
            if (delta) {
              setMessages((previous) => previous.map((message) =>
                message.id === assistantId ? { ...message, content: message.content + delta } : message
              ));
            }
          } catch {
            // Ignore SSE comments/non-JSON protocol lines.
          }
        }
      }
      notifyQuotaChanged();
      refreshChats();
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        setMessages((previous) => previous.map((message) =>
          message.id === assistantId && !message.content ? { ...message, content: 'Stopped.' } : message
        ));
      } else {
        const message = error instanceof Error ? error.message : 'Request failed';
        setMessages((previous) => previous.map((item) =>
          item.id === assistantId ? { ...item, content: `Error: ${message}` } : item
        ));
      }
    } finally {
      operationRef.current = false;
      setSending(false);
      setAttachedFiles([]);
      abortRef.current = null;
    }
  }

  async function generateImage(value = imagePrompt) {
    const prompt = value.trim();
    if (!prompt || operationRef.current || busy) return;
    if (!model) { notify('Choose an image model first.'); return; }
    operationRef.current = true;
    setGenerating(true);
    setImageError(null);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const id = await ensureConversation(prompt, controller.signal);
      const response = await fetch(`/v1/images/generations?chat_id=${encodeURIComponent(id)}`, {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'x-vf-browser': '1' },
        body: JSON.stringify({ model, prompt, n: 1, response_format: 'url' }), signal: controller.signal,
      });
      if (response.status === 401) { redirectToLoginOnce(); return; }
      if (!response.ok) {
        const error = await response.json().catch(() => ({})) as { error?: { type?: string; message?: string } };
        if (error.error?.type === 'paid_plan_required' || error.error?.type === 'paid_model_excluded') notifyModelsChanged();
        throw new Error(error.error?.message ?? `Request failed (${response.status})`);
      }
      await loadHistory(id, controller.signal);
      if (controller.signal.aborted) return;
      setImagePrompt('');
      notifyQuotaChanged();
    } catch (error) {
      if (!controller.signal.aborted) {
        // The composer clears on submit; restore failed input without replacing
        // a different prompt the user started typing while the request ran.
        setImagePrompt(current => current.trim() ? current : prompt);
        setImageError(error instanceof Error ? error.message : 'Image generation failed');
      }
    } finally {
      operationRef.current = false;
      // A user cancellation remains usable without switching to another task.
      setGenerating(false);
      abortRef.current = null;
    }
  }

  const attachmentDrawer = attachedFiles.length > 0 ? (
    <ChatComposerDrawer count={attachedFiles.length}>
      {attachedFiles.map((file) => (
        <Token
          key={file.id}
          label={file.name}
          onRemove={() => setAttachedFiles((previous) => previous.filter((candidate) => candidate.id !== file.id))}
        />
      ))}
    </ChatComposerDrawer>
  ) : undefined;

  const textComposer = (
    <div className="vf-composer-wrap" ref={composerRef}>
    <ChatComposer
      value={input}
      onChange={setInput}
      onSubmit={sendMessage}
      onStop={() => abortRef.current?.abort()}
      isStopShown={sending}
      isDisabled={uploadingFiles || !model || loadingHistory}
      placeholder="Ask anything"
      drawer={attachmentDrawer}
      input={
        <ChatComposerInput
          value={input}
          isDisabled={!model || loadingHistory}
          aria-disabled={!model || loadingHistory}
          onChange={setInput}
          onSubmit={sendMessage}
          onFiles={(files) => void addFiles(files)}
          pasteAsToken={false}
          style={composerInputStyle}
        />
      }
      headerActions={
        <HStack gap={1} vAlign="center">
          <Icon name="Upload" size="sm" />
          <Text type="supporting" color="secondary">
            {uploadingFiles ? 'Uploading…' : 'Drop or paste files here'}
          </Text>
        </HStack>
      }
    />
    </div>
  );

  const textSurface = loadingHistory ? (
    <div className="flex min-h-[360px] items-center justify-center"><Spinner size="lg" /></div>
  ) : messages.length === 0 ? (
    <div className="vf-chat-welcome">
      <div className="vf-welcome-heading">
        <div className="vf-welcome-emblem"><BrandArtwork name="lightning-glass" size={64}/></div>
        <p className="vf-eyebrow">A LITTLE SPARK GOES A LONG WAY</p>
        <h1>What do you want to make?</h1>
        <p>A thought, a first draft, a working prototype.<br />Pick a model and start wherever you are.</p>
      </div>
      {textComposer}
      <div className="vf-composer-hint"><span>Enter to send · Shift + Enter for a new line</span><span>Your next idea starts here.</span></div>
      <div className="vf-starters" aria-label="Conversation starters">
        {STARTERS.map(starter => <button type="button" key={starter.title} className="vf-starter" data-vf-spotlight data-testid="vf-prompt-starter"
          onClick={() => {
            setInput(starter.prompt);
            requestAnimationFrame(() => composerRef.current?.querySelector<HTMLElement>('[contenteditable="true"], textarea')?.focus());
          }}>
          <BrandArtwork name={starter.art} size={44}/><span><strong>{starter.title}</strong><small>{starter.detail}</small></span>
        </button>)}
      </div>
    </div>
  ) : (
    <ChatLayout density="spacious" style={chatFill} composer={textComposer}>
      <ChatMessageList align="top" isStreaming={sending}>
        {messages.map((message) => (
          <AstryxChatMessage
            key={message.id}
            sender={message.role}
            avatar={message.role === 'assistant' ? <Avatar name="VibeFlare" size="md" /> : undefined}
          >
            <ChatMessageBubble variant={message.role === 'assistant' ? 'ghost' : 'filled'}>
              {message.role === 'assistant' ? (
                <Markdown density="compact" isStreaming={sending && message.id === messages.at(-1)?.id}>
                  {message.content || 'Thinking…'}
                </Markdown>
              ) : message.content}
              <HistoryAttachments metadata={message.attachments} prompt={message.content} />
            </ChatMessageBubble>
          </AstryxChatMessage>
        ))}
      </ChatMessageList>
    </ChatLayout>
  );

  const imageSurface = (
    <VStack gap={4} height="100%">
      {imageError && <Badge variant="danger">{imageError}</Badge>}
      {!messages.length && <VStack gap={2} vAlign="center" style={{ minHeight: 180 }}>
        <Heading level={1}>Create an image</Heading>
        <Text color="secondary">Describe what you want. Your prompts and images will be saved in history.</Text>
      </VStack>}
      {messages.map((message, index) => <Card key={message.id} variant="outlined" className="space-y-3 overflow-hidden p-4">
        <p className="whitespace-pre-wrap text-sm text-[var(--color-text)]">{message.content}</p>
        <HistoryAttachments metadata={message.attachments} prompt={messages[index - 1]?.content ?? message.content} />
      </Card>)}
      <div className="w-full max-w-[720px]">
        <ChatComposer value={imagePrompt} onChange={setImagePrompt} onSubmit={generateImage}
          onStop={() => abortRef.current?.abort()} isStopShown={generating} isDisabled={!model || loadingHistory}
          placeholder="Describe the image you want…"
          input={<ChatComposerInput value={imagePrompt} onChange={setImagePrompt} onSubmit={generateImage} isDisabled={!model || loadingHistory} pasteAsToken={false} />} />
      </div>
    </VStack>
  );

  return (
    <div className="vf-chat flex h-full min-w-0 flex-col" data-testid="vibeflare-chat">
      <Toast
        open={toast.open}
        onOpenChange={(open) => setToast((previous) => ({ ...previous, open }))}
        title={toast.title}
        variant={toast.variant}
      />
      <div className="vf-chat-toolbar">
        <Tabs
          className="vf-task-tabs"
          items={TASK_ITEMS.map((task) => ({ value: task.value, label: task.label, content: null, disabled: busy }))}
          value={activeTask}
          onValueChange={handleTaskChange}
          variant="segmented"
        />
        <div className="vf-model-control" inert={busy ? true : undefined}>{!loadingHistory && <ModelPicker task={activeTask} value={model} onChange={handleModelChange} />}</div>
      </div>
      <div className="vf-chat-content">
        {loadingHistory ? <div className="flex min-h-[360px] items-center justify-center"><Spinner size="lg" /></div> : isAudioMode ? <AudioTranscribePanel model={model} history={messages} ensureChat={ensureConversation} onSaved={loadHistory} onBusyChange={value => { operationRef.current = value; setAudioBusy(value); }} /> : isImageMode ? imageSurface : textSurface}
      </div>
    </div>
  );
}

export function ChatPage() {
  return (
    <HydratedIsland>
      <ChatPageInner />
    </HydratedIsland>
  );
}
