import { proposeSlot } from "../lib/schedule";
import { DEFAULT_SETTINGS, type Task } from "../lib/types";

// Fixed "now": 2026-06-22 08:00 local.
const now = new Date(2026, 5, 22, 8, 0, 0);
const settings = { ...DEFAULT_SETTINGS }; // window 08-20, prime 09-12

import { harness } from "./_harness.mts";

const { check, done } = harness("brain");

function mkTask(p: Partial<Task>): Task {
  return {
    id: p.id ?? Math.random().toString(36).slice(2),
    title: p.title ?? "x",
    durationMinutes: p.durationMinutes ?? 30,
    importance: p.importance ?? "normal",
    scheduledStart: p.scheduledStart ?? null,
    dueDate: p.dueDate ?? null,
    preferredDate: p.preferredDate ?? null,
    googleEventId: null,
    completed: p.completed ?? false,
    completedAt: null,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    tag: p.tag ?? null,
    energy: p.energy ?? null,
    deferralCount: p.deferralCount ?? 0,
  };
}

function hhmm(d: Date) {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// 1) High-importance task lands inside the prime block (09:00-12:00).
{
  const p = proposeSlot({ durationMinutes: 60, importance: "high", settings, tasks: [], now });
  check("high → prime", !!p && p.start.getHours() >= 9 && p.start.getHours() < 12, p ? hhmm(p.start) : "null");
  check("high → no bump on empty day", !!p && !p.bump);
}

// 2) Normal task avoids prime — placed before prime (08:00-09:00) or after (12:00+).
{
  const p = proposeSlot({ durationMinutes: 30, importance: "normal", settings, tasks: [], now });
  const inPrime = !!p && p.start.getHours() >= 9 && p.start.getHours() < 12;
  check("normal → outside prime", !!p && !inPrime, p ? hhmm(p.start) : "null");
  // Earliest non-prime gap today is 08:00.
  check("normal → earliest free (08:00)", !!p && hhmm(p.start) === "08:00", p ? hhmm(p.start) : "null");
}

// 3) Low task fills earliest non-prime gap, same as normal.
{
  const p = proposeSlot({ durationMinutes: 30, importance: "low", settings, tasks: [], now });
  check("low → 08:00", !!p && hhmm(p.start) === "08:00", p ? hhmm(p.start) : "null");
}

// 4) Busy time is respected — a meeting blocks its slot.
{
  const meeting = mkTask({
    scheduledStart: new Date(2026, 5, 22, 9, 0).toISOString(),
    durationMinutes: 120, // 09:00-11:00 fills most of prime
    importance: "high",
  });
  const p = proposeSlot({ durationMinutes: 30, importance: "high", settings, tasks: [meeting], now });
  // Remaining prime gap is 11:00-12:00.
  check("high → fits remaining prime gap (11:00)", !!p && hhmm(p.start) === "11:00", p ? hhmm(p.start) : "null");
}

// 5) Bump: prime full of a LOW task; a new HIGH should propose moving it out.
{
  const lowInPrime = mkTask({
    title: "laundry",
    scheduledStart: new Date(2026, 5, 22, 9, 0).toISOString(),
    durationMinutes: 180, // 09:00-12:00 fills ALL of prime
    importance: "low",
  });
  const p = proposeSlot({ durationMinutes: 60, importance: "high", settings, tasks: [lowInPrime], now });
  check("high → proposes a bump when prime full of low", !!p && !!p.bump, p ? JSON.stringify({ start: hhmm(p.start), bump: !!p.bump }) : "null");
  check("bump → moves the low task", !!p?.bump && p.bump.task.title === "laundry");
  check("bump → relocates outside prime", !!p?.bump && !(p.bump.newStart.getHours() >= 9 && p.bump.newStart.getHours() < 12), p?.bump ? hhmm(p.bump.newStart) : "null");
  check("high → new task takes prime", !!p && p.start.getHours() >= 9 && p.start.getHours() < 12, p ? hhmm(p.start) : "null");
}

// 6) No bump of equal/higher importance — prime full of HIGH → roll to next day's prime.
{
  const highInPrime = mkTask({
    scheduledStart: new Date(2026, 5, 22, 9, 0).toISOString(),
    durationMinutes: 180,
    importance: "high",
  });
  const p = proposeSlot({ durationMinutes: 60, importance: "high", settings, tasks: [highInPrime], now });
  check("high vs full-high prime → no bump", !!p && !p.bump);
  check("high vs full-high prime → next day prime", !!p && p.start.getDate() === 23 && p.start.getHours() >= 9 && p.start.getHours() < 12, p ? `${p.start.getDate()} ${hhmm(p.start)}` : "null");
}

// 7) Can't schedule in the past — now=08:00 means 08:00 is earliest today.
{
  const lateNow = new Date(2026, 5, 22, 10, 30, 0);
  const p = proposeSlot({ durationMinutes: 30, importance: "normal", settings, tasks: [], now: lateNow });
  check("respects now → no slot before 10:30", !!p && p.start >= lateNow, p ? hhmm(p.start) : "null");
}

done();
