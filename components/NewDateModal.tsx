"use client";
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { updateTask } from "../lib/tasks";
import { addDays, dayLabel, startOfDay } from "../lib/dates";
import type { Task } from "../lib/types";
import { DayCalendar } from "./pickers";
import { CloseIcon } from "./icons";
import { Button } from "./ui/button";

/**
 * Small overlay for giving a slipped to-do a fresh due / preferred date — the
 * primary action of the "Missed" sections in the To-do list. One tap on a
 * quick chip or a calendar day saves immediately; no confirm step, because the
 * whole point is to make un-slipping a date cost nothing.
 */
export function NewDateModal({
  task,
  kind,
  now,
  onClose,
}: {
  task: Task;
  kind: "due" | "preferred";
  now: Date;
  onClose: () => void;
}) {
  const todayStart = startOfDay(now);
  const oldIso = kind === "due" ? task.dueDate : task.preferredDate;
  const oldDay = oldIso ? startOfDay(new Date(oldIso)) : null;
  const daysAgo = oldDay
    ? Math.max(1, Math.round((todayStart.getTime() - oldDay.getTime()) / 86_400_000))
    : 0;

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function pick(day: Date) {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const iso = startOfDay(day).toISOString();
      await updateTask(task.id, kind === "due" ? { dueDate: iso } : { preferredDate: iso });
      onClose();
    } catch {
      setSaving(false);
      setError("Couldn't save the new date — try again.");
    }
  }

  const quick = [
    { label: "Today", day: todayStart },
    { label: "Tomorrow", day: addDays(todayStart, 1) },
    { label: "Next week", day: addDays(todayStart, 7) },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div
        className="absolute inset-0 bg-ink/25 backdrop-blur-[2px] animate-fade-in"
        onClick={onClose}
      />
      <motion.div
        className="surface relative z-10 w-full max-w-sm rounded-b-none rounded-t-2xl p-5 sm:m-4 sm:rounded-2xl"
        initial={{ y: 24, opacity: 0, scale: 0.98 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        transition={{ type: "spring", stiffness: 380, damping: 32 }}
      >
        <div className="mb-1 flex items-start justify-between">
          <h2 className="font-display text-lg font-bold tracking-tight text-ink">
            {kind === "due" ? "New due date" : "New preferred date"}
          </h2>
          <button
            onClick={onClose}
            className="-mr-1.5 -mt-1 rounded-lg p-1.5 text-muted-soft transition-colors hover:bg-paper-edge/60 hover:text-ink"
            aria-label="Close"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>
        <p className="text-sm font-medium text-ink">{task.title}</p>
        <p className="mb-4 text-xs text-muted">
          {oldDay ? (
            <>
              {kind === "due" ? "was due" : "you aimed for"} {dayLabel(oldDay)}
              <span className="mx-1.5 text-muted-soft">·</span>
              {daysAgo === 1 ? "yesterday" : `${daysAgo} days ago`}
            </>
          ) : (
            "pick a day that works"
          )}
        </p>

        {/* One-tap presets, then the full calendar for anything else. */}
        <div className="mb-3 flex flex-wrap gap-2">
          {quick.map((q) => (
            <Button
              key={q.label}
              size="sm"
              variant="outline"
              disabled={saving}
              onClick={() => pick(q.day)}
            >
              {q.label}
            </Button>
          ))}
        </div>
        <div className={`flex justify-center ${saving ? "pointer-events-none opacity-60" : ""}`}>
          <DayCalendar value={todayStart} min={todayStart} onSelect={pick} />
        </div>

        {error && <p className="mt-3 text-xs font-medium text-accent">{error}</p>}
      </motion.div>
    </div>
  );
}
