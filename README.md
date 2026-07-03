# Life OS

A personal, single-user, **scheduling-first** task manager for an ADHD brain.

> You add a task; the app slots it into a time you're actually free. It mirrors
> your tasks to **Google Calendar** (two-way), reads your existing calendar
> events onto the Today screen, and sends **push reminders** (a ping before each
> task + a morning summary). The app proposes; you decide.

A Next.js app with a small SQLite-backed backend, in-browser Google OAuth (with a
persisted refresh token, so the connection survives restarts), and an in-process
reminder scheduler.

---

## Features

- **Capture → schedule.** Add a task and pick from the times you're actually
  free that day — the picker dodges your other tasks and Google events, never
  offers the past, and never double-books. A calm Apple-Clock-style hour/minute
  wheel (keyboard-friendly) sets custom durations.
- **To-do list.** Not ready to schedule? Add a to-do with an optional **due
  date** and **preferred date**, then slot it onto a day later from the same
  free-time picker. (A preferred date is hidden once the deadline is today/
  tomorrow, and can never fall after the due date.)
- **Deadlines on the calendar & Today.** To-do due dates show as a terracotta
  **deadline dot** on every month-grid day, a **"Due this day"** list on the
  selected day, and a **"Due today"** section on the Today screen.
- **Edit & delete anywhere.** Every one of your own tasks carries a **⋯ menu**
  (edit · reschedule · delete, plus schedule/mark-done where relevant) — on
  Today, the Spotlight, the calendar day agenda, the to-do list, loose ends,
  Done today, and the timeline popover. Editing keeps a done task done. Google
  events stay read-only throughout.
- **Satisfying completion.** Checking a task springs the box, draws the tick,
  pulses a ring, sweeps a soft "done" wash across the row, then collapses it
  away — and it's **optimistic**, so it happens instantly. Undo any of it from
  **Done today** (the checkbox un-ticks).
- **Now / Next spotlight.** The Today screen leads with one big card: whatever
  you're *in* right now (with a live progress bar and "about 25 min left"), or
  the next thing coming up. Your own tasks carry the checkbox and ⋯ menu; Google
  meetings show read-only.
- **Nothing falls through — a gentle catch-up on login.** When you open the app
  and something slipped past unchecked, a calm **"A few things slipped past"**
  panel offers **Push all to tomorrow** (the scheduling brain finds each one a
  fresh slot) or a per-task choice — move to tomorrow, pick a day, mark done, or
  let it go. Dismiss with **Not now** and they wait in **Loose ends**.
- **Free-slot rescheduling.** "Find a time" only ever offers openings that fit,
  grouped **Morning / Afternoon / Evening**, with a day rail of days that have
  room — no manual time entry, nothing you can't actually do.
- **Smart "Got a little room?"** Suggests slipped tasks *and* unscheduled to-dos
  that genuinely fit an open block today (≥30 min of real room), ordered by
  soonest-fit, then urgency (due/preferred date), then importance.
- **Google Calendar sync (both ways).** New/edited/deleted tasks mirror to your
  calendar; deleting an event in Google removes the task from the app; and your
  existing Google events show up read-only on the Today and Calendar screens. A
  dead/expired token is detected automatically and prompts a reconnect instead
  of failing silently.
- **Push reminders.** A ping a few minutes before each task, plus a morning
  summary (web-push; works on desktop and installed mobile PWAs).
- **Loose ends.** A task whose time slips by unchecked drops out of the Today
  timeline and gathers in a calm **Loose ends** section, each with one-tap
  re-homing (mark done / find a time / edit / delete).
- **Per-weekday schedule shape.** Each day gets its own working window + a
  "prime" focus block (or is marked off entirely). The **scheduling brain**
  respects it: high-importance work is placed in prime time first — bumping a
  lighter task out of the way if it has to — while normal/light work seeks the
  edges of the day and only spills into prime as a last resort. It never books
  the past, never double-books, and rolls to the next day's prime when today is
  full. This brain powers the "Push all to tomorrow" catch-up; the free-slot
  picker (below) is the hands-on counterpart when you'd rather choose yourself.
