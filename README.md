# nudge

A single-user, self-hosted task manager that takes brain-dumps in plain language, breaks them into subtasks, places them into free slots in your working hours, and pushes a notification when it's time to start. Installable as a PWA on phone and laptop, with an iCal feed you can subscribe to from any calendar app.

![made with nudge](https://img.shields.io/badge/stack-Next.js%2016-000) ![tailwind v4](https://img.shields.io/badge/tailwind-v4-38bdf8) ![ai sdk v6](https://img.shields.io/badge/ai--sdk-v6-8b5cf6)

## Features

- **Chat-driven task capture** — brain-dump whatever's on your mind; the assistant creates projects, tasks, subtasks, deadlines, priorities.
- **Chat edits** — "move the photo project to Monday", "mark chapter 3 done", "delete all study tasks" — handled via tool calls.
- **Strict scope** — the AI is locked to tasks & scheduling only. Off-topic prompts (recipes, jokes, code help) get a one-sentence refusal. Prompt-injection resistant.
- **Manual editing** — click the status circle to toggle done, double-click a title to rename, right-click a row for a context menu (add subtask, change priority, set deadline, etc.).
- **Project management** — right-click a project header for rename / mark-all-done / delete. The unassigned "New Task" bucket can be promoted into a real project.
- **Rule-based scheduler** — respects work hours, avoids Google Calendar busy slots (if linked), splits long tasks into ≤90-min blocks.
- **Web push notifications** — fire when a task is about to start, and never outside work hours.
- **Phone calendar subscription** — secret-token iCal feed that iOS / Android / Google Calendar can subscribe to; no OAuth required for read-only.
- **Optional Google Calendar sync** — OAuth + subcalendar picker (read busy from selected, write task blocks to one).
- **Pluggable LLM providers** — Anthropic / OpenAI / Google Gemini; short edits auto-route to a cheaper "edit model" (e.g. Haiku).
- **All keys in-app** — no need to touch `.env.local`. API keys, OAuth creds, VAPID keys all set from Settings → API keys.

## Stack

- [Next.js 16](https://nextjs.org) App Router, Turbopack default
- [Tailwind CSS v4](https://tailwindcss.com) with CSS-first theming
- [Vercel AI SDK v6](https://sdk.vercel.ai) (`ai`, `@ai-sdk/anthropic`, `@ai-sdk/openai`, `@ai-sdk/google`, `@ai-sdk/react`)
- [Drizzle ORM](https://orm.drizzle.team) + [libSQL / Turso](https://turso.tech)
- [FullCalendar](https://fullcalendar.io) (week view, drag-to-reschedule — currently stashed)
- [web-push](https://github.com/web-push-libs/web-push) + service worker
- [googleapis](https://github.com/googleapis/google-api-nodejs-client)
- [react-markdown](https://github.com/remarkjs/react-markdown) + [remark-gfm](https://github.com/remarkjs/remark-gfm)

## Quick start

```bash
npm install
cp .env.example .env.local
npm run db:push              # creates local SQLite DB (file:./local.db)
npm run dev                  # http://localhost:3000
```

On first launch, open **Settings → API keys** and paste at least one LLM provider key (`ANTHROPIC_API_KEY` is the default). Hit **Generate** in the VAPID section for notification keys. No restart needed.

## Architecture

```
[User NL]
    │
    ▼
/api/chat ──► runAgent (AI SDK) ──► tool calls:
    │                               create/update/delete_tasks
    │                               create/update/delete_event
    ▼
libSQL (Drizzle) ──► rule-based scheduler (work-hour-aware)
    │
    ├─► Google Calendar (optional, subcalendar-aware)
    ├─► Web Push (VAPID, Vercel Cron → service worker, quiet outside work hours)
    └─► iCal feed (secret-token URL for phone calendar subscription)
```

- `lib/llm/index.ts` — provider-agnostic `runAgent` with Anthropic prompt caching
- `lib/llm/tools.ts` — six Zod-typed tools
- `lib/llm/prompt.ts` — strict scope + injection-resistant system prompt
- `lib/scheduler.ts` — forward-walks work hours, splits ≤90-min blocks, respects external busy
- `lib/google.ts` — OAuth, free/busy, event CRUD
- `lib/ics.ts` — RFC 5545 iCal generator
- `public/sw.js` — push handler
- `app/api/cron/notify` — Vercel Cron target, respects work hours

## Google Calendar (optional)

1. Create OAuth 2.0 credentials in [Google Cloud Console](https://console.cloud.google.com/apis/credentials) (Web application, Testing mode → add yourself as test user).
2. Authorized redirect URI: `http://localhost:3000/api/google/callback` (+ production URL).
3. Paste `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` in **Settings → API keys**.
4. Click **Link Google Calendar** → consent → pick read-from calendars + one write-to calendar.

## iCal feed (phone calendar)

In **Settings → Phone calendar (iCal feed)** tap the orange button on your phone — iOS will prompt to subscribe. For Android, paste the HTTPS URL into `calendar.google.com → Other calendars → From URL`. Rotatable token, re-generatable any time.

## LLM providers & billing

- **Anthropic API** (default) — pay-as-you-go at [console.anthropic.com](https://console.anthropic.com). With prompt caching + routing short edits to Haiku, personal usage is typically under $1/month.
- **OpenAI**, **Google Gemini** — switch provider in Settings, add the key.
- **Your Claude.ai Pro / Max subscription** does **not** fund API calls for custom apps — that's a separate billing pool. Buy prepaid API credits if you want to use Claude without a credit card on file.

## Scripts

- `npm run dev` — Turbopack dev server
- `npm run build` / `npm run start`
- `npm run db:push` — sync Drizzle schema to DB
- `npm run db:studio` — open Drizzle Studio
- `npm run vapid:gen` — generate VAPID keys from CLI (or use the UI button)

## Deployment

Vercel Hobby + Turso free tier covers personal use. Set production env vars in Vercel dashboard (or leave unset and use Settings UI). `vercel.json` declares the 5-minute cron for `/api/cron/notify`. Remember to add your production callback URL to Google OAuth.
