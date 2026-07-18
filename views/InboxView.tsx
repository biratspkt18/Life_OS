"use client";
import { useMemo } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useInboxTasks } from "../hooks/useDb";
import { useCheckOff } from "../hooks/useCheckOff";
import { openCapture, openEdit } from "../components/Capture";
import { openReschedule } from "../components/RescheduleModal";
import { DeferralNote, openBreakdown } from "../components/BreakdownModal";
import { ActionMenu } from "../components/ActionMenu";
import { dropTask } from "../lib/tasks";
import { dayLabel, durationLabel, isBefore, startOfDay } from "../lib/dates";
import { Checkbox } from "../components/Checkbox";
import { ImportanceMark } from "../components/pickers";
import { ClockIcon, EditIcon, StepsIcon, TrashIcon } from "../components/icons";
import { Celebration } from "../components/Celebration";
import { ENERGY_LABEL, type Task } from "../lib/types";

/**
 * To-do list — things you mean to do but haven't put on the calendar yet. Each
 * carries an optional due date and a preferred date, plus a time estimate and
 * importance. When you're ready, "schedule" opens the same day/time picker as
 * rescheduling. Sorted by deadline, soonest first.
 *
 * To-dos whose date has slipped don't show here at all — they move to the
 * Loose ends screen, the single home for everything that slipped past.
 */
export function InboxView({ now }: { now: Date }) {
  const tasks = useInboxTasks();
  const todayStart = useMemo(() => startOfDay(now), [now]);

  // Soonest due date first; undated to-dos fall to the bottom (newest first).
  // Anything whose due/preferred date already slipped lives in Loose ends now.
  const { sorted, slippedCount } = useMemo(() => {
    const slipped = (t: Task) =>
      (t.dueDate && isBefore(new Date(t.dueDate), todayStart)) ||
      (t.preferredDate && isBefore(new Date(t.preferredDate), todayStart));
    const kept = tasks.filter((t) => !slipped(t));
    kept.sort((a, b) => {
      const ad = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
      const bd = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
      if (ad !== bd) return ad - bd;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
    return { sorted: kept, slippedCount: tasks.length - kept.length };
  }, [tasks, todayStart]);

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
        <Celebration
          icon="spark"
          title="Nothing waiting."
          sub="Add a to-do whenever something lands — no rush to schedule it."
        />
      ) : (
        <div className="space-y-2.5">
          <AnimatePresence initial={false}>
            {sorted.map((t) => (
              <TodoRow key={t.id} task={t} onSchedule={() => openReschedule(t.id)} />
            ))}
          </AnimatePresence>
        </div>
      )}

      {slippedCount > 0 && (
        <p className="mt-4 text-xs text-muted-soft">
          {slippedCount} to-do{slippedCount === 1 ? "" : "s"} with a slipped date moved to{" "}
          <span className="font-medium text-muted">Loose ends</span>.
        </p>
      )}
    </section>
  );
}

function TodoRow({ task, onSchedule }: { task: Task; onSchedule: () => void }) {
  const due = task.dueDate ? new Date(task.dueDate) : null;
  const preferred = task.preferredDate ? new Date(task.preferredDate) : null;
  const { checked, celebrating, toggle } = useCheckOff(task.id, task.completed);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{
        opacity: 0,
        height: 0,
        marginTop: 0,
        scale: 0.97,
        transition: { duration: 0.34, ease: [0.16, 1, 0.3, 1] },
      }}
      transition={{ type: "spring", stiffness: 460, damping: 34 }}
      className={`surface relative flex items-center gap-3 overflow-hidden px-4 py-3.5 ${
        checked ? "opacity-60" : ""
      }`}
    >
      {celebrating && (
        <motion.span
          aria-hidden
          className="pointer-events-none absolute inset-0 z-0 bg-sage/20"
          initial={{ x: "-100%" }}
          animate={{ x: "0%" }}
          transition={{ duration: 0.4, ease: "easeOut" }}
        />
      )}
      <span className="relative z-10">
        <Checkbox checked={checked} onChange={toggle} label={`Mark “${task.title}” done`} />
      </span>
      <div className="relative z-10 min-w-0 flex-1">
        <p
          className={`flex items-center gap-2 truncate text-[0.98rem] font-medium text-ink ${
            checked ? "text-muted line-through decoration-muted/60" : ""
          }`}
        >
          <ImportanceMark importance={task.importance} />
          {task.title}
        </p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
          <span>{durationLabel(task.durationMinutes)}</span>
          {due && (
            <>
              <span className="text-muted-soft">·</span>
              <span>due {dayLabel(due)}</span>
            </>
          )}
          {preferred && (
            <>
              <span className="text-muted-soft">·</span>
              <span>prefer {dayLabel(preferred)}</span>
            </>
          )}
          {task.tag && (
            <>
              <span className="text-muted-soft">·</span>
              <span>{task.tag}</span>
            </>
          )}
          {task.energy && (
            <>
              <span className="text-muted-soft">·</span>
              <span>{ENERGY_LABEL[task.energy].toLowerCase()} energy</span>
            </>
          )}
        </p>
        <DeferralNote task={task} />
      </div>
      <div className="relative z-10 shrink-0">
        <ActionMenu
          actions={[
            {
              label: "Schedule",
              icon: <ClockIcon className="h-4 w-4" />,
              onClick: onSchedule,
            },
            {
              label: "Break it down",
              icon: <StepsIcon className="h-4 w-4" />,
              onClick: () => openBreakdown(task.id),
            },
            {
              label: "Edit",
              icon: <EditIcon className="h-4 w-4" />,
              onClick: () => openEdit(task.id),
            },
            {
              label: "Delete",
              icon: <TrashIcon className="h-4 w-4" />,
              danger: true,
              onClick: () => dropTask(task.id),
            },
          ]}
        />
      </div>
    </motion.div>
  );
}
