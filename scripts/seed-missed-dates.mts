/**
 * Seed the database with unscheduled to-dos whose due / preferred date has
 * already slipped — the rows the To-do "Missed" sections triage.
 *
 *   npm run seed-missed-dates
 *
 * Inserts a spread: past due dates, past preferred dates, one task that missed
 * both (should appear under "Missed due date" only), plus two healthy controls
 * that must stay in the normal list. No `scheduledStart` is set, so nothing
 * lands on the calendar or in Loose ends, and the worker never pings them.
 * Writes straight to SQLite; `npm run clear-tasks` wipes them afterwards.
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { startOfDay, subDays, addDays } from "date-fns";
import { db } from "../lib/server/db";
import { tasks } from "../lib/server/db/schema";
import type { Importance } from "../lib/types";

interface Sample {
  title: string;
  /** Days relative to today; negative = past. Null = unset. */
  dueInDays: number | null;
  preferredInDays: number | null;
  durationMinutes: number;
  importance: Importance;
}

const SAMPLES: Sample[] = [
  // Missed due dates (most overdue first once sorted).
  { title: "Renew car insurance", dueInDays: -3, preferredInDays: null, durationMinutes: 30, importance: "high" },
  { title: "Email the landlord about the leak", dueInDays: -1, preferredInDays: null, durationMinutes: 15, importance: "normal" },
  // Missed both — must show under "Missed due date" only.
  { title: "Start the tax return", dueInDays: -6, preferredInDays: -8, durationMinutes: 60, importance: "high" },
  // Missed preferred dates only.
  { title: "Try the new gym class", dueInDays: null, preferredInDays: -2, durationMinutes: 60, importance: "low" },
  { title: "Plan Mum's birthday dinner", dueInDays: null, preferredInDays: -4, durationMinutes: 30, importance: "normal" },
  // Healthy controls — should stay under the plain list.
  { title: "Read the sprint notes", dueInDays: 2, preferredInDays: null, durationMinutes: 15, importance: "normal" },
  { title: "Pick a holiday paperback", dueInDays: null, preferredInDays: null, durationMinutes: 15, importance: "low" },
];

function dayIso(offsetDays: number): string {
  const today = startOfDay(new Date());
  return (offsetDays < 0 ? subDays(today, -offsetDays) : addDays(today, offsetDays)).toISOString();
}

function main() {
  const stamp = new Date().toISOString();

  const rows = SAMPLES.map((s) => ({
    id: randomUUID(),
    title: s.title,
    durationMinutes: s.durationMinutes,
    importance: s.importance,
    scheduledStart: null,
    dueDate: s.dueInDays != null ? dayIso(s.dueInDays) : null,
    preferredDate: s.preferredInDays != null ? dayIso(s.preferredInDays) : null,
    googleEventId: null,
    completed: false,
    completedAt: null,
    createdAt: stamp,
    updatedAt: stamp,
    pingedAt: null,
  }));

  db.insert(tasks).values(rows).run();

  console.log(`Seeded ${rows.length} to-dos:`);
  for (const r of rows) {
    const bits = [
      r.dueDate ? `due ${r.dueDate.slice(0, 10)}` : null,
      r.preferredDate ? `preferred ${r.preferredDate.slice(0, 10)}` : null,
    ].filter(Boolean);
    console.log(`  • ${r.title}  —  ${bits.length ? bits.join(", ") : "no dates"}`);
  }
  console.log(
    "\nOpen the To-do screen — slipped ones gather under “Missed”. Run `npm run clear-tasks` to remove them.",
  );
}

try {
  main();
  process.exit(0);
} catch (err) {
  console.error("seed-missed-dates failed:", err);
  process.exit(1);
}