- **Polished, animated UI.** A warm-paper "Cue" design system with spring
  micro-interactions (Motion) — a sliding calendar selection, staggered day
  reveals, animated sheets and menus — and shadcn-style primitives themed to the
  palette. The Today list shows only the next 3 items (the timeline shows the
  rest) and day-browsing is bounded to ±7 days.

---

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js (App Router) + React + TypeScript |
| Database | SQLite via Drizzle ORM + better-sqlite3 (`data/lifeos.db`) |
| Calendar | `googleapis` — OAuth2 + automatic access-token refresh |
| Push | `web-push` (VAPID) + a custom service worker |
| Scheduler | `node-cron` worker (`worker/scheduler.ts`), runs beside Next |
| Client data | SWR — optimistic create/complete/reschedule, revalidated across `/api/tasks`, `/api/today`, `/api/range` |
| Auth | single passcode → signed httpOnly cookie (`jose`) |
| Styling | Tailwind CSS (warm-paper "Cue" palette) + shadcn-style primitives themed to it (`class-variance-authority`, `clsx`, `tailwind-merge`) |
| Motion | `motion` (Framer Motion) — spring micro-interactions, layout/shared-element animations |

The data is **server-authoritative**: the SQLite DB owns tasks; the browser
reads/writes via `/api/*`.

### Data model

Four small tables (`lib/server/db/schema.ts`):

| Table | What it holds |
|---|---|
| `tasks` | Every task/to-do: `title`, `durationMinutes`, `importance` (high/normal/low), `scheduledStart` (null = an unscheduled to-do), `dueDate` + `preferredDate` (to-do dates), `googleEventId` (link to its calendar event), `completed`/`completedAt`, and `pingedAt` (so a start-time reminder fires once). |
| `settings` | A single `"app"` row — one JSON blob: the seven per-weekday windows, the legacy/template window, default task length, and the `pushEnabled` / `googleConnected` flags. |
| `googleAccount` | A single `"app"` row — the Google **refresh token** (silent reconnect), the cached access token + expiry, and the connected `email` / `calendarId`. |
| `pushSubscriptions` | One row per subscribed browser (`endpoint` + encryption keys); dead ones are pruned automatically when a push bounces. |

A **task with a `scheduledStart`** is a calendar block; **without one** it's a
to-do waiting in the list. That one nullable column is the whole distinction.

### API surface

All under `app/api/*`, session-gated except the Google callback:

- **`/api/tasks`** (`GET` list · `POST` create — `409` on a time clash) and
  **`/api/tasks/[id]`** (`PATCH` edit/complete/reschedule · `DELETE`).
- **`/api/today`** and **`/api/range`** — a day's / a month's worth of Life OS
  tasks merged with live Google events (today reconciles deletions; range is
  read-only for fast browsing).
- **`/api/settings`** (`GET` · `PATCH`).
- **`/api/auth/{login,logout}`** — passcode → signed cookie.
- **`/api/google/{connect,callback,status,disconnect}`** — the OAuth flow and
  connection state.
- **`/api/push/{subscribe,unsubscribe,vapid}`** — register a browser for
  reminders and hand it the VAPID public key.

---

## Prerequisites

- **Node.js 18.18+** (20 LTS or newer recommended; tested on 20–24).
- **npm** (ships with Node).
- A **Google account** — only if you want calendar sync. The app runs fully
  without it; calendar features just stay off.

---

## Quick start

```bash
git clone <your-fork-url> life-os
cd life-os
npm install
cp .env.example .env          # then edit .env (see Configuration below)
npm run db:push               # create the SQLite schema in data/lifeos.db
npm run dev                   # http://localhost:3000  (Next + the reminder worker)
```

Open <http://localhost:3000>, log in with the `APP_PASSCODE` you set, and you're
running. To turn on calendar sync and reminders, see **Using the app** below.

> The minimum to boot is just `APP_PASSCODE` and `COOKIE_SECRET`. Google and
> VAPID are optional — fill them in when you want those features.

---

## Configuration (`.env`)

Copy `.env.example` to `.env` and fill it in. `.env` and `data/` are gitignored,
so your secrets and database are never committed.

### Required

