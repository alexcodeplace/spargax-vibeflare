import { DSSection } from './_DSSection';
import { MicButton } from '../primitives/MicButton';
import { AudioTranscribePanel } from './AudioTranscribePanel';
import { InviteTable } from './InviteTable';
import { InviteCreateModal } from './InviteCreateModal';
import type { InviteRecord } from '../../lib/api/invites';
import { Button } from '../primitives/Button';
import { Input } from '../primitives/Input';
import { Textarea } from '../primitives/Textarea';
import { Card } from '../primitives/Card';
import { Badge } from '../primitives/Badge';
import { Avatar } from '../primitives/Avatar';
import { Spinner } from '../primitives/Spinner';
import { Progress } from '../primitives/Progress';
import { Checkbox } from '../primitives/Checkbox';
import { Select } from '../primitives/Select';
import { Tabs } from '../primitives/Tabs';
import { Dialog } from '../primitives/Dialog';
import { Toast, ToastProvider } from '../primitives/Toast';
import { DailyUsage } from './DailyUsage';
import { FileDropzone } from './FileDropzone';
import { ChatMessage } from './ChatMessage';
import { ChatHistoryPage } from './ChatHistoryPage';
import { KeyRow } from './KeyRow';
import { AppShell } from '../layouts/AppShell';
import { Tooltip } from '../primitives/Tooltip';
import { Icon } from '../primitives/Icon';
import { CodeBlock } from '../primitives/CodeBlock';
import { useState } from 'react';
import { HydratedIsland } from '../HydratedIsland';

