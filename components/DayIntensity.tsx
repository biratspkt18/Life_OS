"use client";
import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { batteryBreakdownLabel, type DayBattery } from "../lib/battery";

/** A full day is ten blocks — each one a tenth of the working window. */
const SEGMENTS = 10;

/**
 * The day's *intensity* — how heavy the day you've built is (each task's length
 * weighted by its energy, over the working window) — shown as a retro segmented
 * battery of ten blocks. It sits in the header so it reads as part of the app's
 * day summary, never the device's battery. A mirror only: no warnings; past
 * 100% every block fills and turns gold, and the number keeps counting. Tap to
 * see the split by energy.
 */
export function DayIntensity({ intensity }: { intensity: DayBattery }) {
  const [open, setOpen] = useState(false);
  const reduceMotion = useReducedMotion();

  if (intensity.percent == null) return null;
  const over = intensity.percent > 100;
  // How many of the ten blocks are lit — rounded, and capped when over 100%.
  const filled = Math.max(0, Math.min(SEGMENTS, Math.round(Math.min(intensity.percent, 100) / 10)));
  const breakdown = batteryBreakdownLabel(intensity);

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={`Day intensity: ${intensity.percent}% of a full day. Tap for the breakdown.`}
        className="flex items-center gap-1.5 text-xs font-medium tabular-nums"
      >
        <span className="uppercase tracking-wide text-muted-soft">Intensity</span>

        {/* Retro segmented battery: ten blocks in a bordered body + a terminal nub. */}
        <span className="flex items-center gap-[2px]" aria-hidden>
          <span
            className="flex h-3.5 items-stretch gap-[1.5px] rounded-[3px] border border-muted/40 p-[2px]"
            style={{ width: 68 }}
          >
            {Array.from({ length: SEGMENTS }).map((_, i) => (
              <span
                key={i}
                className={`flex-1 rounded-[1px] transition-colors motion-reduce:transition-none ${
                  i < filled ? (over ? "bg-gold" : "bg-accent") : "bg-muted/15"
                }`}
              />
            ))}
          </span>
          <span className="h-1.5 w-[2px] rounded-r-[1px] bg-muted/40" />
        </span>

        <span className={over ? "text-gold-soft" : "text-muted"}>{intensity.percent}%</span>
      </button>

      <AnimatePresence initial={false}>
        {open && breakdown && (
          <motion.p
            initial={reduceMotion ? { opacity: 1 } : { opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
            transition={reduceMotion ? { duration: 0 } : { duration: 0.2, ease: "easeOut" }}
            className="overflow-hidden text-right text-[0.7rem] text-muted-soft"
          >
            {breakdown}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
