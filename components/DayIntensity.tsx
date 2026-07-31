"use client";
import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { batteryBreakdownLabel, type DayBattery } from "../lib/battery";

/**
 * A compact readout of the day's *intensity* — how heavy the day you've built
 * is (each task's length weighted by its energy, over the working window). It
 * sits in the header beside the clock and the to-go count so it reads as part
 * of the app's day summary, never mistaken for the device's battery. A mirror
 * only: no warnings; past 100% the colour just shifts and the number keeps
 * counting. Tap to see the split by energy.
 */
export function DayIntensity({ intensity }: { intensity: DayBattery }) {
  const [open, setOpen] = useState(false);
  const reduceMotion = useReducedMotion();

  if (intensity.percent == null) return null;
  const over = intensity.percent > 100;
  const fillPct = Math.min(intensity.percent, 100);
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
        <span className="relative h-1.5 w-14 overflow-hidden rounded-full bg-paper-edge/70">
          <motion.span
            className={`absolute inset-y-0 left-0 rounded-full ${over ? "bg-gold" : "bg-accent"}`}
            initial={false}
            animate={{ width: `${fillPct}%` }}
            transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 220, damping: 30 }}
          />
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
