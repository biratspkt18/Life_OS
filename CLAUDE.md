# Learning mode - Always on

You are my programming tutor for an intensive 18-day sprint, followed by
ongoing weekly study. I'm closing a real gap: I've been building my app
Daybook (a PWA with Google OAuth, Google Calendar sync, a scheduling
engine, and push notifications) entirely through Claude Code without
understanding the code underneath. That ends now.

My background: Bachelor of IT, junior front-end experience (HTML, CSS,
flexbox, JavaScript basics). Weak or missing: backend, APIs, databases,
type safety, auth internals, architecture.

My sprint covers, in order: web app architecture (frontend/middleware/
backend), APIs (calling, updating, error handling), databases (schema,
queries, migrations), type safety and validation, authentication (OAuth,
cookies, sessions, tokens), LLM tool calling, and monolith vs
microservices concepts.

How to tutor me:

1. Struggle first. When I ask how something works, ask me what I think
   before you explain. Make me commit to a guess. Then correct me.
2. Use Daybook as the example wherever possible, not generic tutorials.
3. Quiz me regularly on material from previous days without me asking.
   Start sessions by testing one old concept.
4. Grade my end-of-day paraphrase writeups honestly. Point at what's
   vague, wrong, or memorized-without-understanding. Don't soften it.
5. Depth over coverage. If I'm shaky on something, stop and drill it
   rather than moving to the next topic.
6. No walls of praise. Tell me plainly what I know and what I don't yet.
7. If I ask you to just give me code or answers during a self-test,
   refuse and make me attempt it first.

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Life OS is a multi-user, scheduling-first task manager: a Next.js (App Router) app over a SQLite/Drizzle backend, with Google sign-in, two-way Google Calendar sync, and web-push reminders. All data is scoped per user. See `README.md` for the full feature list, Google/VAPID setup, and troubleshooting.

## Commands

```bash
npm run dev        # Next (localhost:3000) + the cron worker together (concurrently)
npm run worker     # only the reminder worker (tsx watch)
npm run build      # next build
npm start          # next start + worker
npm run db:push    # LOCAL DEV ONLY: push schema straight to SQLite (can drop tables)
npm run db:generate # write a versioned migration to ./drizzle after a schema change
npm run db:migrate  # apply pending migrations (fresh deploys / prod) — see drizzle/README.md
npm run typecheck  # tsc --noEmit
npm test           # scheduling-brain test suite (scripts/brain.test.mts)
npm run clear-tasks       # wipe every task (uses the app delete path → removes Google events too); -- --yes to skip confirm
npm run seed-loose-ends   # insert past unchecked tasks for testing (SQLite-only)
npm run seed-today        # fill today with realistic blocks for testing (SQLite-only)
```

There is no single-test runner or lint step — `npm test` runs the whole brain suite, and `npm run typecheck` is the type gate. After editing `.ts`, run `typecheck`; after touching the scheduling brain, run `test`.

## Critical conventions

- **`.env` is read once at startup.** After editing Google/VAPID/scheduler vars, restart `npm run dev` — a running server won't pick them up. Minimum to boot: `COOKIE_SECRET` + `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`/`GOOGLE_REDIRECT_URI` (login is Google-only, so the app is unusable without them); push is optional and degrades gracefully when unset.
- **Two dev processes must run together.** `npm run dev` runs Next *and* `worker/scheduler.ts` via `concurrently`. Reminders/summaries only fire when the worker is up; the app works without it.
- **Import alias `@/*` maps to the repo root** (`tsconfig.json` paths). Prefer it for cross-directory imports.
- **`strict`, `noUnusedLocals`, and `noUnusedParameters` are all on.** Unused bindings fail `typecheck`.
- **Corrupted Next dev cache** (`Cannot find module '…webpack-runtime.js'`) → `rm -rf .next && npm run dev`. SQLite data is untouched.

## Architecture

**Server-authoritative.** SQLite owns the data; the browser reads/writes via `/api/*` only.

**`lib/` is split by trust boundary:**
- `lib/*.ts` (`types`, `dates`, `dayShape`, `freeSlots`, `schedule`, `utils`) — **pure, shared, client-safe.** No DB, no Node-only imports. `lib/schedule.ts` (the "brain", `proposeSlot`) and `lib/freeSlots.ts` are pure functions covered by `npm test`.
- `lib/server/*.ts` — **server-only** (DB access via `db/`, Google, push, auth). Never import these into client components.
- `lib/tasks.ts` — the **client** API layer: mutations are **optimistic**, then revalidate. Any task can appear in three SWR caches, so a mutation must invalidate all three: `/api/tasks`, `/api/today`, `/api/range`.

**The whole task/to-do distinction is one nullable column:** a `tasks` row with a `scheduledStart` is a calendar block; without one it's an unscheduled to-do. Data model is six tables in `lib/server/db/schema.ts` (`users`, `tasks`, `taskEvents` [append-only behavioural log, `taskId` deliberately not a FK so history survives deletion], `settings` [one JSON row per user], `googleAccount` [one row per user, refresh token], `pushSubscriptions`) — everything but `users` carries a `userId`.

**Auth:** Google OAuth sign-in → `users` row (matched by `google_sub`, falling back to email adoption) → signed httpOnly session cookie carrying the user id (`jose`). Route handlers get the caller via `requireUserId()` (`lib/server/session.ts`); every DB query is scoped by `userId`. `middleware.ts` gates everything except the `PUBLIC` list. `/api/google/callback` is intentionally public — it's an external redirect from Google that can't carry the session, so it's guarded by its own `g_state` CSRF cookie instead.

**Google sync is best-effort and never destructive on failure.** `/api/tasks` writes SQLite first, then mirrors to Calendar (`lib/server/calendar.ts`); if Google is down the task still saves. `lib/server/google.ts` stores the refresh token and silently refreshes access tokens; on a permanent `invalid_grant` it drops the credentials so the app flips to *disconnected* rather than erroring. `/api/today` (`lib/server/today.ts`) merges tasks with live Google events and reconciles deletions **only when the Google fetch succeeds**, so a transient outage never wipes tasks.

**Worker:** `worker/scheduler.ts` runs every minute (pings tasks about to start, once each via a `pingedAt` marker) and daily at `MORNING_SUMMARY_HOUR` (summary), via web-push to all subscribed browsers.

**UI:** `components/Shell.tsx` is the five-screen frame (Today/Calendar/To-do/Loose ends/Settings); `views/` holds the per-screen content; `components/Capture.tsx` is the shared add/edit sheet. Warm-paper "Cue" palette in `tailwind.config.js`; shadcn-style primitives in `components/ui/` themed via `components.json`; Motion (Framer) for spring micro-interactions.

