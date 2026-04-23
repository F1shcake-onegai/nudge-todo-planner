# nudge HTTP API (mobile / native client reference)

This document describes the HTTP surface a future native mobile client (iOS, Android, desktop) would consume. The web app itself uses the same endpoints with cookie auth; native clients should prefer **bearer tokens** to sidestep CSRF and cookie-domain constraints.

All responses are JSON unless noted. All timestamps are ISO 8601 UTC. Errors come back as `{ "error": "<message>" }` with an appropriate HTTP status.

---

## 1. Authentication

nudge is single-admin. There is one set of credentials (username + password, bcrypt-hashed). Two session flavours exist:

- **Cookie** (`nudge_session`, HttpOnly + Secure + SameSite=Strict) — for the web app only.
- **Bearer token** — a long-lived session ID passed in `Authorization: Bearer <token>`. Mobile apps should use this exclusively.

### Mint a bearer token (primary path for mobile)

```
POST /api/auth/token
Content-Type: application/json

{ "password": "<admin password>", "label": "iphone 15" }
```

Response:

```json
{
  "token": "c94a…",
  "expiresAt": "2027-04-22T12:34:56.000Z",
  "usage": "Send as 'Authorization: Bearer <token>' header."
}
```

- Password-gated even if the caller already has a cookie session — issuing a device token is a higher-trust action than normal logged-in browsing.
- Token TTL is long (≈1 year with `remember: true`, which is implicit here). Store in **iOS Keychain** or **Android Keystore**; do not place in plain app storage.
- Attach to every subsequent request as `Authorization: Bearer <token>`.
- Revocable from **Settings → Security** on web, or by calling `DELETE /api/auth/sessions?id=<id-prefix>` (or `?scope=all-others` to revoke every other session). The `id-prefix` is the first 8 chars returned by `GET /api/auth/sessions`.

### Cookie-based login (web only, for completeness)

```
POST /api/auth/login
Content-Type: application/json
{ "username": "...", "password": "...", "remember": true }
```

Sets `Set-Cookie: nudge_session=...`. **Rate-limited to 5 attempts/min/IP** — returns `429` with `Retry-After` header when exceeded.

### Current user

```
GET /api/auth/me
Authorization: Bearer <token>     # or Cookie
→ 200 { "username": "...", "bootstrapped": true }
→ 401 { "error": "Not authenticated" }
```

A `401` from this endpoint on cold-start means the stored token is expired/revoked — drop it from Keychain and route the user to login.

### Logout

```
POST /api/auth/logout
```

Clears the cookie session (if any) and revokes the bearer token from the DB.

### First-boot setup

If `GET /api/auth/me` returns `{ bootstrapped: false }`, the instance has no admin yet. Direct the user through `POST /api/setup` (see `app/setup/page.tsx` for field order) — not in scope for a repeat-user mobile client.

---

## 2. Tasks & projects (core CRUD)

All endpoints in this section require authentication (cookie or bearer). Mutating endpoints called with a cookie must be same-origin; bearer-token requests skip that check.

### Task shape (v2.1)

```ts
type Task = {
  id: string;                          // "tsk_..."
  projectId: string | null;
  parentTaskId: string | null;
  title: string;
  notes: string | null;
  priority: 1 | 2 | 3 | 4;             // 1=high, 4=none (default)
  deadline: string | null;             // ISO 8601 UTC, or null
  status: "todo" | "doing" | "done";
  notifiedAt: string | null;
  createdAt: string;                   // ISO 8601 UTC
};

type Project = {
  id: string;                          // "prj_..."
  name: string;
  color: string;                       // hex "#c96442"
  createdAt: string;
};
```

> **v2.1 note:** `estimatedMinutes`, `scheduledStart`, `scheduledEnd` were **removed** in v2.1. A client that saw them on v2 should drop those fields from its local model.

### List everything

```
GET /api/tasks
→ 200 { "projects": Project[], "tasks": Task[] }
```

Both collections are ordered by `createdAt` descending. The chat column on the home page consumes exactly this response shape.

### Create a task

