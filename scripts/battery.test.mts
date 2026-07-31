import { batteryBreakdownLabel, computeDayBattery } from "../lib/battery";
import type { DayWindow, Energy, TodayItem } from "../lib/types";

import { harness } from "./_harness.mts";

const { check, done } = harness("battery");

const DAY = new Date(2026, 6, 25); // local midnight
const WINDOW: DayWindow = {
  enabled: true,
  dayWindowStart: "08:00",
  dayWindowEnd: "20:00", // 720 min capacity
  primeStart: "09:00",
  primeEnd: "12:00",
};

let n = 0;
function mkItem(p: {
  minutes?: number | null;
  energy?: Energy | null;
  completed?: boolean;
  allDay?: boolean;
  start?: string | null;
  source?: "lifeos" | "google";
}): TodayItem {
  n++;
  return {
    id: `i${n}`,
    title: `Item ${n}`,
    start: p.start === undefined ? new Date(2026, 6, 25, 9).toISOString() : p.start,
    durationMinutes: p.minutes === undefined ? 60 : p.minutes,
    importance: "normal",
    completed: p.completed ?? false,
    allDay: p.allDay ?? false,
    source: p.source ?? "lifeos",
    energy: p.energy ?? null,
  };
}

{
  // Multipliers: 60 min at each label over 720 capacity.
  const b = computeDayBattery([mkItem({ energy: "low" })], WINDOW, DAY, 30);
  check("low ×0.5", b.drainMinutes === 30 && b.percent === 4, `${b.drainMinutes}/${b.percent}`);
  const m = computeDayBattery([mkItem({ energy: "medium" })], WINDOW, DAY, 30);
  check("medium ×1", m.drainMinutes === 60);
  const h = computeDayBattery([mkItem({ energy: "high" })], WINDOW, DAY, 30);
  check("high ×2", h.drainMinutes === 120);
  const u = computeDayBattery([mkItem({ energy: null })], WINDOW, DAY, 30);
  check("unlabeled ×1", u.drainMinutes === 60);
  const g = computeDayBattery([mkItem({ energy: null, source: "google" })], WINDOW, DAY, 30);
  check("google event counts, ×1", g.drainMinutes === 60);
}

{
  // Eligibility: done counts, all-day and unscheduled don't; fallback duration.
  const done = computeDayBattery([mkItem({ energy: "high", completed: true })], WINDOW, DAY, 30);
  check("completed still drains (day as built)", done.drainMinutes === 120);
  const allDay = computeDayBattery([mkItem({ allDay: true, start: null })], WINDOW, DAY, 30);
  check("all-day item skipped", allDay.drainMinutes === 0);
  const unsched = computeDayBattery([mkItem({ start: null })], WINDOW, DAY, 30);
  check("unscheduled item skipped", unsched.drainMinutes === 0);
  const noDur = computeDayBattery([mkItem({ minutes: null })], WINDOW, DAY, 45);
  check("null duration uses fallback", noDur.drainMinutes === 45);
}

{
  // A fully booked day of medium tasks = exactly 100%.
  const full = computeDayBattery(
    Array.from({ length: 12 }, () => mkItem({ minutes: 60, energy: "medium" })),
    WINDOW,
    DAY,
    30,
  );
  check("fully booked medium day = exactly 100%", full.percent === 100, `${full.percent}`);

  // Over 100%: number keeps counting, no clamp.
  const over = computeDayBattery(
    Array.from({ length: 6 }, () => mkItem({ minutes: 120, energy: "high" })),
    WINDOW,
    DAY,
    30,
  );
  check("over 100% unclamped", over.percent === 200, `${over.percent}`);
}

{
  // Capacity comes from the window; a day off has no battery.
  const short: DayWindow = { ...WINDOW, dayWindowStart: "10:00", dayWindowEnd: "16:00" };
  const b = computeDayBattery([mkItem({ minutes: 180, energy: "medium" })], short, DAY, 30);
  check("capacity from weekday window (360)", b.capacityMinutes === 360 && b.percent === 50);
  const off = computeDayBattery([mkItem({})], { ...WINDOW, enabled: false }, DAY, 30);
  check("disabled day → percent null", off.percent === null && off.capacityMinutes === 0);
}

{
  // Extending the day's window grows capacity → the same load reads lower.
  const base = computeDayBattery([mkItem({ minutes: 360, energy: "medium" })], WINDOW, DAY, 30);
  const extended: DayWindow = { ...WINDOW, dayWindowStart: "06:00" }; // 840 min
  const ext = computeDayBattery([mkItem({ minutes: 360, energy: "medium" })], extended, DAY, 30);
  check("extended window grows capacity", ext.capacityMinutes === 840);
  check("same drain, lower percent", base.percent === 50 && ext.percent === 43, `${base.percent}→${ext.percent}`);
}

{
  // Breakdown: raw minutes per bucket, zero buckets omitted, ordered high→low.
  const b = computeDayBattery(
    [
      mkItem({ minutes: 240, energy: "high" }),
      mkItem({ minutes: 120, energy: "medium" }),
      mkItem({ minutes: 60, energy: "low" }),
      mkItem({ minutes: 90, energy: null }),
    ],
    WINDOW,
    DAY,
    30,
  );
  check("breakdown holds raw minutes", b.breakdown.high === 240 && b.breakdown.low === 60);
  check(
    "breakdown label",
    batteryBreakdownLabel(b) === "4h high · 2h medium · 1h low · 1.5h unlabeled",
    batteryBreakdownLabel(b),
  );
  const one = computeDayBattery([mkItem({ minutes: 30, energy: "low" })], WINDOW, DAY, 30);
  check("zero buckets omitted", batteryBreakdownLabel(one) === "30m low", batteryBreakdownLabel(one));
}

done();
