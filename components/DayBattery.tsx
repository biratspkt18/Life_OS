"use client";
import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { batteryBreakdownLabel, type DayBattery as Battery } from "../lib/battery";

/**
 * The Day Battery: a quiet mirror of how heavy the built day is. A compact
 * bar + "72% day". It never warns, suggests, or blocks — past 100% the color
 * shifts calmly and the number simply keeps counting. Tapping reveals a
 * one-line energy breakdown; that's the whole interaction.
 */
export function DayBattery({ battery }: { battery: Battery }) {
  const [open, setOpen] = useState(false);
  const reduceMotion = useReducedMotion();

  if (battery.percent == null) return null;
  const over = battery.percent > 100;
  const fillPct = Math.min(battery.percent, 100);
  const breakdown = batteryBreakdownLabel(battery);

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={`Day battery: ${battery.percent}% of your day`}
        className="flex w-full items-center gap-3"
      >
        <span className="relative h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-paper-edge/70">
          <motion.span
            className={`absolute inset-y-0 left-0 rounded-full ${over ? "bg-gold" : "bg-accent"}`}
            initial={false}
            animate={{ width: `${fillPct}%` }}
            transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 220, damping: 30 }}
          />
        </span>
        <span
          className={`shrink-0 text-xs font-semibold tabular-nums ${
            over ? "text-gold-soft" : "text-muted"
          }`}
        >
          {battery.percent}% day
        </span>
      </button>

      <AnimatePresence initial={false}>
        {open && breakdown && (
          <motion.p
            initial={reduceMotion ? { opacity: 1 } : { opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
            transition={reduceMotion ? { duration: 0 } : { duration: 0.2, ease: "easeOut" }}
            className="overflow-hidden text-right text-xs text-muted-soft"
          >
            <span className="mt-1 inline-block">{breakdown}</span>
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
