import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import cron from "node-cron";
import { and, eq, gte, isNull, lt, lte } from "drizzle-orm";
import { db } from "../lib/server/db";
import { tasks, users } from "../lib/server/db/schema";
import { sendToUser } from "../lib/server/push";
import { config, logConfigSummary } from "../lib/server/config";
import { addDays, startOfDay, timeLabel } from "../lib/dates";

const LEAD_MINUTES = config.worker.pingLeadMinutes;
const SUMMARY_HOUR = config.worker.summaryHour;
/** How far past a start time a missed ping may still fire (laptop was asleep). */
const GRACE_MINUTES = 15;

/** Marker file so the morning summary survives worker restarts without re-firing. */
const SUMMARY_MARKER = path.join(
  path.dirname(path.resolve(config.dbPath)),
  ".last-summary",
);
const localDayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Per-user record of the last day each user's summary fired: { userId: dayKey }. */
type SummaryMarker = Record<string, string>;
const readMarker = (): SummaryMarker => {
  try {
    const parsed = JSON.parse(fs.readFileSync(SUMMARY_MARKER, "utf8"));
    return parsed && typeof parsed === "object" ? (parsed as SummaryMarker) : {};
  } catch {
    return {};
  }
};
const writeMarker = (m: SummaryMarker) => fs.writeFileSync(SUMMARY_MARKER, JSON.stringify(m));

/** One user's remaining scheduled tasks for today, soonest first. The
 *  [dayStart, dayEnd) bound is pushed into SQL so it rides the
 *  (user_id, scheduled_start) index instead of scanning the user's whole table. */
function remainingToday(userId: string, now: Date) {
  const dayStart = startOfDay(now).toISOString();
  const dayEnd = addDays(startOfDay(now), 1).toISOString();
  return db
    .select()
    .from(tasks)
    .where(
      and(
        eq(tasks.userId, userId),
        eq(tasks.completed, false),
        gte(tasks.scheduledStart, dayStart),
        lt(tasks.scheduledStart, dayEnd),
      ),
    )
    .all()
    .sort(
      (a, b) => new Date(a.scheduledStart!).getTime() - new Date(b.scheduledStart!).getTime(),
    );
}

async function sendSummary(userId: string, now: Date) {
  const today = remainingToday(userId, now);
  // Mark first: a summary that fails to send should not retry every minute all day.
  const marker = readMarker();
  marker[userId] = localDayKey(now);
  writeMarker(marker);
  if (today.length === 0) return;
  const body = today
    .map((t) => `${timeLabel(new Date(t.scheduledStart!))} · ${t.title}`)
    .join("\n");
  await sendToUser(userId, {
    title: `Today: ${today.length} thing${today.length === 1 ? "" : "s"}`,
    body,
    url: "/",
  });
}

let ticking = false;

/**
 * One tick a minute drives everything:
 *
 * Pings fire once per task (`pingedAt` marker), from LEAD_MINUTES before its
 * start until GRACE_MINUTES after — so a laptop that slept through the window
 * still gets a "this was meant to start" nudge instead of silence.
 *
 * The morning summary fires at SUMMARY_HOUR, tracked in a marker file rather
 * than a cron slot, so a worker that was down at 07:00 sends it on wake
 * instead of skipping the day.
 */
cron.schedule("* * * * *", async () => {
  if (ticking) return; // a slow previous tick must not double-send
  ticking = true;
  try {
    const now = new Date();

    // Per-task pings — each ping goes to that task's owner only. Only the
    // handful of tasks actually due soon are pulled (not every user's whole
    // table): incomplete, not yet pinged, starting within the
    // [now - grace, now + lead] window. The filtering happens in SQL, so the
    // per-minute tick never deserializes the whole tasks table into Node.
    const horizon = new Date(now.getTime() + LEAD_MINUTES * 60_000).toISOString();
    const earliest = new Date(now.getTime() - GRACE_MINUTES * 60_000).toISOString();
    const due = db
      .select()
      .from(tasks)
      .where(
        and(
          eq(tasks.completed, false),
          isNull(tasks.pingedAt),
          gte(tasks.scheduledStart, earliest),
          lte(tasks.scheduledStart, horizon),
        ),
      )
      .all();
    for (const t of due) {
      const start = new Date(t.scheduledStart!);
      const lateMs = now.getTime() - start.getTime();
      try {
        await sendToUser(t.userId, {
          title: t.title,
          body:
            lateMs > 0
              ? `Was set for ${timeLabel(start)} — still doable?`
              : `Starts at ${timeLabel(start)}`,
          url: "/",
        });
        db.update(tasks)
          .set({ pingedAt: new Date().toISOString() })
          .where(eq(tasks.id, t.id))
          .run();
      } catch (err) {
        console.error("[scheduler] ping failed:", err);
      }
    }

    // Morning summary (with restart catch-up), once per user per day.
    if (now.getHours() >= SUMMARY_HOUR) {
      const marker = readMarker();
      const day = localDayKey(now);
      for (const u of db.select().from(users).all()) {
        if (marker[u.id] === day) continue;
        try {
          await sendSummary(u.id, now);
        } catch (err) {
          console.error("[scheduler] summary failed:", err);
        }
      }
    }
  } finally {
    ticking = false;
  }
});

logConfigSummary();
console.log(
  `[scheduler] running · ping lead ${LEAD_MINUTES}m (+${GRACE_MINUTES}m grace) · summary ${SUMMARY_HOUR}:00 w/ catch-up`,
);
