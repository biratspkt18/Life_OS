import { format } from "./dates";
import type { Energy } from "./types";

/**
 * The energy lane — "how I'm feeling right now", remembered per device (not
 * per account), same pattern as the theme in `lib/theme.ts`. Two lanes:
 *   - "slow"  — only low-energy suggestions, for drained days.
 *   - "zippy" — medium + high energy suggestions, for when you're feeling zippy.
 * No stored lane means no filter. Tasks without an energy label ride in both
 * lanes — the filter never hides them.
 *
 * The choice is day-stamped and resets every midnight: yesterday's mood
 * shouldn't leak into today. (v2 key — the old plain-string value is ignored.)
 */

export type EnergyLane = "slow" | "zippy";

export const LANE_KEY = "lifeos-energy-lane-v2";
export const LANE_EVENT = "lifeos:energy-lane";

export const LANE_LABEL: Record<EnergyLane, string> = {
  slow: "Slow lane",
  zippy: "Zippy lane",
};

/** A stored value we don't recognise (or nothing) means: no lane, show all. */
export function isEnergyLane(v: unknown): v is EnergyLane {
  return v === "slow" || v === "zippy";
}

/** The day-stamp a lane choice is scoped to. */
export function laneDayKey(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

/**
 * Pure core of the daily reset: a stored value only counts when it parses to
 * a real lane stamped with *today's* key. Yesterday's choice, the legacy
 * plain-string format, and junk all resolve to "no lane".
 */
export function resolveStoredLane(raw: string | null, todayKey: string): EnergyLane | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { lane?: unknown; day?: unknown };
    return isEnergyLane(parsed.lane) && parsed.day === todayKey ? parsed.lane : null;
  } catch {
    return null;
  }
}

export function getStoredLane(): EnergyLane | null {
  if (typeof window === "undefined") return null;
  return resolveStoredLane(window.localStorage.getItem(LANE_KEY), laneDayKey(new Date()));
}

/** Persist a choice (null clears it) and let same-tab listeners re-render. */
export function setStoredLane(lane: EnergyLane | null): void {
  if (typeof window === "undefined") return;
  if (lane === null) window.localStorage.removeItem(LANE_KEY);
  else
    window.localStorage.setItem(
      LANE_KEY,
      JSON.stringify({ lane, day: laneDayKey(new Date()) }),
    );
  window.dispatchEvent(new CustomEvent(LANE_EVENT, { detail: lane }));
}

/** Whether a task with this energy belongs in the given lane. */
export function matchesLane(lane: EnergyLane | null, energy: Energy | null): boolean {
  if (lane === null) return true;
  if (energy === null) return true; // unlabeled tasks ride in both lanes
  return lane === "slow" ? energy === "low" : energy !== "low";
}
