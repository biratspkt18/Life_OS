/**
 * Seed the database with past, unchecked tasks — i.e. "loose ends".
 *
 * Each task is given a `scheduledStart` in the past and left uncompleted, so it
 * drops out of the Today timeline and gathers in the Loose ends section.
 *
 *   npm run seed-loose-ends            # inserts the default sample set
 *   npm run seed-loose-ends -- --count 12   # spread N tasks across the past week
 *
 * Writes straight to SQLite (no Google Calendar event is created), so it works
 * offline and won't pollute a connected calendar. Use `npm run clear-tasks` to
 * wipe everything afterwards.
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { db } from "../lib/server/db";
import { tasks } from "../lib/server/db/schema";
import type { Importance } from "../lib/types";

/** A loose end = a title, how far in the past it started, its length + weight. */
interface Sample {
  title: string;
  /** Minutes before "now" the task was scheduled to start. */
  minutesAgo: number;
  durationMinutes: number;
  importance: Importance;
}

const MIN = 1;
const HOUR = 60;
const DAY = 24 * HOUR;

/** A hand-picked spread: earlier today, yesterday, and a few days back. */
const SAMPLES: Sample[] = [
  { title: "Reply to Dana's email", minutesAgo: 45 * MIN, durationMinutes: 15, importance: "normal" },
  { title: "Morning stretch", minutesAgo: 3 * HOUR, durationMinutes: 15, importance: "low" },
  { title: "Submit the expense report", minutesAgo: 5 * HOUR, durationMinutes: 30, importance: "high" },
  { title: "Call the dentist", minutesAgo: 1 * DAY + 2 * HOUR, durationMinutes: 15, importance: "normal" },
  { title: "Review the design doc", minutesAgo: 1 * DAY + 6 * HOUR, durationMinutes: 60, importance: "high" },
  { title: "Water the plants", minutesAgo: 2 * DAY, durationMinutes: 15, importance: "low" },
  { title: "Back up the laptop", minutesAgo: 3 * DAY + 4 * HOUR, durationMinutes: 30, importance: "normal" },
];

const IMPORTANCES: Importance[] = ["low", "normal", "high"];

/** Build N generated samples spread across the last week (for `--count N`). */
function generate(count: number): Sample[] {
  return Array.from({ length: count }, (_, i) => ({
    title: `Loose end #${i + 1}`,
    // Spread evenly from ~1h ago back to ~7 days ago.
    minutesAgo: Math.round(HOUR + (i / Math.max(1, count - 1)) * (7 * DAY - HOUR)),
    durationMinutes: [15, 30, 60][i % 3],
    importance: IMPORTANCES[i % 3],
  }));
}

function parseCount(): number | null {
  const i = process.argv.indexOf("--count");
  if (i === -1) return null;
  const n = Number(process.argv[i + 1]);
  if (!Number.isFinite(n) || n < 1) {
    console.error("--count needs a positive number, e.g. --count 12");
    process.exit(1);
  }
  return Math.floor(n);
}

function main() {
  const count = parseCount();
  const samples = count != null ? generate(count) : SAMPLES;
  const now = Date.now();
  const stamp = new Date(now).toISOString();

  const rows = samples.map((s) => {
    const start = new Date(now - s.minutesAgo * 60_000).toISOString();
    return {
      id: randomUUID(),
      title: s.title,
      durationMinutes: s.durationMinutes,
      importance: s.importance,
      scheduledStart: start,
      googleEventId: null,
      completed: false,
      completedAt: null,
      createdAt: stamp,
      updatedAt: stamp,
      pingedAt: null,
    };
  });

  db.insert(tasks).values(rows).run();

  console.log(`Seeded ${rows.length} past, unchecked task${rows.length === 1 ? "" : "s"}:`);
  for (const r of rows) {
    console.log(`  • ${r.title}  —  was ${new Date(r.scheduledStart).toLocaleString()}`);
  }
  console.log("\nOpen the app — they'll appear under “Loose ends”. Run `npm run clear-tasks` to remove them.");
}

try {
  main();
  process.exit(0);
} catch (err) {
  console.error("seed-loose-ends failed:", err);
  process.exit(1);
}