- **`APP_PASSCODE`** — what you type on the login screen (single-user gate).
- **`COOKIE_SECRET`** — a long random string used to sign the session cookie.
  Generate one:
  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```
- **`DB_PATH`** — where the SQLite file lives (default `data/lifeos.db`).

### Optional: Google Calendar

This is the part that trips people up, so here's the full walkthrough. You only
do it **once**; your end users (if you ever ship this) never see it.

1. **Create a project** — [Google Cloud Console](https://console.cloud.google.com)
   → project dropdown → **New Project** → select it.
2. **Enable the API** — **APIs & Services → Library** → search
   **"Google Calendar API"** → **Enable**.
3. **Configure the consent screen** — **APIs & Services → OAuth consent screen**
   (newer UI: **Google Auth Platform**, at
   <https://console.cloud.google.com/auth/overview>):
   - When asked **User data** vs **Application data**, choose **User data**
     (this creates an OAuth client; Application data makes a service account,
     which this app does **not** use).
   - **User type: External.** Fill app name, your support email, and the
     developer contact email. **Don't upload a logo** (it forces verification).
   - **Scopes:** you can skip this screen — the app requests
     `calendar.events`, `openid`, `email` at connect time.
   - **Publishing status — important:**
     - **Testing** mode requires adding your Google account under **Test users**,
       *and* Google expires the connection every ~7 days (you'd re-Connect
       weekly).
     - **Recommended:** click **Publish app** (status → *In production*). It
       stays unverified — you'll click through a one-time *"Google hasn't
       verified this app"* warning (**Advanced → Go to … (unsafe)** — safe, it's
       your own app) — but the connection no longer expires weekly and you don't
       manage a test-user list.
4. **Create credentials** — **APIs & Services → Credentials → Create
   Credentials → OAuth client ID → Web application.**
   - Leave **Authorized JavaScript origins** empty.
   - Under **Authorized redirect URIs**, add **exactly**:
     ```
     http://localhost:3000/api/google/callback
     ```
     (http not https, no trailing slash — must match `GOOGLE_REDIRECT_URI`.)
   - **Create**, then copy the **Client ID** and **Client Secret**.
5. **Put them in `.env`:**
   ```
   GOOGLE_CLIENT_ID=...apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=GOCSPX-...
   GOOGLE_REDIRECT_URI=http://localhost:3000/api/google/callback
   ```
6. **Restart the dev server** (`.env` is read once at startup), then connect from
   inside the app (see below).

> **Cost:** none. The Google Cloud project, the Calendar API, OAuth, and
> verification for this scope are all free. You'd only pay if you self-host it
> publicly (ordinary server/hosting costs, nothing from Google).

### Optional: push reminders (VAPID)

Generate a key pair once and paste it in:

```bash
npx web-push generate-vapid-keys
```

```
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:you@example.com
```

### Optional: scheduler tuning

- **`PING_LEAD_MINUTES`** — minutes before a task to ping (default 5).
- **`MORNING_SUMMARY_HOUR`** — local hour 0–23 for the daily summary (default 7).

---

## Using the app

1. Open <http://localhost:3000> and log in with `APP_PASSCODE`.
2. **Connect Google Calendar.** A prompt appears on the **Today** screen (also in
   **Settings → Connect & notify**). Click **Connect** → approve on Google. Once
   connected, new scheduled tasks become calendar events and your existing Google
   events appear on Today.
3. **Enable reminders.** In **Settings → Connect & notify**, click **Enable** and
   allow notifications.
4. **Add a task or a to-do.** Tap **Add a task** (or press **n**), then either
   **Schedule** it — pick a day and tap one of the free-time slots — or drop it
   on the **To-do list** with an optional due/preferred date. It's mirrored to
   your calendar if connected.
5. **Manage anything** from its **⋯ menu**: edit, reschedule (into a free slot),
   or delete. Check a task off from its box (undo it later under **Done today**).

---

## Commands

```bash
npm run dev          # Next (http://localhost:3000) + the cron worker
npm run build        # production build
npm start            # next start + worker
npm run worker       # run only the reminder worker
npm run db:push      # apply the Drizzle schema to the SQLite file
npm run typecheck    # tsc --noEmit
npm test             # scheduling-brain test suite
npm run clear-tasks      # wipe every task (see below)
npm run seed-loose-ends  # add past, unchecked tasks for testing (see below)
npm run seed-today       # add a realistic day of scheduled blocks (see below)
```

### Clear all tasks

Wipe every task from the database (settings, the Google connection, and push
subscriptions are left untouched):

```bash
npm run clear-tasks          # lists the tasks, then asks to confirm
npm run clear-tasks -- --yes # skip the confirmation prompt
```

It uses the app's own delete path, so any tasks linked to Google Calendar have
their events removed too (when connected). Works whether or not the dev server is
running.

### Seed loose ends (for testing)

Insert past, unchecked tasks so you can see the **Loose ends** section (and the
login reschedule loop) without waiting for real tasks to slip by:

```bash
npm run seed-loose-ends              # a hand-picked set (earlier today → a few days ago)
npm run seed-loose-ends -- --count 12 # spread N generated tasks across the last week
```

It writes straight to SQLite (no Google Calendar events are created), so it works
offline and won't touch a connected calendar. Remove them with `npm run
clear-tasks`.

### Seed a day (for testing)

Fill today with a realistic set of scheduled blocks (a couple already done), so
the timeline, Done-today, and "Got a little room?" have something to render:

```bash
npm run seed-today
```

Also SQLite-only (no calendar events). Clear with `npm run clear-tasks`.

---

## Troubleshooting

- **`Error 403: access_denied` when connecting** — your Google app is in
  *Testing* mode and your account isn't a test user. Either add yourself under
  **OAuth consent screen → Test users**, or **Publish app** (recommended). See
  the Google setup above.
- **"Google hasn't verified this app"** — expected for an unverified personal
  app. Click **Advanced → Go to … (unsafe)**. It's your own app.
- **`redirect_uri_mismatch`** — the redirect URI in Google Cloud must match
  `GOOGLE_REDIRECT_URI` *exactly* (`http://localhost:3000/api/google/callback`).
