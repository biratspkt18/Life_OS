# QA Audit — 2026-07-05

Full-app functional + edge-case sweep, then a fix pass. Every check and its outcome lives here.

**Legend:** ✅ pass · ✅* pass with a note · 🔧 failed → fixed → re-verified · ⚠️ provisional decision · ⏭ known gap, deliberately not fixed this pass

**Environment:** local dev (`npm run dev`), SQLite `data/lifeos.db`, timezone **UTC+9:30 (ACST, Adelaide)**. Google Calendar **connected** (live E2E per D1), push **off** (logic-level per D2).
**Method:** 2 parallel code-audit agents (Google sync; worker/auth) + curl API probes + pure-function probes + Chrome-driven UI walk + live Google E2E with `[QA]`-prefixed events (all cleaned up).
**Final state:** `npm run typecheck` clean · `npm test` 13/13 · all fixes re-verified live.

---

## Decisions log

| # | Question | Decision |
|---|----------|----------|
| D1 | Google sync testing against the real calendar? | Full E2E with `[QA]` events, cleaned up after |
| D2 | Push: logic-only or live? | Logic-only; delivery itself untested |
| D3 | Known-broken areas? | None — full sweep |
| D4 | Overdue to-dos on Today? | **Yes** — with redate + let-go actions → F1 |
| D5 ⚠️ | Completed task's Google event? | *Provisional (you were AFK):* keep the event as a record; completed tasks exempted from reconcile-deletion |
| D6 ⚠️ | Worker catch-up after sleep/restart? | *Provisional:* yes — pings fire up to 15 min late ("Was set for 9:00 — still doable?"), summary catches up on wake |
| D7 ⚠️ | `preferredDate` semantics? | *Provisional:* slot picker **pre-selects** the preferred day (earlier days remain available); docs now true |
| D8 ⚠️ | Multi-day all-day events on every spanned day? | *Provisional:* skipped — known display gap (first day only) |

---

## A. Auth & middleware

- ✅ Correct passcode → 200 + `lifeos_session`; wrong/empty → 401, no cookie
- ✅ No cookie → 401 (API) / 307 → `/login` (pages); tampered JWT → 401
- ✅ PUBLIC prefix matching exact — `/api/authX` → 401; `/api/push/vapid`, `/login` public
- 🔧 **F6** `COOKIE_SECRET`/`APP_PASSCODE` failed *open* when unset → now fail **closed** in production (boot error / no login), warn-and-fallback in dev; passcode compare is constant-time; `jwtVerify` pinned to HS256 (`lib/server/auth.ts`)
- ✅* No rate limiting on login — accepted for a single-user LAN app
- ✅* `g_state` CSRF guards the OAuth callback; lifetime raised 10 → 30 min (slow consent screens no longer strand the flow)

## B. Tasks API

- 🔧 **F2** POST/PATCH accepted garbage (empty title, `durationMinutes:-60`, `importance:"banana"`, `dueDate:"banana"`, `scheduledStart:"banana"`, `completed:"yes"`) → new runtime validation layer `lib/server/validate.ts` wired into all four routes; **10/10 probes now 400 on garbage, 200 on valid**
- ✅ PATCH complete/uncomplete stamps & clears `completedAt` server-side
- ✅ PATCH nonexistent → 404; DELETE nonexistent → 200 (idempotent, accepted)
- ✅ PATCH injection (`id`, `createdAt`, `googleEventId`) never persisted (explicit `.set()` whitelist); validation now also strips it from the response echo
- ✅ Conflict guards live-verified: overlapping POST → 409 with correct conflict body; PATCH into overlap → 409
- 🔧 `/api/today` + `/api/range` now 400 malformed/reversed ranges (was: silent `[]` / unvalidated)

## C. Scheduling brain

- ✅ Existing suite 13/13; disabled days skipped; all-disabled → `null` in 0 ms; 800-min task → `null` in 1 ms; after-hours `now` → next day; legacy `weekdayWindows` fallback; `findFreeSlots` caps respected
- ✅* DST-transition `atTime` correct on this machine; re-verify on an actual transition day
- 🔧 Negative durations produced 27 phantom slots — unreachable now that F2 rejects them at the gate
- 🔧 **F5** `preferredDate` was documented as "guides scheduling" but ignored → picker now **opens on the preferred day** (D7), suggestions keep sorting by it

## D. Today

- ✅ Renders with real data; DUE TODAY strip correct (due-today only, not overdue — by design pre-D4)
- 🔧 **F1** (from D4) new **Overdue strip**: slipped-due to-dos with `New due date` (opens `NewDateModal`) + `Let it go` (delete) — verified live with 4 real overdue tasks
- ✅ Day boundary at 00:xx local correct (whole session ran past midnight)
- ✅ Day navigation ±7 days; free-time summary; "Got a little room?" suggestions

## E. Calendar

- ✅ Month grid correct incl. adjacent-month padding; due-date dots land on correct **local** days despite UTC-shifted storage (timezone bucketing proven visually); day detail panel + "due this day" correct

## F. To-do + missed-date triage

- ✅ Groups: missed-due / missed-preferred / rest; both-missed → due only; due *today* ≠ missed (strict boundary)
- ✅ `New due date` (chip + calendar-grid paths) and `New preferred date` save, close, move the row, re-sort — zero console errors
- ✅ Delete from a missed row works; an emptied group unmounts cleanly
- ✅ A task re-dated into the future leaves Missed instantly (optimistic SWR)

