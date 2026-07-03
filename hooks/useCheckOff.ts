"use client";
import { useEffect, useRef, useState } from "react";
import { setCompleted } from "../lib/tasks";

/**
 * Check-off with a short celebratory hold: the box fills and the row shows its
 * "done" state for a beat so the completion is *seen*, then `setCompleted` fires
 * — which drops the item from the live list and lets its exit animation play.
 * Unchecking is immediate (no flourish).
 */
export function useCheckOff(id: string, alreadyDone: boolean, holdMs = 620) {
  const [celebrating, setCelebrating] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  function toggle(next: boolean) {
    if (!next) {
      setCelebrating(false);
      setCompleted(id, false);
      return;
    }
    if (celebrating) return;
    setCelebrating(true);
    timer.current = setTimeout(() => setCompleted(id, true), holdMs);
  }

  return { checked: celebrating || alreadyDone, celebrating, toggle };
}
