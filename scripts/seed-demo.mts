/**
 * Seed a full demo of every headline feature at once, for the signed-in user:
 *
 *   - a busy Today (blocks with tags + energy, gaps the brain can propose into)
 *   - unscheduled to-dos carrying tags, energy, due / preferred dates
 *   - ~3 weeks of completion history so the Stats screen fills in
 *     (streaks, activity strip, on-time vs late, missed deadlines)
 *   - stuck tasks past the deferral threshold, so Loose ends / To-do show
 *     "Moved N times · break it into smaller steps?" and the breakdown sheet
 *   - one task at threshold-minus-one, so a single live reschedule flips it
 *
 *   npm run seed-demo            # insert
 *   npm run seed-demo -- --clean # remove ONLY these rows (ids start "demo-")
 *
 * Writes straight to SQLite for the first user row (no Google events are
 * created). Existing tasks are never touched.
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { like } from "drizzle-orm";
import { startOfDay, subDays, addDays } from "date-fns";
import { db } from "../lib/server/db";
import { tasks, users } from "../lib/server/db/schema";
import type { Energy, Importance } from "../lib/types";

const DEMO_PREFIX = "demo-";

interface Sample {
  title: string;
  durationMinutes: number;
  importance: Importance;
  tag: string | null;
  energy: Energy | null;
  /** Local "HH:mm" today. Mutually exclusive with scheduledDaysAgo. */
  todayAt?: string;
  /** Days ago it was scheduled (same clock time as todayAt-style "HH:mm"). */
  scheduledDaysAgo?: { days: number; at: string };
  /** Days relative to today; negative = past. */
  dueInDays?: number;
  preferredInDays?: number;
  /** Days ago it was completed (0 = earlier today). */
  completedDaysAgo?: number;
  deferralCount?: number;
}

const SAMPLES: Sample[] = [
  // ---- Today: a realistically full Sunday (window 08:00–20:00, prime 09–12).
  // Gaps left on purpose: 08:00, 10:30, 11:30, 13:30, 14:45, 17:00, 19:00.
  { title: "Morning run", todayAt: "08:30", durationMinutes: 30, importance: "low", tag: "Health", energy: "medium" },
  { title: "Deep work: thesis chapter", todayAt: "09:00", durationMinutes: 90, importance: "high", tag: "Uni", energy: "high" },
  { title: "Reply to tutor emails", todayAt: "11:00", durationMinutes: 30, importance: "normal", tag: "Uni", energy: "low" },
  { title: "Lunch with Sam", todayAt: "12:30", durationMinutes: 60, importance: "low", tag: "Life", energy: "medium" },
  { title: "Grocery run", todayAt: "14:00", durationMinutes: 45, importance: "normal", tag: "Errands", energy: "low" },
  { title: "Gym session", todayAt: "16:00", durationMinutes: 60, importance: "low", tag: "Health", energy: "high" },
  { title: "Call parents", todayAt: "18:30", durationMinutes: 30, importance: "normal", tag: "Life", energy: "low" },

  // ---- To-dos: tags + energy + dates, all still healthy.
  { title: "Draft the scholarship application", durationMinutes: 60, importance: "high", tag: "Uni", energy: "high", dueInDays: 5 },
  { title: "Book a dentist check-up", durationMinutes: 15, importance: "normal", tag: "Health", energy: "low" },
  { title: "Refill the travel card", durationMinutes: 15, importance: "low", tag: "Errands", energy: "low", preferredInDays: 2 },
  { title: "Plan next week's meals", durationMinutes: 30, importance: "normal", tag: "Home", energy: "medium", preferredInDays: 1 },

  // ---- Stuck tasks (threshold defaults to 5 moves).
  // Slipped calendar block, moved 6× → Loose ends row + deferral note.
  { title: "Write the personal statement draft", durationMinutes: 90, importance: "high", tag: "Uni", energy: "high", scheduledDaysAgo: { days: 3, at: "09:30" }, deferralCount: 6 },
  // To-do whose preferred day slipped, moved 5× → To-do "Missed" + note.
  { title: "Sort out the visa paperwork", durationMinutes: 45, importance: "high", tag: "Admin", energy: "high", preferredInDays: -5, deferralCount: 5 },
  // One move away: reschedule it to another day once and watch the note appear.
  { title: "Deep-clean the flat", durationMinutes: 90, importance: "normal", tag: "Home", energy: "medium", dueInDays: 6, preferredInDays: 1, deferralCount: 4 },

  // ---- History: current streak (yesterday back through 6 days ago)…
  { title: "Reading sprint: two chapters", durationMinutes: 60, importance: "normal", tag: "Uni", energy: "high", completedDaysAgo: 1 },
  { title: "Tidy the desk", durationMinutes: 15, importance: "low", tag: "Home", energy: "low", completedDaysAgo: 1 },
  { title: "Weekly review", durationMinutes: 30, importance: "high", tag: "Admin", energy: "medium", completedDaysAgo: 2, dueInDays: -2 }, // on time
  { title: "Push the portfolio update live", durationMinutes: 60, importance: "high", tag: "Deep work", energy: "high", completedDaysAgo: 3, dueInDays: -5 }, // 2 days late
  { title: "Long run", durationMinutes: 60, importance: "normal", tag: "Health", energy: "high", completedDaysAgo: 3 },
  { title: "Answer the tenancy email", durationMinutes: 15, importance: "normal", tag: "Admin", energy: "low", completedDaysAgo: 4, dueInDays: -4 }, // on time
  { title: "Prep Monday's presentation", durationMinutes: 90, importance: "high", tag: "Uni", energy: "high", completedDaysAgo: 5, dueInDays: -6 }, // 1 day late
  { title: "Water the plants", durationMinutes: 15, importance: "low", tag: "Home", energy: "low", completedDaysAgo: 5 },
  { title: "Grocery shop", durationMinutes: 45, importance: "normal", tag: "Errands", energy: "low", completedDaysAgo: 6 },
  // …and today, just after midnight, so the strip's Today bar lights up.
  { title: "Late-night journaling", durationMinutes: 15, importance: "low", tag: "Life", energy: "low", completedDaysAgo: 0 },

  // ---- History: scattered mid-window activity for varied bars.
  { title: "Fix the bike brakes", durationMinutes: 45, importance: "normal", tag: "Errands", energy: "medium", completedDaysAgo: 8 },
  { title: "Library returns", durationMinutes: 15, importance: "low", tag: "Errands", energy: "low", completedDaysAgo: 9 },
  { title: "Draft the essay outline", durationMinutes: 60, importance: "high", tag: "Uni", energy: "high", completedDaysAgo: 9, dueInDays: -9 }, // on time
  { title: "Meal prep", durationMinutes: 60, importance: "normal", tag: "Home", energy: "medium", completedDaysAgo: 9 },
  { title: "Call the bank", durationMinutes: 15, importance: "high", tag: "Admin", energy: "medium", completedDaysAgo: 10 },
  { title: "Swim", durationMinutes: 45, importance: "low", tag: "Health", energy: "high", completedDaysAgo: 10 },
  { title: "Renew the gym membership", durationMinutes: 15, importance: "normal", tag: "Admin", energy: "low", completedDaysAgo: 12 },

  // ---- History: an older 9-day run (20–28 days ago) → longest streak.
  ...Array.from({ length: 9 }, (_, i): Sample => ({
    title: `Study block: spaced repetition ${i + 1}`,
    durationMinutes: 30,
    importance: "normal",
    tag: "Uni",
    energy: "medium",
    completedDaysAgo: 20 + i,
  })),
];

