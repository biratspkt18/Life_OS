# Daybook

A personal, single-user, **scheduling-first** task manager for an ADHD brain.

> You jot a thought; the app turns it into a scheduled block. It mirrors your
> tasks to **Google Calendar** (two-way), reads your existing calendar events
> onto the Today screen, and sends **push reminders** (a ping before each task +
> a morning summary). The app proposes; you decide.

A Next.js app with a small SQLite-backed backend, in-browser Google OAuth (with a
persisted refresh token, so the connection survives restarts), and an in-process
reminder scheduler.

---

## Features

- **Capture → schedule.** Jot a task; it becomes a time-blocked event.
- **Google Calendar sync (both ways).** New/edited/deleted tasks mirror to your
  calendar; deleting an event in Google removes the task from the app; and your
  existing Google events show up read-only on the Today screen.
- **Push reminders.** A ping a few minutes before each task, plus a morning
  summary (web-push; works on desktop and installed mobile PWAs).
- **Reschedule loop.** Past-due tasks are gently collected for one-tap re-homing.
- **Per-weekday schedule shape.** Each day gets its own working window + a
  "prime" focus block, which the scheduling brain respects.

---

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js (App Router) + React + TypeScript |
| Database | SQLite via Drizzle ORM + better-sqlite3 (`data/daybook.db`) |
| Calendar | `googleapis` — OAuth2 + automatic access-token refresh |
| Push | `web-push` (VAPID) + a custom service worker |
| Scheduler | `node-cron` worker (`worker/scheduler.ts`), runs beside Next |
| Client data | SWR (fetch/revalidate + optimistic updates) |
| Auth | single passcode → signed httpOnly cookie (`jose`) |
| Styling | Tailwind CSS (warm-paper palette) |

The data is **server-authoritative**: the SQLite DB owns tasks; the browser
reads/writes via `/api/*`.

---

## Prerequisites

- **Node.js 18.18+** (20 LTS or newer recommended; tested on 20–24).
- **npm** (ships with Node).
- A **Google account** — only if you want calendar sync. The app runs fully
  without it; calendar features just stay off.

---

## Quick start

```bash
git clone <your-fork-url> daybook
cd daybook
npm install
cp .env.example .env          # then edit .env (see Configuration below)
npm run db:push               # create the SQLite schema in data/daybook.db
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
- **`DB_PATH`** — where the SQLite file lives (default `data/daybook.db`).

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
4. **Add a task.** Tap the **+** (or press **n**), give it a time, and it's
   scheduled — and mirrored to your calendar if connected.

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

- **Capture / Today / Settings** — Capture defaults to *tomorrow at 2 PM* with a
  date picker; Settings has a per-weekday editor (each day its own window + prime
  block, or marked off).
- **`/api/tasks`** — create/patch/delete write SQLite and then **best-effort**
  mirror to Google Calendar (`lib/server/calendar.ts`). If Google is disconnected
  or down, the task still saves; the event just isn't created.
- **`/api/today`** — the Today view's data source (`lib/server/today.ts`). It
  merges Daybook tasks with **events read live from Google Calendar** (so
  meetings you created in Google show up too, read-only), and reconciles
  **deletions**: if a task's calendar event was deleted in Google, the task is
  removed from the database. This only runs when the Google fetch succeeds, so a
  transient outage never wipes tasks, and it keys off the event id, so *moving* an
  event in Google reschedules rather than deletes.
- **`lib/server/google.ts`** — stores the **refresh token** on connect; every
  calendar call refreshes the short-lived access token automatically. This is the
  silent reconnect — it survives server restarts.
- **`worker/scheduler.ts`** — every minute, pings tasks about to start (once
  each, via a `pingedAt` marker); daily at `MORNING_SUMMARY_HOUR`, sends a
  summary. Both go out as web-push to every subscribed browser.

---

## Caveats

- **Refresh-token lifetime:** while the Google app is in **Testing** mode, Google
  expires refresh tokens after ~7 days, so you'll re-click **Connect**
  occasionally. Publishing the app (or using a Workspace *Internal* app) removes
  this. It's a Google policy, not a Daybook limit.
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
                 (api: tasks · today · settings · auth · google · push)
components/       Capture · Spotlight · TaskRow · RescheduleLoop ·
                 ConnectPanel · ConnectPrompt · pickers · icons · Shell
views/            TodayView · SettingsView
hooks/            useNow · useDb (SWR-backed)
lib/
  types · dates · schedule       (pure; shared client + server)
  tasks (client API) · client/push
  server/
    db/{schema,index} · auth · settings · tasks · google · calendar · today · push
worker/scheduler.ts             cron: per-task ping + morning summary
scripts/          brain.test.mts · clear-tasks.mts
public/sw.js · manifest.webmanifest
```
