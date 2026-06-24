import "dotenv/config";
import cron from "node-cron";
import { eq } from "drizzle-orm";
import { db } from "../lib/server/db";
import { tasks } from "../lib/server/db/schema";
import { sendToAll } from "../lib/server/push";
import { isSameDay, timeLabel } from "../lib/dates";

const LEAD_MINUTES = parseInt(process.env.PING_LEAD_MINUTES ?? "5", 10);
const SUMMARY_HOUR = parseInt(process.env.MORNING_SUMMARY_HOUR ?? "7", 10);

/** Per-task ping: fire once, LEAD_MINUTES before a task starts. */
cron.schedule("* * * * *", async () => {
  const now = new Date();
  const horizon = new Date(now.getTime() + LEAD_MINUTES * 60_000);
  const rows = db.select().from(tasks).all();

  for (const t of rows) {
    if (t.completed || !t.scheduledStart || t.pingedAt) continue;
    const start = new Date(t.scheduledStart);
    if (start >= now && start <= horizon) {
      try {
        await sendToAll({
          title: t.title,
          body: `Starts at ${timeLabel(start)}`,
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
  }
});

/** Morning summary: today's remaining tasks, once a day. */
cron.schedule(`0 ${SUMMARY_HOUR} * * *`, async () => {
  const now = new Date();
  const today = db
    .select()
    .from(tasks)
    .all()
    .filter(
      (t) =>
        !t.completed &&
        t.scheduledStart &&
        isSameDay(new Date(t.scheduledStart), now),
    )
    .sort(
      (a, b) =>
        new Date(a.scheduledStart!).getTime() - new Date(b.scheduledStart!).getTime(),
    );

  if (today.length === 0) return;

  const body = today
    .map((t) => `${timeLabel(new Date(t.scheduledStart!))} · ${t.title}`)
    .join("\n");

  try {
    await sendToAll({
      title: `Today: ${today.length} thing${today.length === 1 ? "" : "s"}`,
      body,
      url: "/",
    });
  } catch (err) {
    console.error("[scheduler] summary failed:", err);
  }
});

console.log(
  `[scheduler] running · ping lead ${LEAD_MINUTES}m · summary ${SUMMARY_HOUR}:00`,
);
