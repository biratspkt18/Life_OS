"use client";
import {
  getStoredLane,
  LANE_EVENT,
  laneDayKey,
  setStoredLane,
  type EnergyLane,
} from "../lib/energyLane";
import { usePersisted } from "./usePersisted";

/**
 * React access to the device's energy lane. Hydration-safe (server renders no
 * lane), synced across components and tabs, and — because the stored value is
 * date-stamped — reset the moment the day rolls over: passing `now` re-reads
 * when its day key changes.
 */
export function useEnergyLane(now?: Date): {
  lane: EnergyLane | null;
  setLane: (lane: EnergyLane | null) => void;
} {
  const lane = usePersisted<EnergyLane | null>(
    { fallback: null, read: getStoredLane, event: LANE_EVENT },
    laneDayKey(now ?? new Date()),
  );
  return { lane, setLane: setStoredLane };
}
