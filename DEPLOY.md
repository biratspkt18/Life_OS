# Deploying Life OS to the droplet

Production deployment checklist for a single Ubuntu droplet (2 GB RAM) where
**Caddy already handles HTTPS** and reverse-proxies `life-os.biratspkt.com`
to the app on `localhost:3000`.

Architecture is unchanged from dev: Next.js + SQLite (`better-sqlite3`) + an
in-process `node-cron` worker, single-user passcode auth. No Docker, no
Postgres, no serverless.

The app is run by **two PM2 processes** — the Next server and the cron worker —
mirroring what `npm run dev` does locally with two processes.

The Next server binds to **`127.0.0.1:3000`** (via `next start -H 127.0.0.1` in
the `start:web` script), so it is reachable only by Caddy on the same box —
never directly on the droplet's public IP. Caddy terminates HTTPS and
reverse-proxies to `127.0.0.1:3000`.

---

## 0. Before you start: push the code

The deploy pulls from git, so commit and push these prod-readiness changes first
(from your laptop):

```bash
git add -A && git commit -m "prod: env-aware OAuth origin, PM2 setup, deploy docs"
git push
```

---

## 1. One-time server setup

SSH into the droplet, then:

### 1a. Set the timezone

The worker uses the server's **local** time for the morning summary
(`MORNING_SUMMARY_HOUR`) and "is this today" checks. A fresh droplet is UTC, so
set it to your zone or the 7 AM summary fires at 7 AM UTC:

```bash
sudo timedatectl set-timezone Asia/Kathmandu   # use your own zone
timedatectl                                    # confirm
```

### 1b. Install Node.js 20 LTS

Next 15 needs Node 18.18+; use the current LTS:

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
node -v   # expect v20.x
```

### 1c. Install PM2 globally

```bash
sudo npm install -g pm2
```

### 1d. Clone the repo

```bash
cd ~
git clone <your-repo-url> life-os
cd life-os
```

---

## 2. Create the production `.env`

In the repo root (`~/life-os/.env`). **These are the exact values** — some must
change from local, some carry over:

```bash
# --- MUST be set / changed for production ---
APP_PASSCODE=your-real-passcode
COOKIE_SECRET=paste-a-fresh-long-random-string        # see below
APP_ORIGIN=https://life-os.biratspkt.com
GOOGLE_REDIRECT_URI=https://life-os.biratspkt.com/api/google/callback

# --- Carries over unchanged from your local .env ---
GOOGLE_CLIENT_ID=...same as local...
GOOGLE_CLIENT_SECRET=...same as local...
VAPID_PUBLIC_KEY=...same as local...
VAPID_PRIVATE_KEY=...same as local...
VAPID_SUBJECT=mailto:you@example.com

# --- Defaults are fine; keep as local ---
DB_PATH=data/lifeos.db
PING_LEAD_MINUTES=5
MORNING_SUMMARY_HOUR=7
```

Generate a fresh `COOKIE_SECRET` (never reuse the local one):

```bash
openssl rand -base64 48
```

Why these change:
- **`COOKIE_SECRET`** signs session cookies — a new environment gets its own secret.
- **`APP_ORIGIN`** makes the post-login redirect stay on `https://…` behind Caddy.
- **`GOOGLE_REDIRECT_URI`** must be the public https callback (see step 3).

Why the rest carry over:
- **Google client ID/secret** identify the same OAuth app.
- **VAPID keys** are your push identity; keeping them stable keeps existing
  browser subscriptions valid.

> `.env` is read **once at startup**. If you edit it later, restart PM2
> (step 6).

---

## 3. Point Google OAuth at production

