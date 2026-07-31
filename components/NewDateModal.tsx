"use client";
import { useState } from "react";
import { updateTask } from "../lib/tasks";
import { addDays, dayLabel, startOfDay } from "../lib/dates";
import type { Task } from "../lib/types";
import { DayCalendar } from "./pickers";
import { Button } from "./ui/button";
import { Dialog } from "./ui/dialog";

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
    <Dialog title={kind === "due" ? "New due date" : "New preferred date"} onClose={onClose}>
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
    </Dialog>
  );
}