```
POST /api/tasks
{
  "title": "...",             // required
  "projectId": "prj_..." | null,
  "parentTaskId": "tsk_..." | null,
  "priority": 1..4,
  "deadline": "2026-05-01T12:00:00Z" | null,
  "notes": "..." | null
}
→ 200 { "id": "tsk_...", "ok": true }
```

Any omitted field falls back to its schema default (priority=4, no deadline, no notes, status=todo).

### Edit a task

```
PATCH /api/tasks/<id>
{ any subset of: title, notes, status, priority, deadline, projectId, parentTaskId }
→ 200 { "ok": true }
→ 200 { "ok": true, "noop": true }   # empty patch
```

### Delete a task

```
DELETE /api/tasks/<id>
→ 200 { "ok": true }
```

### Bulk by project

```
POST /api/tasks/bulk
{ "action": "complete" | "delete", "projectId": "prj_..." | null }
→ 200 { "ok": true }
```

`projectId: null` targets the projectless "New Task" bucket.

### Projects

```
POST   /api/projects           { "name": "...", "color": "#c96442", "absorbUnassigned": false }
PATCH  /api/projects/<id>      { "name"?, "color"? }
DELETE /api/projects/<id>?cascade=true|false
POST   /api/projects/<id>/complete
```

- `absorbUnassigned: true` on create reassigns every projectless task into the new project — used by the "Name this project" flow on the projectless bucket.
- `cascade=false` nulls `tasks.projectId` before deleting the project; `cascade=true` deletes all tasks under it. SQLite FK cascades are not relied upon — the handler does this explicitly.

Any task/project mutation triggers `replanAfterMutation()` server-side, which rebuilds today's remaining notification slots. The mobile client needs no awareness of this.

---

## 3. Chat (streaming)

```
POST /api/chat
Authorization: Bearer <token>
Content-Type: application/json

{ "messages": UIMessage[] }
```

- **Wire format:** AI SDK v6 UIMessage array — `{ id, role: "user"|"assistant", parts: [{ type: "text", text: "..." }] }`.
- **Response:** Server-Sent Events stream suitable for the AI SDK's `useChat` consumer. Native clients can parse the SSE framing directly, or drive it through the AI SDK's JS client if embedded in a webview.
- **Rate limit:** 20 req/min/session. `429` + `Retry-After` header on exceed.
- **Tool use:** the server may call `create_tasks`, `update_tasks`, `delete_tasks` mid-stream. Tool calls appear as `tool-call` / `tool-result` parts in the stream. The client does not need to execute tools — all tool execution is server-side against the DB.
- **Scope:** the system prompt refuses anything off-topic with a one-sentence decline. That's a product invariant, not a bug — do not prompt-hack around it.

After a chat round ends, the mobile client should `GET /api/tasks` to refresh its local state (the web app does this via a `loadTasks` call on `status === "ready"`).

---

## 4. Settings

```
GET   /api/settings
PATCH /api/settings
```

Allow-listed PATCH fields:

- `workHoursStart`, `workHoursEnd` — `"HH:MM"` 24h strings.
- `timezone` — IANA name (display hint only; storage is UTC).
- `llmProvider` — `"anthropic" | "openai" | "google"`.
- `llmModel` — e.g. `"claude-sonnet-4-6"`.
- `llmEditModel` — cheaper model for short edits, optional.
- `notificationIntensity` — `"off" | "light" | "balanced" | "intense"`.

`feedToken` and `bootstrapped` are read-only from here; they move via dedicated endpoints.

---

## 5. Secrets (LLM API keys + VAPID)

```
GET   /api/secrets
→ 200 { "secrets": [{ "key": "ANTHROPIC_API_KEY", "set": true, "publicDisplay": false, "value": null }, ...] }

PATCH /api/secrets
{
  "ANTHROPIC_API_KEY": "sk-ant-...",   // string to set, null to clear
  "OPENAI_API_KEY": null
}
→ 200 { "secrets": [...] }           // fresh listing after mutation
```

- Values are AES-256-GCM encrypted at rest. For entries where `publicDisplay` is `false`, the listing never returns plaintext — `value` is `null` and the client displays "Key configured" vs "Not set".
- Known keys (enforced allowlist): `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`. Unknown keys in a PATCH body are ignored.
- Clearing a key is `PATCH` with a `null` value. There is no `DELETE` verb on this resource.

