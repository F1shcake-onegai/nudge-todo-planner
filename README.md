# nudge

A self-hosted, single-admin task manager. Brain-dump what's on your mind in plain language; the assistant turns it into tasks and projects, then pings you a few times a day during your work hours so you don't forget. Deadlines surface on your phone's calendar via iCal. Runs in one Docker container behind your own reverse proxy on a VPS.

![stack](https://img.shields.io/badge/stack-Next.js%2016-000) ![tailwind v4](https://img.shields.io/badge/tailwind-v4-38bdf8) ![ai sdk v6](https://img.shields.io/badge/ai--sdk-v6-8b5cf6)

## Features

- **Chat-driven task capture** — brain-dump whatever's on your mind; the assistant creates projects, tasks, subtasks, deadlines, priorities.
- **Chat edits with creation-date filters** — "mark chapter 3 done", "delete all completed tasks from last week", "bump priority on overdue items" — the assistant resolves these against the current task list and creation timestamps.
- **Strict scope** — the AI only handles tasks and scheduling. Off-topic prompts get a one-sentence refusal. Prompt-injection resistant.
- **Manual editing** — click the status circle to toggle done, double-click a title to rename, right-click (or long-press on touch, or tap the `⋯` button) a row for a context menu (add subtask, change priority, set deadline, delete).
- **Project management** — right-click / long-press / tap `⋯` on a project header for rename / mark-all-done / delete. The "New Task" bucket (projectless) can be named and promoted into a real project.
- **Mobile-first layout** — below 1024px the app is a two-page view (chat default, tasks on the other page); hamburger swaps between them. Above 1024px the task list is a permanent sidebar alongside the chat.
- **Adaptive nudges** — off / light (2/day) / balanced (4/day) / intense (8/day). Nudges rotate across different projects so one loud deadline doesn't drown the rest out. Randomized title + body copy from template pools, jitter scales with intensity density.
- **Deadline calendar feed** — one-way iCal subscription, all-day events per task deadline. HTTP Basic auth with your nudge username + password (CalDAV-style). Optional; not surfaced by default.
- **Auth** — admin username + password (bcrypt), session cookies for browsers, long-lived bearer tokens for native apps. CSRF-safe by default. Rate-limited login + chat endpoints.
- **Secrets at rest** — AES-256-GCM encryption for every LLM API key; master key lives in a Docker secret, never in the DB.
- **Pluggable LLM providers** — Anthropic / OpenAI / Google Gemini. Short edits auto-route to a cheaper "edit model" when configured.

## Stack

- [Next.js 16](https://nextjs.org) App Router, Turbopack default, standalone output
- [Tailwind CSS v4](https://tailwindcss.com) with CSS-first theming
- [Vercel AI SDK v6](https://sdk.vercel.ai) (`ai`, `@ai-sdk/anthropic`, `@ai-sdk/openai`, `@ai-sdk/google`, `@ai-sdk/react`)
- [Drizzle ORM](https://orm.drizzle.team) + [libSQL](https://turso.tech) (single SQLite file on disk)
- [web-push](https://github.com/web-push-libs/web-push) + service worker
- [react-markdown](https://github.com/remarkjs/react-markdown) + [remark-gfm](https://github.com/remarkjs/remark-gfm) for assistant messages

## Quick start (dev)

```bash
npm install
npm run db:push             # creates local SQLite DB (file:./local.db)
npm run dev                 # http://localhost:3000
```

Open `http://localhost:3000` → first-boot wizard asks for username + password + work hours + intensity + one LLM API key → drops you on the chat.

## Deploy (production, Docker)

On any VPS with Docker and `docker compose`:

```bash
git clone https://github.com/F1shcake-onegai/nudge-todo-planner
cd nudge-todo-planner && git checkout v2
./scripts/setup.sh            # prompts for your public URL, generates secrets
docker compose up -d --build
```

Nudge listens on **`127.0.0.1:3000`** of the host — not exposed to the internet. Point your own reverse proxy at that port and terminate TLS there (Caddy, nginx, Traefik, Cloudflare Tunnel, whatever you already run). Ensure the public URL matches the `AUTH_URL` value that `./scripts/setup.sh` wrote to `.env` — cookie Secure flag + CSRF Origin checks depend on it.

Example minimal Caddyfile (you install this; nudge doesn't ship it):

```
nudge.example.com {
    reverse_proxy localhost:3000
}
```

First visit → setup wizard.

## Data model (v2.1)

Every task has exactly these fields: `title`, `priority` (1..4), optional `deadline`, `status` (todo / doing / done), `createdAt`, plus `projectId` / `parentTaskId` for hierarchy. No duration, no scheduled block times — v2.1 removed those. Tasks live or die by their deadline and priority; the scheduler that used to place blocks is gone.

`createdAt` is exposed to the LLM so you can clean up by age:

- "delete all completed tasks from last week" → `delete_tasks { selector: { status: "done", createdBefore: "<ISO 7d ago>" } }`
- "what did I add today" → LLM reads `createdAt` straight from prompt context, no tool call.

## Architecture

```
[User NL]
    │
    ▼
/api/chat ──► runAgent (AI SDK) ──► tool calls:
    │                               create_tasks
    │                               update_tasks    (selector: ids / title / project / status / createdBefore / createdAfter)
    │                               delete_tasks    (same selectors + confirm)
    ▼
libSQL (Drizzle)
    │
    ├─► Web Push (VAPID, internal 5-min cron tick, quiet outside work hours)
    └─► iCal feed (deadline all-day events, HTTP Basic auth)
```

- `lib/llm/index.ts` — provider-agnostic `runAgent` with Anthropic prompt caching
- `lib/llm/tools.ts` — three Zod-typed tools (`create_tasks`, `update_tasks`, `delete_tasks`)
- `lib/llm/prompt.ts` — strict scope + injection-resistant system prompt; includes `createdAt` on every task line
- `lib/nudgePlanner.ts` — intensity-driven notification planner, round-robin across projects, slot-density-aware jitter
- `lib/notifications.ts` — push dispatch, work-hour gate, subscription cleanup
- `lib/secrets.ts` — AES-256-GCM wrap + migration for `provider_keys`
- `lib/auth.ts` — bcrypt + sessions, cookie + bearer token support
- `lib/ics.ts` — RFC 5545 iCal generator (deadline all-day events)
- `proxy.ts` — Next 16 middleware, session validation + CSRF + bootstrap gate
- `public/sw.js` — push handler
- `instrumentation.ts` — starts the internal 5-min scheduler tick on boot

## LLM providers & billing

- **Anthropic API** (default) — pay-as-you-go. With prompt caching + routing short edits to Haiku, personal usage stays under ~$1/month.
- **OpenAI**, **Google Gemini** — switch provider in Settings, add the key.
- Your **Claude.ai Pro / Max subscription** does **not** fund API calls for custom apps — it's a separate billing pool. Buy prepaid API credits if you don't want a card on file.

## Phone / mobile

Install the web app as a PWA (share → "Add to Home Screen" on iOS; install prompt on Android Chrome). Push notifications work in installed PWA mode on iOS 16.4+ and on Android / desktop Chrome directly.

Below the 1024px breakpoint the layout switches to a two-page view: chat on one page, tasks on the other, hamburger in the header to toggle. Task rows and project headers both expose a trailing `⋯` button (always visible) plus a 500ms long-press gesture — both open the same context menu (rename / priority / deadline / delete). On touch devices, Enter in the chat inserts a newline; tap the Send button to submit.

A future native mobile app can talk to the same HTTP API via bearer tokens. See [`docs/mobile-api.md`](docs/mobile-api.md) for the API surface.

## Calendar subscription (optional, hidden by default)

Go to **Settings → Phone calendar** to grab your subscription URL. Tap the orange button from your phone (iOS) or paste the URL into `calendar.google.com → Other calendars → From URL` (Android). Your phone calendar will show an all-day event for every task that has a deadline.

You can also authenticate with your admin username + password via HTTP Basic auth:
`https://username:password@your.domain/api/calendar/feed/<token>` — works with Apple Calendar, Thunderbird, and most clients that accept auth in the URL.

## Scripts

- `npm run dev` — Turbopack dev server
- `npm run build` / `npm run start`
- `npm run db:push` — sync Drizzle schema to DB
- `npm run db:studio` — open Drizzle Studio
- `npm run vapid:gen` — print a fresh VAPID keypair (the setup wizard generates one silently; only needed if you rotate)

## Security notes

- All LLM API keys are encrypted with a master key from Docker secrets. Stealing the `data/nudge.db` file without the master key is useless.
- Session cookies are `HttpOnly; Secure; SameSite=Strict` in production.
- Login rate-limited to 5 attempts / minute / IP. `/api/chat` rate-limited to 20 req / minute / session.
- CSRF: cross-origin mutating requests are rejected unless authenticated via Bearer token (mobile clients).
- The iCal feed URL has a rotatable secret token; HTTP Basic auth is the alternative.

## Scope boundary

Not in nudge (by design):
- Recurring tasks / habits / check-ins
- Pomodoro or focus timer (use your existing one)
- Native mobile app (the HTTP API is ready, see `docs/mobile-api.md`; app itself is a separate project)
- Multi-user / team features
- Google Calendar sync (removed in v2; the iCal feed is the calendar story)