## G. Loose ends

- ✅ Past-scheduled unchecked tasks collect here; provably disjoint from Missed (`scheduledStart` null vs set)
- 🔧 Copy nit: rows said "was **due**" for what is a scheduled start → now "was **set for**"

## H. Settings

- ✅ Renders: per-weekday windows, default duration, Google account (connected + email), reminders toggle
- ⏭ Deep validation of window edits (start ≥ end, prime outside window) untested this pass — `/api/settings` accepts the client's JSON as-is; queue a `validate.ts` extension if it ever bites

## I. Google Calendar sync

- ✅ **Live E2E all-pass:** create → real event id returned; reschedule → same event updated (no duplicate); Google-side delete → reconciler removes local task; cleanup left zero `[QA]` residue
- 🔧 **F9** reconciler could destroy real tasks three ways (truncated 2500-cap fetch treated as authoritative; Google-side reschedule beyond the ~36-day window; list lag right after create) → `listEvents` now paginates (`nextPageToken`), and deletion requires **per-event confirmation** via `events.get` (`eventExists`) — absence from a list is a suspicion, not a verdict; uncertainty always keeps the task
- 🔧 **F12** completed tasks are now exempt from reconcile-deletion (D5): tidying an old event in Google can no longer erase completion history
- 🔧 **F10** (partial) reconnect no longer wipes the stored email when `userinfo` hiccups; `g_state` 30 min
- ⏭ **F10** (remainder) swallowed Calendar write failures can still leave Google stale/orphaned (SQLite-first is by design); the duplicate-on-recreate path is rarer now but not closed — documented, not fixed
- ⏭ **F11** conflict-check TOCTOU (two concurrent creates can double-book) — single-user, two-device race; accepted risk, documented
- ✅ Unscheduled to-dos never touch Google; `invalid_grant` drops credentials → app flips to disconnected

## J. Worker & push

- 🔧 **F7** (per D6) sleep/restart no longer eats reminders: pings fire from `lead` before to **15 min after** a start ("Was set for 9:00 — still doable?"), and the morning summary is marker-file-tracked (`data/.last-summary`) so it fires on wake if 07:00 was missed — restart-proof, no double-send
- 🔧 **F8** hardening: garbage `PING_LEAD_MINUTES`/`MORNING_SUMMARY_HOUR` fall back with a warning instead of silently disabling pings / crashing the worker; overlapping-tick lock prevents duplicate sends; SQLite `busy_timeout = 5000` set for the shared file
- ✅ One bad push subscription can't block others; dead subs pruned on 404/410
- ⏭ Marker written only after a successful ping send — a send-then-write failure can re-ping once; 401/403 push failures retried forever (log noise only)
- ✅* Worker times are process-local — correct on this Mac; **deployment caveat:** on a UTC host, summary hour and "today" bucketing shift. Don't run `npm run worker` next to `npm run dev` (dev already spawns one)

## K. Cross-cutting

- ✅ Timezone: date-only fields round-trip local → UTC ISO → local without day drift under +9:30 (visually proven in Calendar; agent-verified in today/range bucketing). Latent all-day-event bug for **negative** UTC offsets only — noted
- ✅ SWR invalidation: every mutation goes through `lib/tasks.ts` which touches all three caches — observed live (rows move across views instantly)
- 🔧 **F3** no error boundary: one invalid stored date blanked the whole To-do screen (`RangeError` in `dayLabel`) → `components/ErrorBoundary.tsx`, keyed per view in the Shell. Proven live: poison row inserted directly into SQLite → friendly "This screen hit a snag" card, sidebar still works, other screens unaffected
- 🔧 **F4** invalid `scheduledStart` = invisible "ghost task" — unreachable via API now (F2); boundary catches any legacy garbage
- ✅ No `dangerouslySetInnerHTML` anywhere; React escaping covers title injection; PWA manifest served (200)
- ⏭ Missing-`.env` degradation untested this pass (would need a second sandbox instance)

---

## Fix pass — what changed

| Finding | Fix | Files |
|---|---|---|
| F2 validation | Runtime validation layer, 400s with reasons | `lib/server/validate.ts` (new), `app/api/tasks/*`, `app/api/today|range/route.ts` |
| F3 blast radius | Per-view error boundary | `components/ErrorBoundary.tsx` (new), `components/Shell.tsx` |
| F9/F12 reconcile | Pagination + confirm-before-destroy + completed-exempt | `lib/server/calendar.ts` (`eventExists`), `lib/server/today.ts` |
| F6 auth | Fail-closed prod secrets, constant-time compare, alg pin | `lib/server/auth.ts` |
| F7/F8 worker | Late-ping grace, marker-file summary catch-up, env guards, tick lock | `worker/scheduler.ts`, `lib/server/db/index.ts` |
| F10 partial | Email preserved on reconnect; `g_state` 30 min | `lib/server/google.ts`, `app/api/google/connect/route.ts` |
| F1 feature | Today Overdue strip (redate / let go) | `views/TodayView.tsx` |
| F5 / D7 | Picker pre-selects preferred day | `components/RescheduleModal.tsx` |
| copy | "was due" → "was set for" on Loose ends | `views/LooseEndsView.tsx` |

**Still seeded for you to play with:** the `[QA-era]` sample to-dos from the missed-dates feature build (`npm run seed-missed-dates` set). ⚠️ **Do not** clean them with `npm run clear-tasks` — it wipes *every* task including your real ones. Ask and I'll remove just the seeded titles.
