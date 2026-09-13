# Image, embedding and audio conversation history

## Report and cause

The user reported that a new image conversation did not appear in Workspace or History and asked that embeddings and audio be checked before merging the pending branches.

`ChatPage` previously created a conversation only for text-chat requests. Image results existed only in component memory or browser blob URLs. The Audio panel only held its latest transcript in local state. The Embeddings tab also reused the text chat/completions endpoint instead of requesting embeddings.

## Corrected behavior

The browser creates an owned conversation before each task's first request and immediately adds it to the shared Workspace cache. Image requests, embedding requests and transcriptions include that conversation's `chat_id`. A follow-up request stays in the same conversation. While a request is pending, task/model switching and duplicate submissions cannot move its result into a different conversation.

Each media endpoint verifies ownership before inference and commits the input, output metadata and ordering timestamp together. Reopening a conversation restores its original task before mounting the model picker. This prevents a fresh default text-model response from replacing the saved image/audio/embedding selection during page hydration.

- Images: the prompt and every generated image are saved; small/base64 outputs are also retained in private object storage when history is requested.
- Embeddings: the correct `/v1/embeddings` endpoint is used. The input and a compact count/dimension summary are saved, along with the complete result as downloadable JSON.
- Audio: the original uploaded audio and its transcript are saved and replayable from history. The standalone component used by the design-system gallery also creates a conversation rather than silently losing its result.

History images/audio/downloads use same-origin, authenticated file endpoints, not expiring browser blob URLs. Owned-file checks also cover the legacy `/files/<key>` endpoint. Private media responses are not cached across account changes. Failed requests clean up newly staged files and never insert a successful-looking result or recreate a conversation deleted during generation.

## Storage and compatibility

No schema migration is needed. Structured metadata lives in the existing `chat_messages.attachments` column, and media/vector payloads live in the existing private R2 bucket. Legacy plain-text messages remain readable. Metadata parsing is versioned and rejects malformed values and non-file identifiers.

Normal image/embedding/audio API calls without `chat_id` retain their existing response behavior and do not create conversations. Supplying `chat_id` requires an existing conversation owned by the caller. Explicit image `b64_json` and audio `text` response formats remain supported.

The existing retention policy is unchanged: inactive conversations are pruned after 14 days. Files referenced by still-active conversations are protected from earlier file expiry; expired, unreferenced files remain eligible for cleanup. This is not an indefinite-retention change.

Results that the old UI never saved cannot be reconstructed from missing conversation data. Larger images already present in the user's Files/Data area are not deleted or retroactively assigned invented prompts.

## Verification

- `apps/worker/test/media_history.test.ts`: image/base64/batch output persistence, complete embedding JSON, original audio/transcripts and response-format compatibility; pre-inference tenant checks; failure cleanup; concurrent chat deletion; active attachment retention and malformed inputs.
- `apps/ui/test/history-metadata.test.ts`: backwards-compatible and defensive attachment decoding.
- `apps/ui/test/e2e/UI-media-history.spec.ts`: actual local Worker/D1/R2 flows for image, embeddings and audio at desktop/mobile widths, immediate history entries, follow-ups, refresh/reopen, account isolation and failure/retry behavior.

Media tests use deterministic local inference fixtures. They do not send requests to production models or consume the user's inference quota. Final combined branch verification and deployment receipts are recorded in the integration worktree's ignored `.internal/qa` and `.internal/deploy` directories.
