"use client";
import { LANE_LABEL, type EnergyLane } from "../lib/energyLane";

const LANES: EnergyLane[] = ["slow", "zippy"];

/**
 * The two-lane energy filter shared by To-do and Loose ends: a quiet segmented
 * pill. Tap a lane to show only what fits your energy right now; tap it again
 * to lift the filter. Unlabeled tasks are never hidden.
 */
export function EnergyLaneToggle({
  lane,
  onChange,
}: {
  lane: EnergyLane | null;
  onChange: (lane: EnergyLane | null) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Filter by energy"
      className="inline-flex shrink-0 items-center gap-0.5 rounded-full border border-paper-edge bg-paper-deep/40 p-0.5"
    >
      {LANES.map((value) => {
        const active = lane === value;
        return (
          <button
            key={value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(active ? null : value)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              active
                ? "bg-accent-wash font-semibold text-accent"
                : "text-muted hover:text-ink"
            }`}
          >
            {LANE_LABEL[value]}
          </button>
        );
      })}
    </div>
  );
}
