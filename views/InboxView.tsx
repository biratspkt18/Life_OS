"use client";
import { useMemo } from "react";
import { useInboxTasks } from "../hooks/useDb";
import { openCapture } from "../components/Capture";
import { openReschedule } from "../components/RescheduleModal";
import { dropTask, setCompleted } from "../lib/tasks";
import { dayLabel, durationLabel, isBefore, startOfDay } from "../lib/dates";
import { Checkbox } from "../components/Checkbox";
import { ImportanceMark } from "../components/pickers";
import { ArrowRightIcon, TrashIcon } from "../components/icons";
import type { Task } from "../lib/types";

/**
 * To-do list — things you mean to do but haven't put on the calendar yet. Each
 * carries an optional due date and a preferred date, plus a time estimate and
 * importance. When you're ready, "schedule" opens the same day/time picker as
 * rescheduling. Sorted by deadline, soonest first.
 */
export function InboxView({ now }: { now: Date }) {
  const tasks = useInboxTasks();
  const todayStart = useMemo(() => startOfDay(now), [now]);

  // Soonest due date first; undated to-dos fall to the bottom (newest first).
  const sorted = useMemo(
    () =>
      [...tasks].sort((a, b) => {
        const ad = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
        const bd = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
        if (ad !== bd) return ad - bd;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }),
    [tasks],
  );

  return (
    <section>
      <header className="mb-5">
        <h1 className="text-3xl font-bold tracking-tight text-ink">To-do</h1>
        <p className="mt-1 text-[0.95rem] leading-relaxed text-muted">
          Things you mean to get done. Give them a due date, then schedule each onto a day when
          you’re ready.
        </p>
      </header>

      <button
        onClick={() => openCapture({ inbox: true })}
        className="mb-4 w-full rounded-2xl border border-dashed border-paper-edge px-4 py-3 text-left text-sm font-medium text-accent transition-colors hover:border-accent/50 hover:bg-accent-wash/40"
      >
        + Add a to-do
      </button>

      {sorted.length === 0 ? (
        <div className="surface px-6 py-12 text-center">
          <p className="text-lg font-medium text-ink">Nothing to do ✦</p>
          <p className="mt-1 text-sm text-muted">
            Add a to-do whenever something lands — no rush to schedule it.
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {sorted.map((t) => (
            <TodoRow
              key={t.id}
              task={t}
              todayStart={todayStart}
              onSchedule={() => openReschedule(t.id)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function TodoRow({
  task,
  todayStart,
  onSchedule,
}: {
  task: Task;
  todayStart: Date;
  onSchedule: () => void;
}) {
  const due = task.dueDate ? new Date(task.dueDate) : null;
  const preferred = task.preferredDate ? new Date(task.preferredDate) : null;
  const overdue = due ? isBefore(due, todayStart) : false;

  return (
    <div className="surface flex items-center gap-3 px-4 py-3.5">
      <Checkbox
        checked={false}
        onChange={() => setCompleted(task.id, true)}
        label={`Mark “${task.title}” done`}
      />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 truncate text-[0.98rem] font-medium text-ink">
          <ImportanceMark importance={task.importance} />
          {task.title}
        </p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
          <span>{durationLabel(task.durationMinutes)}</span>
          {due && (
            <>
              <span className="text-muted-soft">·</span>
              <span className={overdue ? "font-semibold text-accent" : ""}>
                {overdue ? "overdue · was due" : "due"} {dayLabel(due)}
              </span>
            </>
          )}
          {preferred && (
            <>
              <span className="text-muted-soft">·</span>
              <span>prefer {dayLabel(preferred)}</span>
            </>
          )}
        </p>
      </div>
      <button
        onClick={onSchedule}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-accent-wash px-3 py-1.5 text-sm font-medium text-accent transition-colors hover:bg-accent/15"
      >
        schedule <ArrowRightIcon className="h-3.5 w-3.5" />
      </button>
      <button
        onClick={() => dropTask(task.id)}
        aria-label={`Delete “${task.title}”`}
        className="shrink-0 rounded-lg p-1.5 text-muted-soft transition-colors hover:text-ink"
      >
        <TrashIcon className="h-4 w-4" />
      </button>
    </div>
  );
}
