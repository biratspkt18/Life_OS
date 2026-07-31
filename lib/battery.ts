import { atTime, minutesBetween } from "./dates";
import type { DayWindow, Energy, TodayItem } from "./types";

/**
 * The Day Battery — a mirror of how heavy the day *as built* is. Pure math,
 * no opinions: it never warns, never suggests, never blocks. Capacity is the
 * day's working window; every scheduled item (done or not, Google meetings
 * included) drains duration × its energy multiplier. A fully booked day of
 * medium tasks is exactly 100%.
 */

export const ENERGY_MULTIPLIER: Record<Energy, number> = { low: 0.5, medium: 1, high: 2 };
export const UNLABELED_MULTIPLIER = 1;

export type EnergyBucket = Energy | "unlabeled";

export interface DayBattery {
  /** Rounded percent of capacity; may exceed 100. Null when the day is off. */
  percent: number | null;
  /** The effective working window's length, in minutes. */
  capacityMinutes: number;
  /** Σ duration × multiplier across the day's scheduled items. */
  drainMinutes: number;
  /** RAW (unweighted) minutes per energy bucket, for the breakdown line. */
  breakdown: Record<EnergyBucket, number>;
}

export function computeDayBattery(
  items: TodayItem[],
  effectiveWindow: DayWindow,
  day: Date,
  fallbackDurationMinutes: number,
): DayBattery {
  const breakdown: Record<EnergyBucket, number> = {
    high: 0,
    medium: 0,
    low: 0,
    unlabeled: 0,
  };

  const capacityMinutes = effectiveWindow.enabled
    ? Math.max(
        0,
        minutesBetween(
          atTime(day, effectiveWindow.dayWindowStart),
          atTime(day, effectiveWindow.dayWindowEnd),
        ),
      )
    : 0;

  let drainMinutes = 0;
  for (const item of items) {
    if (item.allDay || !item.start) continue; // only timed, scheduled things
    const duration = item.durationMinutes ?? fallbackDurationMinutes;
    const energy = item.energy ?? null; // tolerate pre-deploy cached items
    drainMinutes += duration * (energy ? ENERGY_MULTIPLIER[energy] : UNLABELED_MULTIPLIER);
    breakdown[energy ?? "unlabeled"] += duration;
  }

  return {
    percent: capacityMinutes > 0 ? Math.round((drainMinutes / capacityMinutes) * 100) : null,
    capacityMinutes,
    drainMinutes,
    breakdown,
  };
}

const BUCKET_ORDER: EnergyBucket[] = ["high", "medium", "low", "unlabeled"];
const BUCKET_LABEL: Record<EnergyBucket, string> = {
  high: "high",
  medium: "medium",
  low: "low",
  unlabeled: "unlabeled",
};

/** Compact "1 hr 30 min" → "1.5h"-style unit for the one-line breakdown. */
function shortDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = minutes / 60;
  return Number.isInteger(h) ? `${h}h` : `${Math.round(h * 10) / 10}h`;
}

/** "4h high · 2h medium · 1h low" — zero buckets omitted; "" when empty. */
export function batteryBreakdownLabel(b: DayBattery): string {
  return BUCKET_ORDER.filter((k) => b.breakdown[k] > 0)
    .map((k) => `${shortDuration(b.breakdown[k])} ${BUCKET_LABEL[k]}`)
    .join(" · ");
}