In [Google Cloud Console](https://console.cloud.google.com) → your OAuth 2.0
**Web application** client:

1. Under **Authorized redirect URIs**, add
   `https://life-os.biratspkt.com/api/google/callback`
   (you can keep the localhost one too for local dev).
2. If the OAuth consent screen is still in **Testing**, make sure your Google
   account is listed as a **test user**.

---

## 4. Install dependencies and build

```bash
cd ~/life-os
npm ci          # installs ALL deps (build + worker need devDependencies)
npm run build   # next build
```

> **Do not use `--omit=dev`.** The build needs Tailwind/PostCSS/TypeScript and
> the worker runs through `tsx` — all live in `devDependencies`. A dev-omitted
> install will fail to build or fail to start the worker.

### 4a. Create the database schema — REQUIRED, do not skip

```bash
npm run db:push   # creates the four tables in data/lifeos.db
```

The app opens the SQLite file on boot (creating an **empty** `data/lifeos.db`),
but it does **not** create the tables — `db:push` does. Skip this and the file
exists but has no tables, so every write fails with `no such table: tasks`
(and `settings`, `google_account`): the UI comes up empty, tasks won't save,
and **Google Calendar silently fails to connect** (the OAuth callback can't
persist the refresh token, so it never shows "Connected" and no events load).

Confirm the four tables exist before starting PM2:

```bash
npm run db:push  # re-running is a no-op once the schema is present
```

The `data/` directory (holding `lifeos.db`) is created automatically on first
run and is gitignored, so it is never touched by `git pull`. **The schema is
not** — run `npm run db:push` again after any pull that changes
`lib/server/db/schema.ts`.

> **Database path — important assumption.** `DB_PATH=data/lifeos.db` is
> *relative to the repo root*, so your live data lives at `~/life-os/data/`.
> This is safe **only** because you deploy by pulling into this same directory
> in place (step 7). It would be **wiped** if you ever deploy by re-cloning to a
> fresh directory, swapping the release folder, or running `rm -rf` on the repo.
> The SQLite WAL sidecars (`lifeos.db-wal`, `lifeos.db-shm`) live alongside it.
> If you later change deploy strategies, move the DB to an absolute path outside
> the repo (e.g. `DB_PATH=/home/<user>/life-os-data/lifeos.db`) and back that
> directory up.

---

## 5. Start under PM2

From the repo root:

```bash
pm2 start ecosystem.config.cjs   # starts life-os-web + life-os-worker
pm2 save                         # snapshot the process list
pm2 startup                      # prints one `sudo ...` line — run it once
```

`pm2 startup` + `pm2 save` make both processes come back automatically after a
reboot.

Check they're up:

```bash
pm2 status          # both should be "online"
pm2 logs life-os-web
pm2 logs life-os-worker   # look for "[scheduler] running ..."
```

---

## 6. Verify

1. Visit `https://life-os.biratspkt.com` → passcode screen loads over HTTPS.
2. Log in with `APP_PASSCODE`.
3. Settings → **Connect Google** → consent → you land back on the app with
   Google connected (this exercises `APP_ORIGIN` + the prod redirect URI).
4. Enable notifications and schedule a task a few minutes out to confirm the
   worker pings you.

---

## 7. Deploying future updates

From `~/life-os` on the droplet:

```bash
git pull
npm ci            # only strictly needed if dependencies changed, but safe
npm run db:push   # apply any schema changes (no-op if none) — safe to always run
npm run build
pm2 restart ecosystem.config.cjs   # or: pm2 restart all
```

Your SQLite data in `data/lifeos.db` is untouched by `git pull` and by the
rebuild — only the code changes.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| Google login redirects to `http://` or a wrong host | Confirm `APP_ORIGIN` is set in `.env` and you restarted PM2. |
| `redirect_uri_mismatch` from Google | The `.env` `GOOGLE_REDIRECT_URI` must match a URI listed in the Google Console client, exactly. |
| Cookie/login won't stick | Ensure you're on https (Caddy) and `NODE_ENV=production` — PM2 sets it via `ecosystem.config.cjs`. |
| No pings / no morning summary | `pm2 logs life-os-worker`; check the server timezone (step 1a). |
| App boots but crashes on start | `COOKIE_SECRET` and `APP_PASSCODE` must be set — the app fails closed in production without them. |
| `Cannot find module '…webpack-runtime.js'` | `rm -rf .next && npm run build && pm2 restart all`. Data is untouched. |