function DesignSystemGalleryInner() {
  const [toastOpen, setToastOpen] = useState(false);
  const [checked, setChecked] = useState(false);
  const [selectVal, setSelectVal] = useState('');

  return (
    <ToastProvider>
      <div className="space-y-12">

        {/* Button */}
        <DSSection
          title="Button"
          description="primary / secondary / ghost / outline / danger × sm / md / lg"
          code={`<Button variant="primary" size="md">Save</Button>\n<Button variant="secondary" size="sm">Cancel</Button>\n<Button variant="outline">Outline</Button>\n<Button variant="ghost" loading>Loading</Button>\n<Button variant="danger" size="lg">Delete</Button>`}
        >
          <div className="flex flex-wrap gap-3 items-center">
            {(['primary','secondary','ghost','outline','danger'] as const).map(v =>
              (['sm','md','lg'] as const).map(s => (
                <Button key={`${v}-${s}`} variant={v} size={s}>{v} {s}</Button>
              ))
            )}
            <Button loading>Loading</Button>
            <Button disabled>Disabled</Button>
          </div>
        </DSSection>

        {/* Input */}
        <DSSection
          title="Input"
          description="default / error variants, label, errorMessage"
          code={`<Input label="Email" placeholder="you@example.com" />\n<Input variant="error" errorMessage="Required" value="bad" />`}
        >
          <div className="flex flex-wrap gap-4 max-w-xl">
            <Input label="Default" placeholder="Type here…" />
            <Input label="Error" variant="error" errorMessage="This field is required" defaultValue="bad" />
            <Input label="Disabled" disabled defaultValue="readonly" />
          </div>
        </DSSection>

        {/* Textarea */}
        <DSSection
          title="Textarea"
          description="default / error × sm / md / lg"
          code={`<Textarea label="Notes" rows={3} />\n<Textarea variant="error" errorMessage="Too short" />`}
        >
          <div className="flex flex-wrap gap-4 max-w-xl">
            <Textarea label="Default" rows={3} placeholder="Write something…" />
            <Textarea label="Error" variant="error" errorMessage="Too short" rows={2} />
          </div>
        </DSSection>

        {/* Card */}
        <DSSection
          title="Card"
          description="default / outlined / elevated variants"
          code={`<Card>Default</Card>\n<Card variant="outlined">Outlined</Card>\n<Card variant="elevated">Elevated</Card>`}
        >
          <div className="grid grid-cols-3 gap-4">
            <Card className="p-4 text-sm text-[var(--color-muted)]">Default card</Card>
            <Card variant="outlined" className="p-4 text-sm text-[var(--color-muted)]">Outlined card</Card>
            <Card variant="elevated" className="p-4 text-sm text-[var(--color-muted)]">Elevated card</Card>
          </div>
        </DSSection>

        {/* Badge */}
        <DSSection
          title="Badge"
          description="default / success / warn / danger / info / muted / neutral × sm / md"
          code={`<Badge variant="success">Active</Badge>\n<Badge variant="neutral">Neutral</Badge>\n<Badge variant="danger" size="sm">Error</Badge>`}
        >
          <div className="flex flex-wrap gap-2 items-center">
            {(['default','success','warn','danger','info','muted','neutral'] as const).map(v => (
              <span key={v} className="flex gap-1 items-center">
                <Badge variant={v} size="md">{v} md</Badge>
                <Badge variant={v} size="sm">{v} sm</Badge>
              </span>
            ))}
          </div>
        </DSSection>

        {/* Avatar */}
        <DSSection
          title="Avatar"
          description="sm / md / lg with initials or image src"
          code={`<Avatar size="md" initials="AB" />\n<Avatar size="lg" src="/photo.jpg" alt="User" />`}
        >
          <div className="flex flex-wrap items-center gap-4">
            <Avatar size="sm" initials="SM" />
            <Avatar size="md" initials="MD" />
            <Avatar size="lg" initials="LG" />
            <Avatar size="md" src="https://i.pravatar.cc/40" alt="User" />
          </div>
        </DSSection>

        {/* Spinner */}
        <DSSection
          title="Spinner"
          description="sm / md / lg sizes"
          code={`<Spinner size="sm" />\n<Spinner size="md" />\n<Spinner size="lg" />`}
        >
          <div className="flex flex-wrap items-center gap-6">
            <Spinner size="sm" />
            <Spinner size="md" />
            <Spinner size="lg" />
          </div>
        </DSSection>

        {/* Progress */}
        <DSSection
          title="Progress"
          description="value/max, threshold coloring"
          code={`<Progress value={30} max={100} />\n<Progress value={75} max={100} />\n<Progress value={95} max={100} />`}
        >
          <div className="space-y-3 max-w-md">
            <Progress value={25} max={100} />
            <Progress value={60} max={100} />
            <Progress value={85} max={100} />
            <Progress value={98} max={100} />
          </div>
        </DSSection>

        {/* Checkbox */}
        <DSSection
          title="Checkbox"
          description="controlled and uncontrolled, with label"
          code={`<Checkbox label="Accept terms" checked={checked} onCheckedChange={setChecked} />`}
        >
          <div className="flex flex-wrap gap-4">
            <Checkbox label="Unchecked" />
            <Checkbox label="Checked" checked={checked} onCheckedChange={c => setChecked(c === true)} />
            <Checkbox label="Disabled" disabled />
          </div>
        </DSSection>

        {/* Select */}
        <DSSection
          title="Select"
          description="Radix Select with label and placeholder"
          code={`<Select\n  label="Model"\n  placeholder="Pick one"\n  options={[{value:'gpt4', label:'GPT-4'}]}\n  onValueChange={setSelectVal}\n/>`}
        >
          <div className="max-w-xs">
            <Select
              label="Model"
              placeholder="Pick a model…"
              value={selectVal}
              onValueChange={setSelectVal}
              options={[
                { value: 'gpt-4o', label: 'GPT-4o' },
                { value: 'claude-3-5-sonnet', label: 'Claude 3.5 Sonnet' },
                { value: 'gemini-2-flash', label: 'Gemini 2.0 Flash' },
              ]}
            />
          </div>
        </DSSection>

        {/* Tabs */}
        <DSSection
          title="Tabs"
          description="Radix Tabs with multiple tab panels"
          code={`<Tabs defaultValue="a">\n  <TabsList><TabsTrigger value="a">Tab A</TabsTrigger></TabsList>\n  <TabsContent value="a">Content A</TabsContent>\n</Tabs>`}
        >
          <Tabs
            defaultValue="tab1"
            items={[
              { value: 'tab1', label: 'Overview', content: <p className="text-sm text-[var(--color-muted)] pt-2">Overview content panel.</p> },
              { value: 'tab2', label: 'Details',  content: <p className="text-sm text-[var(--color-muted)] pt-2">Details content panel.</p> },
              { value: 'tab3', label: 'Settings', content: <p className="text-sm text-[var(--color-muted)] pt-2">Settings content panel.</p> },
            ]}
          />
        </DSSection>

        {/* Dialog */}
        <DSSection
          title="Dialog"
          description="Radix Dialog with trigger, title, description, footer"
          code={`<Dialog\n  trigger={<Button>Open</Button>}\n  title="Confirm"\n  description="Are you sure?"\n  footer={<Button variant="danger">Delete</Button>}\n>\n  Dialog body\n</Dialog>`}
        >
          <Dialog
            trigger={<Button variant="secondary">Open Dialog</Button>}
            title="Confirm action"
            description="This action cannot be undone."
            footer={
              <>
                <Button variant="ghost" size="sm">Cancel</Button>
                <Button variant="danger" size="sm">Confirm</Button>
              </>
            }
          >
            <p className="text-sm text-[var(--color-muted)]">Dialog body content goes here.</p>
          </Dialog>
        </DSSection>

        {/* Toast */}
        <DSSection
          title="Toast"
          description="Ephemeral notifications — default / success / warn / danger / info"
          code={`<Toast open={open} onOpenChange={setOpen} title="Saved" variant="success" />`}
        >
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" onClick={() => setToastOpen(true)}>Show Toast</Button>
            <Toast
              open={toastOpen}
              onOpenChange={setToastOpen}
              title="Changes saved"
              description="Your settings have been updated."
              variant="success"
            />
          </div>
        </DSSection>

        {/* Tooltip */}
        <DSSection
          title="Tooltip"
          description="Radix Tooltip with content prop"
          code={`<Tooltip content="Hello!"><Button size="sm">Hover me</Button></Tooltip>`}
        >
          <div className="flex gap-4 flex-wrap">
            <Tooltip content="This is a tooltip"><Button size="sm" variant="secondary">Hover me</Button></Tooltip>
            <Tooltip content="Icon tooltip"><span className="inline-flex"><Icon name="Info" /></span></Tooltip>
          </div>
        </DSSection>

        {/* Icon */}
        <DSSection
          title="Icon"
          description="lucide-react wrapper — sm / md / lg sizes"
          code={`<Icon name="Star" size="md" />\n<Icon name="Check" size="lg" />`}
        >
          <div className="flex flex-wrap items-center gap-4">
            {(['Star','Check','AlertCircle','Info','Settings','User','Key','BarChart2','File','MessageSquare'] as const).map(n => (
              <div key={n} className="flex flex-col items-center gap-1">
                <Icon name={n} size="lg" className="text-[var(--color-accent)]" />
                <span className="text-xs text-[var(--color-muted)]">{n}</span>
              </div>
            ))}
          </div>
        </DSSection>

        {/* CodeBlock */}
        <DSSection
          title="CodeBlock"
          description="Syntax-highlighted code display"
          code={`<CodeBlock language="tsx" code={'<Button>Hello</Button>'} />`}
        >
          <CodeBlock language="tsx" code={`<Button variant="primary" size="md" loading={false}>\n  Save changes\n</Button>`} />
        </DSSection>

        {/* ── Widgets ─────────────────────────────────────────────────── */}

        {/* DailyUsage */}
        <DSSection
          title="DailyUsage"
          description="Compact and full modes — fetches /admin/quota"
          code={`<DailyUsage />\n<DailyUsage compact />`}
        >
          <div className="flex flex-wrap gap-4 items-center">
            <span className="text-xs text-[var(--color-muted)]">full:</span>
            <div className="w-64"><DailyUsage /></div>
            <span className="text-xs text-[var(--color-muted)]">compact:</span>
            <DailyUsage compact />
          </div>
        </DSSection>

        {/* FileDropzone */}
        <DSSection
          title="FileDropzone"
          description="Drag-and-drop or click to upload — POSTs to /admin/files"
          code={`<FileDropzone onUploaded={f => console.log(f)} />`}
        >
          <div className="max-w-md"><FileDropzone /></div>
        </DSSection>

        {/* ChatMessage */}
        <DSSection
          title="ChatMessage"
          description="Single message: role badge + markdown content + attachments"
          code={`<ChatMessage role="user" content="Hello!" />\n<ChatMessage role="assistant" content="**Bold** and *italic*" />`}
        >
          <div className="space-y-3 max-w-xl">
            <ChatMessage role="user" content="Hello! Can you explain **Rust lifetimes**?" />
            <ChatMessage
              role="assistant"
              content="Sure! A lifetime `'a` tells the compiler how long a reference is valid.\n\n```rust\nfn longest<'a>(x: &'a str, y: &'a str) -> &'a str {\n  if x.len() > y.len() { x } else { y }\n}\n```"
            />
            <ChatMessage role="tool" content={'Tool call result: `{"status": 200}`'} />
          </div>
        </DSSection>

        {/* KeyRow */}
        <DSSection
          title="KeyRow"
          description="API key row with prefix, label, last_used, admin badge, revoke action"
          code={`<KeyRow apiKey={key} onRevoked={id => console.log(id)} />`}
        >
          <div className="max-w-xl">
            <KeyRow
              apiKey={{ id: '1', prefix: 'sk-abc', label: 'Production key', is_admin: false, last_used_at: Date.parse('2026-04-20T00:00:00Z'), created_at: Date.parse('2026-01-01T00:00:00Z'), revoked_at: null }}
            />
            <KeyRow
              apiKey={{ id: '2', prefix: 'sk-xyz', label: 'Admin key', is_admin: true, last_used_at: null, created_at: Date.parse('2026-02-01T00:00:00Z'), revoked_at: null }}
            />
          </div>
        </DSSection>

        {/* ChatHistoryPage */}
        <DSSection
          title="ChatHistoryPage"
          description="Lists previous chat sessions with inline rename, delete, and resume actions."
          code={`<ChatHistoryPage />`}
        >
          <div className="max-w-md">
            <ChatHistoryPage />
          </div>
        </DSSection>

        {/* MicButton */}
        <DSSection
          title="MicButton"
          description="Click to record mic audio → transcribes via Whisper → injects text. idle / recording / transcribing states."
          code={`<MicButton onTranscript={text => console.log(text)} />`}
        >
          <div className="flex items-center gap-4">
            <MicButton onTranscript={() => {}} />
            <span className="text-sm text-[var(--color-muted)]">Click to record (requires mic permission)</span>
          </div>
        </DSSection>

        {/* AudioTranscribePanel */}
        <DSSection
          title="AudioTranscribePanel"
          description="File upload → Whisper transcription → transcript display. Used in the Audio tab."
          code={`<AudioTranscribePanel model="@cf/openai/whisper" />`}
        >
          <div className="max-w-md h-64 border border-[var(--color-border)] rounded-xl overflow-hidden">
            <AudioTranscribePanel model="@cf/openai/whisper" />
          </div>
        </DSSection>

        {/* ── Layouts ──────────────────────────────────────────────────── */}

        {/* Invites */}
        <DSSection
          title="Invites"
          description="InviteTable + InviteCreateModal — lifecycle states and owner invite flow"
          code={`<InviteTable invites={invites} onRevoke={id => {}} />\n<InviteCreateModal open onClose={() => {}} onCreate={async () => ({ full: '...', prefix: 'vfi-demo' })} />`}
        >
          <div className="space-y-4">
            <div>
              <h3 className="text-sm text-[var(--color-muted)] mb-2">InviteTable — all lifecycle states</h3>
              <InviteTable
                invites={[
                  { id: '1', prefix: 'vfi-aaaa', label: 'Active example', created_by: 'o', created_at: Date.now(), expires_at: Date.now() + 6 * 24 * 60 * 60 * 1000, used_at: null, used_by: null, revoked_at: null },
                  { id: '2', prefix: 'vfi-bbbb', label: 'Used example', created_by: 'o', created_at: Date.now(), expires_at: Date.now() + 6 * 24 * 60 * 60 * 1000, used_at: Date.now() - 1000, used_by: 'u1', revoked_at: null },
                  { id: '3', prefix: 'vfi-cccc', label: 'Expired example', created_by: 'o', created_at: Date.now() - 8 * 24 * 60 * 60 * 1000, expires_at: Date.now() - 1, used_at: null, used_by: null, revoked_at: null },
                  { id: '4', prefix: 'vfi-dddd', label: 'Revoked example', created_by: 'o', created_at: Date.now(), expires_at: Date.now() + 6 * 24 * 60 * 60 * 1000, used_at: null, used_by: null, revoked_at: Date.now() - 1000 },
                ] as InviteRecord[]}
                onRevoke={() => {}}
              />
            </div>
            <div>
              <h3 className="text-sm text-[var(--color-muted)] mb-2">InviteCreateModal — open in form state</h3>
              <InviteCreateModal
                open
                onClose={() => {}}
                onCreate={async () => ({ full: 'vfi-demo-not-real-token-xxxxxxxxxxxxx', prefix: 'vfi-demo' })}
              />
            </div>
          </div>
        </DSSection>

        {/* AppShell skeleton */}
        <DSSection
          title="AppShell"
          description="Sidebar + TopBar + main content slot — full app shell layout"
          code={`<AppShell title="Chat" activePath="/chat">\n  <p>Page content</p>\n</AppShell>`}
        >
          <div className="border border-[var(--color-border)] rounded-lg overflow-hidden h-64 pointer-events-none">
            <AppShell title="Chat" activePath="/chat">
              <p className="text-sm text-[var(--color-muted)]">Main content area</p>
            </AppShell>
          </div>
        </DSSection>

      </div>
    </ToastProvider>
  );
}

export function DesignSystemGallery() {
  return (
    <HydratedIsland>
      <DesignSystemGalleryInner />
    </HydratedIsland>
  );
}
