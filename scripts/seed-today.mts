/**
 * Seed today with a handful of scheduled blocks, so the Today view's
 * booked-vs-free overviews (capacity bar, timeline, summary) have real content
 * to render. Times are local clock times today.
 *
 *   npm run seed-today
 *
 * Writes straight to SQLite (no Google Calendar event is created). Use
 * `npm run clear-tasks` to wipe everything afterwards.
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { db } from "../lib/server/db";
import { tasks } from "../lib/server/db/schema";
import type { Importance } from "../lib/types";

interface Sample {
  title: string;
  /** Local 24h start time today, "HH:mm". */
  at: string;
  durationMinutes: number;
  importance: Importance;
  completed?: boolean;
}

/** A realistic day, echoing the reference: a big rock, quick wins, errands. */
const SAMPLES: Sample[] = [
  { title: "Morning pages", at: "08:15", durationMinutes: 30, importance: "low", completed: true },
  { title: "Inbox zero", at: "08:50", durationMinutes: 30, importance: "normal", completed: true },
  { title: "Finish the Q3 proposal", at: "09:30", durationMinutes: 90, importance: "high" },
  { title: "Reply to Priya", at: "11:30", durationMinutes: 15, importance: "normal" },
  { title: "Team standup", at: "13:00", durationMinutes: 30, importance: "normal" },
  { title: "Dentist", at: "14:00", durationMinutes: 60, importance: "normal" },
  { title: "Gym", at: "16:00", durationMinutes: 60, importance: "low" },
];

function startToday(hhmm: string): Date {
  const [h, m] = hhmm.split(":").map((n) => parseInt(n, 10));
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
}

function main() {
  const stamp = new Date().toISOString();
  const rows = SAMPLES.map((s) => ({
    id: randomUUID(),
    title: s.title,
    durationMinutes: s.durationMinutes,
    importance: s.importance,
    scheduledStart: startToday(s.at).toISOString(),
    googleEventId: null,
    completed: s.completed ?? false,
    completedAt: s.completed ? stamp : null,
    createdAt: stamp,
    updatedAt: stamp,
    pingedAt: null,
  }));

  db.insert(tasks).values(rows).run();

  console.log(`Seeded ${rows.length} blocks for today:`);
  for (const r of rows) {
    console.log(`  • ${r.title}  —  ${new Date(r.scheduledStart).toLocaleTimeString()}`);
  }
  console.log("\nOpen the app — Today will show booked vs free. Run `npm run clear-tasks` to remove them.");
}

try {
  main();
  process.exit(0);
} catch (err) {
  console.error("seed-today failed:", err);
  process.exit(1);
}
