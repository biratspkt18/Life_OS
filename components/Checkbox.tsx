"use client";
import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
}

/**
 * A tidy square that fills on completion (brief §4) — now with a little reward:
 * the fill springs in from the centre, the tick draws itself, and a soft ring
 * pulses out. Checking something off should feel like a small win.
 */
export function Checkbox({ checked, onChange, label }: CheckboxProps) {
  const reduce = useReducedMotion();
  // Bumped only when the user checks (not on mount / uncheck) so already-done
  // items don't fire a burst when the list first loads.
  const [burst, setBurst] = useState(0);

  function toggle() {
    if (!checked) setBurst((b) => b + 1);
    onChange(!checked);
  }

  return (
    <motion.button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={toggle}
      whileTap={{ scale: 0.85 }}
      transition={{ type: "spring", stiffness: 500, damping: 28 }}
      className={[
        "relative flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[7px] border outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-accent/45",
        checked ? "border-accent" : "border-muted-soft bg-paper-card hover:border-muted",
      ].join(" ")}
    >
      {/* Spring-filled accent background */}
      <motion.span
        aria-hidden
        className="absolute inset-0 rounded-[6px] bg-accent"
        initial={false}
        animate={checked ? { scale: 1, opacity: 1 } : { scale: 0, opacity: 0 }}
        transition={
          reduce
            ? { duration: 0.12 }
            : { type: "spring", stiffness: 640, damping: 26, mass: 0.7 }
        }
      />

      {/* Success ring — pulses out once on each check */}
      <AnimatePresence>
        {burst > 0 && checked && !reduce && (
          <motion.span
            key={burst}
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-[7px] border-2 border-accent"
            initial={{ scale: 0.7, opacity: 0.55 }}
            animate={{ scale: 2.1, opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          />
        )}
      </AnimatePresence>

      {/* The tick, drawn on */}
      <svg viewBox="0 0 24 24" className="relative h-3.5 w-3.5 text-paper" fill="none">
        <motion.path
          d="M5 12.5l4 4 10-10"
          stroke="currentColor"
          strokeWidth="2.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={false}
          animate={{ pathLength: checked ? 1 : 0, opacity: checked ? 1 : 0 }}
          transition={
            reduce
              ? { duration: 0.1 }
              : { duration: 0.22, ease: "easeOut", delay: checked ? 0.08 : 0 }
          }
        />
      </svg>
    </motion.button>
  );
}