---

## 6. Push notifications

```
GET  /api/push/vapid
→ { "publicKey": "B..." }
```

Use this as the `applicationServerKey` when calling `PushManager.subscribe` (PWA) or when requesting a Web Push / FCM token (native).

```
POST /api/push/subscribe
{
  "endpoint": "...",
  "keys": { "p256dh": "...", "auth": "..." },
  "label": "iphone 15"                // optional
}
→ 200 { "ok": true, "id": "sub_..." }

DELETE /api/push/subscribe
{ "endpoint": "..." }
→ 200 { "ok": true }
```

Register on login and after the user grants notification permission. Unregister on logout or uninstall to avoid stale endpoints — the server also prunes 410-GONE endpoints automatically on dispatch.

Notifications are scheduled by the server (intensity + work-hour aware); the client has no per-notification API.

---

## 7. Calendar feed (CalDAV-style)

```
GET /api/calendar/feed/<token>
→ 200 text/calendar    # RFC 5545 ICS
```

- One all-day VEVENT per task that has a `deadline`. Tasks without a deadline produce no events. Tasks with `status: "done"` get `STATUS:COMPLETED`.
- Auth options:
  1. **Token in URL** — `feed/<token>`. Rotate via `POST /api/calendar/feed-url`.
  2. **HTTP Basic** — admin username + (password **or** bearer token) at `https://user:secret@host/api/calendar/feed/<token>`. Works with Apple Calendar, Thunderbird, and most clients that accept URL-embedded credentials.
- Refresh hint: `REFRESH-INTERVAL;VALUE=DURATION:PT1H` — clients poll hourly.

```
GET  /api/calendar/feed-url   → { "token": "...", "httpsUrl": "https://.../api/calendar/feed/<token>", "webcal": "webcal://.../api/calendar/feed/<token>" }
POST /api/calendar/feed-url   → same shape, plus "rotated": true, with a freshly-minted token
```

The mobile client does not consume the feed itself — it displays the URL for the user to paste into their phone's calendar app.

---

## 8. Conventions

- **Dates:** ISO 8601 UTC everywhere. `settings.timezone` is a display hint only.
- **Errors:** `{ "error": "<message>" }` with an appropriate HTTP status.
- **Rate limits:** login 5/min/IP; `/api/chat` 20/min/session. On `429`, respect `Retry-After`.
- **CSRF:** cookie-authed mutating requests must be same-origin (Origin/Referer checked). Bearer-token requests skip this — that is the intended mobile path.
- **Content negotiation:** no versioning header — the API is a moving target alongside the server binary. A native client should check `GET /api/auth/me` for a `version` field at cold-start if/when we add one.
- **Pagination:** none. `GET /api/tasks` returns everything. The working task set is small by design (single-admin productivity tool, not a team backlog).

---

## 9. Mobile implementation checklist (MVP)

1. **First launch → login screen.** Call `POST /api/auth/token` with the user's password; store the returned `token` in Keychain (iOS) or Keystore (Android).
2. **Cold start after login → `GET /api/auth/me`.** On `401`, delete the stored token and bounce to login.
3. **Home screen → `GET /api/tasks`** and render. Refresh after each mutation or chat round.
4. **Push permission flow:**
   - `GET /api/push/vapid` → use `publicKey` to subscribe.
   - `POST /api/push/subscribe` with the endpoint + keys from the subscription.
   - On logout / uninstall: `DELETE /api/push/subscribe` with the endpoint.
5. **Chat:** stream `POST /api/chat` as SSE; after `finish`, re-GET tasks.
6. **Settings screen:** thin wrapper over `GET/PATCH /api/settings` + `GET/POST/DELETE /api/secrets`.
7. **Calendar subscription:** show the URL from `GET /api/calendar/feed-url`; offer a tap-to-open `webcal://` link for iOS, copy-to-clipboard for Android.

Out of scope for the MVP: offline-first sync, conflict resolution, background task mutations while offline. `GET /api/tasks` on app open is the sync story until demand proves otherwise.