function todayAtClock(hhmm: string, daysAgo = 0): Date {
  const [h, m] = hhmm.split(":").map((n) => parseInt(n, 10));
  const d = subDays(new Date(), daysAgo);
  d.setHours(h, m, 0, 0);
  return d;
}

function dayIso(offsetDays: number): string {
  const today = startOfDay(new Date());
  return (offsetDays < 0 ? subDays(today, -offsetDays) : addDays(today, offsetDays)).toISOString();
}

/** Mid-afternoon completion stamp N days ago (past midnight for day 0). */
function completedIso(daysAgo: number): string {
  if (daysAgo === 0) return todayAtClock("01:00").toISOString();
  return todayAtClock("15:30", daysAgo).toISOString();
}

function main() {
  if (process.argv.includes("--clean")) {
    const res = db.delete(tasks).where(like(tasks.id, `${DEMO_PREFIX}%`)).run();
    console.log(`Removed ${res.changes} demo task(s).`);
    return;
  }

  const user = db.select().from(users).limit(1).get();
  if (!user) {
    console.error("No users yet — sign in once, then re-run.");
    process.exit(1);
  }

  const stamp = new Date().toISOString();
  const rows = SAMPLES.map((s) => {
    const scheduledStart = s.todayAt
      ? todayAtClock(s.todayAt)
      : s.scheduledDaysAgo
        ? todayAtClock(s.scheduledDaysAgo.at, s.scheduledDaysAgo.days)
        : null;
    return {
      id: DEMO_PREFIX + randomUUID(),
      userId: user.id,
      title: s.title,
      durationMinutes: s.durationMinutes,
      importance: s.importance,
      scheduledStart: scheduledStart?.toISOString() ?? null,
      dueDate: s.dueInDays != null ? dayIso(s.dueInDays) : null,
      preferredDate: s.preferredInDays != null ? dayIso(s.preferredInDays) : null,
      googleEventId: null,
      completed: s.completedDaysAgo != null,
      completedAt: s.completedDaysAgo != null ? completedIso(s.completedDaysAgo) : null,
      createdAt: stamp,
      updatedAt: stamp,
      pingedAt: null,
      tag: s.tag,
      energy: s.energy,
      deferralCount: s.deferralCount ?? 0,
    };
  });

  db.insert(tasks).values(rows).run();

  const done = rows.filter((r) => r.completed).length;
  console.log(`Seeded ${rows.length} demo tasks for ${user.email}:`);
  console.log(`  • ${rows.filter((r) => r.scheduledStart && !r.completed).length} scheduled blocks (today + slipped)`);
  console.log(`  • ${rows.filter((r) => !r.scheduledStart && !r.completed).length} open to-dos with tags/energy`);
  console.log(`  • ${done} completed history rows for Stats`);
  console.log(`  • deferral demos: 6× and 5× (note shows now), 4× (one move away)`);
  console.log("\nRemove them any time with: npm run seed-demo -- --clean");
}

try {
  main();
  process.exit(0);
} catch (err) {
  console.error("seed-demo failed:", err);
  process.exit(1);
}
