# UJ-004 — User sends browser chat and reloads persisted history

```yaml
id: UJ-004
title: User sends browser chat and reloads persisted history
actors: [member]
surface: browser-chat
goal: Authenticated member sends one message, receives streamed assistant content, and can reload the same conversation from durable chat history.
trigger: Enter a prompt on /chat, select a model, and activate Send.
fixtures: [member-a-session, enabled-chat-model, quota-available, chat-id-chat-1]
success_state:
  visible: User message and streamed assistant response render in the conversation.
  durable: chats contains chat-1 for member-a and chat_messages contains the user and assistant messages.
  persistence: Fresh GET /admin/chats/chat-1/messages returns 200 with the persisted conversation.
source_specs: [apps/ui/src/components/widgets/ChatPage.tsx, apps/worker/src/auth/apikey.ts, apps/worker/src/routes/v1.ts, apps/worker/src/api/chat.ts, apps/worker/src/routes/admin.ts]
readiness: ready
canonical: true
blockers: []
```

## Path

| Hop | Evidence |
|---|---|
| UI trigger | `apps/ui/src/components/widgets/ChatPage.tsx:379` |
| Request construction | `apps/ui/src/components/widgets/ChatPage.tsx:133` |
| Endpoint auth and parse | `apps/worker/src/auth/apikey.ts:13`, `apps/worker/src/routes/v1.ts:17` |
| Authoritative write | `apps/worker/src/api/chat.ts:267`, `apps/worker/src/api/chat.ts:276`, `apps/worker/src/api/chat.ts:282` |
| Response | `apps/worker/src/api/chat.ts:189` |
| Terminal render | `apps/ui/src/components/widgets/ChatPage.tsx:335` |

## Happy path

### H1
- Setup: `member-a` has a valid browser session, `enabled-chat-model` is enabled, quota remains, and `chat-1` is not owned by another user.
- Action: Select `enabled-chat-model`, enter `Hello VibeFlare`, and activate `Send`.
- Request: `POST /v1/chat/completions?chat_id=chat-1`.
- Response: `200` with `Content-Type: text/event-stream` and body containing the literal `"data: "` stream prefix.
- Visible: `Hello VibeFlare` renders as the user message and non-empty assistant content renders in the same conversation.
- Durable: `chats` contains `chat-1` for `member-a` and `chat_messages` contains the last user message plus assistant content.
- Fresh read: `GET /admin/chats/chat-1/messages` returns `200` with `{ "chat": { "id": "chat-1" }, "messages": [...] }` for `member-a`.
- Forbidden: The browser request does not require or expose a bearer API key and cannot persist the conversation under a different user id.
- Evidence:
  - Setup: `apps/worker/src/api/chat.ts:36`
  - Action: `apps/ui/src/components/widgets/ChatPage.tsx:108`
  - Request: `apps/ui/src/components/widgets/ChatPage.tsx:135`
  - Response: `apps/worker/src/api/chat.ts:189`
  - Visible: `apps/ui/src/components/widgets/ChatPage.tsx:337`
  - Durable: `apps/worker/src/api/chat.ts:259`
  - Fresh read: `apps/worker/src/routes/admin.ts:249`
  - Forbidden: `apps/worker/src/auth/apikey.ts:13`

## Alternate and failure paths

### A1
- Setup: `member-a` has a valid browser session but the request body omits the model.
- Action: Submit a chat request without a model.
- Request: `POST /v1/chat/completions?chat_id=chat-1`.
- Response: `400` with `{ "error": { "type": "invalid_request", "message": "model and messages required" } }`.
- Visible: No assistant success content is rendered from the rejected request.
- Durable: No chat or chat message row is created by the rejected request.
- Fresh read: `GET /admin/chats/chat-1/messages` returns `404` with `{ "error": { "type": "not_found", "message": "Chat not found" } }` when `chat-1` did not already exist.
- Forbidden: Quota is not charged and no successful audit/persist path executes for the rejected body.
- Evidence:
  - Setup: `apps/worker/src/api/chat.ts:31`
  - Action: `apps/worker/src/api/chat.ts:23`
  - Request: `apps/worker/src/routes/v1.ts:17`
  - Response: `apps/worker/src/api/chat.ts:32`
  - Visible: `apps/ui/src/components/widgets/ChatPage.tsx:155`
  - Durable: `apps/worker/src/api/chat.ts:35`
  - Fresh read: `apps/worker/src/routes/admin.ts:255`
  - Forbidden: `apps/worker/src/api/chat.ts:73`

## Permissions and boundaries

### P1
- Setup: The request has no accepted authentication identity.
- Action: Submit a browser-mode chat request.
- Request: `POST /v1/chat/completions?chat_id=chat-1`.
- Response: `401` with `{ "error": { "type": "auth", "message": "session required" } }`.
- Visible: The chat surface must navigate to `/login` rather than exposing model output.
- Durable: No chat, message, usage, or audit success state is written for the unauthenticated request.
- Fresh read: `GET /admin/chats/chat-1/messages` returns `401` with `{ "error": { "type": "auth", "message": "authentication required" } }`.
- Forbidden: The unauthenticated browser cannot use `x-vf-browser: 1` as an authentication bypass.
- Evidence:
  - Setup: `apps/worker/src/auth/apikey.ts:29`
  - Action: `apps/ui/src/components/widgets/ChatPage.tsx:135`
  - Request: `apps/worker/src/routes/v1.ts:17`
  - Response: `apps/worker/src/auth/apikey.ts:29`
  - Visible: `apps/ui/src/components/widgets/ChatPage.tsx:151`
  - Durable: `apps/worker/src/auth/apikey.ts:13`
  - Fresh read: `apps/worker/src/routes/admin.ts:37`
  - Forbidden: `apps/worker/src/auth/apikey.ts:29`

## Source specs

- `apps/ui/src/components/widgets/ChatPage.tsx`
- `apps/worker/src/auth/apikey.ts`
- `apps/worker/src/routes/v1.ts`
- `apps/worker/src/api/chat.ts`
- `apps/worker/src/routes/admin.ts`