- **Google events stopped showing / "reconnect" keeps failing** — the stored
  token likely expired (`invalid_grant`; common in *Testing* mode after ~7 days).
  The app now detects a dead token, drops it, and shows a **Connect Google
  Calendar** prompt. Two things to know when reconnecting:
  - **Do the whole flow on the same origin as `GOOGLE_REDIRECT_URI`** (i.e.
    `http://localhost:3000`). The OAuth `g_state` CSRF cookie is per-origin, so
    if you start "Connect" on a *different* port (e.g. a second dev server on
    3001) the callback lands on :3000 without the cookie and fails with
    `state_mismatch` / `no_state_cookie`. Run one server, on the port your
    redirect URI uses.
  - On failure the app returns to `/?google=error&reason=…` — the `reason`
    tells you which step broke (`state_mismatch`, `exchange_failed`,
    `access_denied`).
- **Tasks aren't appearing on the calendar** — confirm Settings shows
  *Connected*, and remember `.env` is read **once at startup**: after editing
  Google credentials you must **restart** `npm run dev`.
- **Pages/API suddenly 500 with `Cannot find module '…webpack-runtime.js'`** —
  a corrupted Next dev cache (common after many restarts). Fix:
  ```bash
  rm -rf .next && npm run dev
  ```
  Your data lives in SQLite and is untouched by this.
- **No reminders** — set the VAPID keys, click **Enable** in Settings, and allow
  browser notifications. On iOS, push only works once the app is **installed to
  the Home Screen**.
- **Calendar changes feel slow** — the Today screen syncs from Google on a ~30s
  poll and on window focus (true push would need a public HTTPS webhook, which
  localhost can't provide).

---

## How it fits together

- **Five screens** (`components/Shell.tsx`) — **Today**, **Calendar**,
  **To-do**, **Loose ends**, and **Settings**, as a desktop sidebar or a mobile
  bottom bar. The **Capture** sheet handles both *Add a task* (schedule mode)
  and *Add a to-do* (with due/preferred dates) and doubles as the in-place
  **editor**; Settings has a per-weekday editor (each day its own window + prime
  block, or marked off).
- **`lib/schedule.ts`** — the scheduling **brain** (`proposeSlot`): given a task
  and the day's shape, it picks a start time — prime block first for important
  work (bumping a lighter task if needed), the day's edges for the rest, rolling
  to the next day when full, never in the past. It's a pure function (covered by
  `npm test`) and powers the login catch-up's "Push all to tomorrow."
