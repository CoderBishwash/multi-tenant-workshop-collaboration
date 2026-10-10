# Workshop API

A signed-in account can create a workshop and becomes that workshop's owner (`mentor`). Account `role` is retained for older clients but is not used to authorize workshop actions. The owner can publish code, view the roster and error queue, decide join requests, change join settings, and end the workshop. An approved or open-join participant can read the room and submit errors.

All routes below use the `/api/v1/workshops` prefix. Protected routes require the existing HTTP-only authentication cookie.

| Route | Purpose |
| --- | --- |
| `POST /` | Create a room with `title`, `description`, and optional `approvalRequired` (defaults to `false`). Returns the four-digit PIN to the owner. |
| `GET /` | List active rooms publicly. PINs and join requests are omitted. |
| `GET /mine` | Return `owned`, `joined`, and `pending` room lists for the signed-in account. Only owned rooms include PINs. |
| `POST /join` | Submit `{ "pin": "1234" }`. Returns `status: "joined"` (200) for an open or previously joined room, or `status: "pending"` (202) when approval is required. Both responses include `workshopId`. |
| `GET /:id/join-requests` | Owner-only pending request list with requester names and emails. |
| `PATCH /:id/join-requests/:userId/approve` | Owner-only approval. Atomically adds the requester to the roster and removes the request. |
| `PATCH /:id/join-requests/:userId/reject` | Owner-only rejection. Removes the pending request; the person can request again later. |
| `PATCH /:id/join-settings` | Owner-only `{ "approvalRequired": true/false }`. Pending requests must be resolved before turning approval off. |
| `GET /:id` | Full room for owner; limited room content for roster members. Pending requesters receive 403. |
| `PATCH /:id/end` | Owner-only, permanently archives the room and clears pending requests. |
| `GET /:id/chat` | List the latest 50 room messages, or the next 100 with `?after=<messageId>`. Owner and roster members only. |
| `POST /:id/chat` | Send `{ "text": "..." }` (up to 5000 characters) while the room is active. |
| `POST /:id/chat/files` | Upload a raw file (up to 10 MB) with `X-File-Name` and `Content-Type` headers. Creates a chat message with an attachment. |
| `GET /:id/chat/files/:fileId` | Download a chat attachment after verifying membership and that the file belongs to this room. |

Existing snippet, error, and archive routes remain available. Workshop permissions now depend on room ownership and membership, rather than the account-wide role. Join attempts are limited per account and per network; room creation is limited per account. The PIN is a convenience code, so enable approval when admission control matters.

Chat messages are stored separately from the workshop document; attachment bytes use MongoDB GridFS. Pending requesters cannot read chat or files. Archived rooms remain readable, but messages and uploads are locked. Attachments are served as downloads with `nosniff` headers. Supported files include PNG, JPEG, WebP, PDF, plain text, CSV, ZIP, DOCX, XLSX, and PPTX. Chat writes and uploads have per-account rate limits.

Run `npm test` for the access-flow tests.
