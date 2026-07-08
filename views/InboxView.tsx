"use client";
import { useMemo, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useInboxTasks } from "../hooks/useDb";
import { useCheckOff } from "../hooks/useCheckOff";
import { openCapture, openEdit } from "../components/Capture";
import { openReschedule } from "../components/RescheduleModal";
import { ActionMenu } from "../components/ActionMenu";
import { NewDateModal } from "../components/NewDateModal";
import { dropTask } from "../lib/tasks";
import { dayLabel, durationLabel, isBefore, startOfDay } from "../lib/dates";
import { Checkbox } from "../components/Checkbox";
import { Button } from "../components/ui/button";
import { ImportanceMark } from "../components/pickers";
import { ClockIcon, EditIcon, TrashIcon } from "../components/icons";
import type { Task } from "../lib/types";

type MissedKind = "due" | "preferred";

/**
 * To-do list — things you mean to do but haven't put on the calendar yet. Each
 * carries an optional due date and a preferred date, plus a time estimate and
 * importance. When you're ready, "schedule" opens the same day/time picker as
 * rescheduling. Sorted by deadline, soonest first.
 *
 * To-dos whose date has slipped gather in "Missed" sections up top for triage:
 * the primary fix is a fresh date (one tap via `NewDateModal`), the out is
 * delete. A due date outranks a preferred date — a task that missed both sits
 * under "Missed due date" only.
 */
export function InboxView({ now }: { now: Date }) {
  const tasks = useInboxTasks();
  const todayStart = useMemo(() => startOfDay(now), [now]);
  const [fix, setFix] = useState<{ id: string; kind: MissedKind } | null>(null);

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

  // Triage groups: slipped due dates, then slipped preferred dates, then the rest.
  const groups = useMemo(() => {
    const missedDue: Task[] = [];
    const missedPreferred: Task[] = [];
    const rest: Task[] = [];
    for (const t of sorted) {
      const due = t.dueDate ? new Date(t.dueDate) : null;
      const preferred = t.preferredDate ? new Date(t.preferredDate) : null;
      if (due && isBefore(due, todayStart)) missedDue.push(t);
      else if (preferred && isBefore(preferred, todayStart)) missedPreferred.push(t);
      else rest.push(t);
    }
    // `sorted` already puts the most-overdue due date first; do the same for
    // preferred dates (most-slipped intention first).
    missedPreferred.sort(
      (a, b) => new Date(a.preferredDate!).getTime() - new Date(b.preferredDate!).getTime(),
    );
    return { missedDue, missedPreferred, rest };
  }, [sorted, todayStart]);

  const hasMissed = groups.missedDue.length > 0 || groups.missedPreferred.length > 0;
  const fixTask = fix ? tasks.find((t) => t.id === fix.id) ?? null : null;

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
        <div className="space-y-6">
          {groups.missedDue.length > 0 && (
            <Group label="Missed due date" count={groups.missedDue.length} tone="accent">
              {groups.missedDue.map((t) => (
                <TodoRow
                  key={t.id}
                  task={t}
                  todayStart={todayStart}
                  missed="due"
                  onSchedule={() => openReschedule(t.id)}
                  onNewDate={() => setFix({ id: t.id, kind: "due" })}
                />
              ))}
            </Group>
          )}

          {groups.missedPreferred.length > 0 && (
            <Group label="Missed preferred date" count={groups.missedPreferred.length}>
              {groups.missedPreferred.map((t) => (
                <TodoRow
                  key={t.id}
                  task={t}
                  todayStart={todayStart}
                  missed="preferred"
                  onSchedule={() => openReschedule(t.id)}
                  onNewDate={() => setFix({ id: t.id, kind: "preferred" })}
                />
              ))}
            </Group>
          )}

          {groups.rest.length > 0 && (
            <Group label={hasMissed ? "Everything else" : undefined}>
              {groups.rest.map((t) => (
                <TodoRow
                  key={t.id}
                  task={t}
                  todayStart={todayStart}
                  onSchedule={() => openReschedule(t.id)}
                />
              ))}
            </Group>
          )}
        </div>
      )}

      {fix && fixTask && (
        <NewDateModal task={fixTask} kind={fix.kind} now={now} onClose={() => setFix(null)} />
      )}
    </section>
  );
}

/** A labelled cluster of to-do rows; the label is optional (plain list). */
function Group({
  label,
  count,
  tone = "muted",
  children,
}: {
  label?: string;
  count?: number;
  tone?: "accent" | "muted";
  children: ReactNode;
}) {
  return (
    <div>
      {label && (
        <p
          className={`mb-2 text-[0.7rem] font-semibold uppercase tracking-wide ${
            tone === "accent" ? "text-accent" : "text-muted-soft"
          }`}
        >
          {label}
          {typeof count === "number" && (
            <span className="ml-1.5 font-medium text-muted-soft">· {count}</span>
          )}
        </p>
      )}
      <div className="space-y-2.5">
        <AnimatePresence initial={false}>{children}</AnimatePresence>
      </div>
    </div>
  );
}

function TodoRow({
  task,
  todayStart,
  onSchedule,
  missed,
  onNewDate,
}: {
  task: Task;
  todayStart: Date;
  onSchedule: () => void;
  /** Which date slipped, when the row sits in a Missed section. */
  missed?: MissedKind;
  onNewDate?: () => void;
}) {
  const due = task.dueDate ? new Date(task.dueDate) : null;
  const preferred = task.preferredDate ? new Date(task.preferredDate) : null;
  const overdue = due ? isBefore(due, todayStart) : false;
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
      className={`surface relative flex ${
        missed ? "items-start" : "items-center"
      } gap-3 overflow-hidden px-4 py-3.5 ${checked ? "opacity-60" : ""}`}
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
      <span className={`relative z-10 ${missed ? "mt-0.5" : ""}`}>
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
              <span className={overdue ? "font-semibold text-accent" : ""}>
                {overdue ? "overdue · was due" : "due"} {dayLabel(due)}
              </span>
            </>
          )}
          {preferred && (
            <>
              <span className="text-muted-soft">·</span>
              <span className={missed === "preferred" ? "font-medium text-accent" : ""}>
                {missed === "preferred" ? "aimed for" : "prefer"} {dayLabel(preferred)}
              </span>
            </>
          )}
        </p>
        {missed && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button size="sm" variant="secondary" onClick={onNewDate}>
              {missed === "due" ? "New due date" : "New preferred date"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="gap-1.5 text-muted hover:text-accent"
              onClick={() => dropTask(task.id)}
            >
              <TrashIcon className="h-3.5 w-3.5" />
              Delete
            </Button>
          </div>
        )}
      </div>
      <div className={`relative z-10 shrink-0 ${missed ? "mt-0.5" : ""}`}>
        <ActionMenu
          actions={[
            {
              label: "Schedule",
              icon: <ClockIcon className="h-4 w-4" />,
              onClick: onSchedule,
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