- **`components/RescheduleLoop.tsx`** — the on-login catch-up. If tasks slipped
  past unchecked, it surfaces them one calm panel at a time and re-homes each
  through the brain, re-reading state after every move so bulk "push to
  tomorrow" doesn't stack two things on the same slot.
- **`lib/freeSlots.ts`** — enumerates concrete free start-times a task fits into,
  dodging your other tasks and Google events inside each day's window. It powers
  the "Find a time" modal, the in-sheet slot chips, and the "Got a little room?"
  suggestions. (Slots resume at the *exact* end of a preceding block, so a short
  gap like 3:15–3:30 is offered, not rounded away.)
- **`/api/tasks`** — create/patch/delete write SQLite and then **best-effort**
  mirror to Google Calendar (`lib/server/calendar.ts`). If Google is disconnected
  or down, the task still saves; the event just isn't created. On the client,
  mutations in `lib/tasks.ts` update **optimistically** (instant), then revalidate
  every affected cache — `/api/tasks` (lists), `/api/today` (day views), and
  `/api/range` (month grid) — since a task shows in all three.
- **`/api/today`** — the Today view's data source (`lib/server/today.ts`). It
  merges Life OS tasks with **events read live from Google Calendar** (so
  meetings you created in Google show up too, read-only), and reconciles
  **deletions**: if a task's calendar event was deleted in Google, the task is
  removed from the database. This only runs when the Google fetch succeeds, so a
  transient outage never wipes tasks, and it keys off the event id, so *moving* an
  event in Google reschedules rather than deletes.
- **`lib/server/google.ts`** — stores the **refresh token** on connect; every
  calendar call refreshes the short-lived access token automatically (silent
  reconnect that survives restarts). If a call comes back `invalid_grant` (the
  refresh token is permanently dead), it drops the dead credentials so the app
  flips to *disconnected* and prompts a reconnect rather than erroring silently.
  The OAuth **callback route is public** (an external redirect from Google can't
  carry the app session), guarded instead by its own `g_state` CSRF cookie.
- **`worker/scheduler.ts`** — every minute, pings tasks about to start (once
  each, via a `pingedAt` marker); daily at `MORNING_SUMMARY_HOUR`, sends a
  summary. Both go out as web-push to every subscribed browser.

---

## Caveats

- **Refresh-token lifetime:** while the Google app is in **Testing** mode, Google
  expires refresh tokens after ~7 days, so you'll re-click **Connect**
  occasionally. Publishing the app (or using a Workspace *Internal* app) removes
  this. It's a Google policy, not a Life OS limit.
- **iOS push** only works when the app is installed to the Home Screen.
- **Single-user by design.** One passcode, one Google connection, one local
  database. Serving multiple people would require real per-user accounts and a
  hosted database.
- This build targets **localhost**. Deploying would need an always-on host (for
  the worker) and HTTPS; the SQLite + in-process-cron design assumes one
  long-running machine.

---

## Layout

```
app/             layout · page (Shell) · login · api/* route handlers
                 (api: tasks · today · range · settings · auth · google · push)
components/       Shell · Capture (add/edit sheet) · Spotlight · TaskRow ·
                 Checkbox · DayFeed · DoneToday · Timeline (overview/) ·
                 RescheduleModal (free-slot picker) · RescheduleLoop ·
                 LooseEndSuggestion · FreeSlotChips · ActionMenu (⋯ menu) ·
                 ConnectPanel · ConnectPrompt · pickers (duration wheel, day) ·
                 icons · ui/button (themed shadcn primitive)
views/            TodayView · CalendarView · InboxView (To-do) ·
                 LooseEndsView · SettingsView
hooks/            useNow · useDb (SWR-backed) · useSuggestions
                 ("got a little room?") · useCheckOff (satisfying complete)
lib/
  types · dates · dayShape · freeSlots · schedule (the brain) · utils (cn)  (pure; shared)
  tasks (client API, optimistic) · client/push
  server/
    db/{schema,index} · auth · settings · tasks · conflicts ·
    google · calendar · today · range · push
components.json                 shadcn config (themed to the Cue palette)
worker/scheduler.ts             cron: per-task ping + morning summary
scripts/          brain.test.mts · clear-tasks.mts · seed-loose-ends.mts · seed-today.mts
public/sw.js · manifest.webmanifest
```
