"use client";
import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useMissedTodos, usePastUndoneTasks } from "../hooks/useDb";
import { useCheckOff } from "../hooks/useCheckOff";
import { dropTask } from "../lib/tasks";
import { dayLabel, durationLabel, format } from "../lib/dates";
import { Checkbox } from "../components/Checkbox";
import { openEdit } from "../components/Capture";
import { openReschedule } from "../components/RescheduleModal";
import { NewDateModal } from "../components/NewDateModal";
import { ActionMenu } from "../components/ActionMenu";
import { CalendarIcon, ClockIcon, EditIcon, TrashIcon } from "../components/icons";
import { Celebration } from "../components/Celebration";
import type { Task } from "../lib/types";

type MissedKind = "due" | "preferred";

/** One entry on the screen: a slipped scheduled task, or a to-do that missed its date. */
interface LooseEnd {
  task: Task;
  /** Set when this is a to-do whose due/preferred date slipped (not a scheduled task). */
  missed?: MissedKind;
  /** The moment it slipped past — scheduled start, or the missed date. Sorts the list. */
  when: Date;
}

/**
 * Loose ends — everything that slipped past: scheduled tasks that went
 * unchecked *and* to-dos whose due or preferred date is gone. This is the only
 * place they gather (the Today screen just nudges what fits into open room).
 * No guilt: check off what's done, re-home what still matters, let the rest go.
 */
export function LooseEndsView({ now }: { now: Date }) {
  const slipped = usePastUndoneTasks(now);
  const missed = useMissedTodos(now);
  const [fix, setFix] = useState<{ id: string; kind: MissedKind } | null>(null);

  // One list, most-slipped first. A task is never in both sources: slipped ones
  // have a scheduledStart, missed to-dos never do.
  const ends = useMemo<LooseEnd[]>(
    () =>
      [
        ...slipped.map((task) => ({ task, when: new Date(task.scheduledStart!) })),
        ...missed.map((m) => ({ task: m.task, missed: m.missed, when: m.when })),
      ].sort((a, b) => a.when.getTime() - b.when.getTime()),
    [slipped, missed],
  );

  const fixEnd = fix ? ends.find((e) => e.task.id === fix.id) ?? null : null;

  return (
    <section>
      <header className="mb-5">
        <h1 className="text-3xl font-bold tracking-tight text-ink">Loose ends</h1>
        <p className="mt-1 text-[0.95rem] leading-relaxed text-muted">
          Tasks and to-dos from the past that didn’t happen. No guilt here — pick what still
          matters and let the rest go.
        </p>
      </header>

      {ends.length === 0 ? (
        <Celebration title="All tied up." sub="Nothing slipped past. Nice." />
      ) : (
        <div className="space-y-2.5">
          <AnimatePresence initial={false}>
            {ends.map((e) => (
              <LooseEndRow
                key={e.task.id}
                end={e}
                onNewDate={e.missed ? () => setFix({ id: e.task.id, kind: e.missed! }) : undefined}
              />
            ))}
          </AnimatePresence>
        </div>
      )}

      {fix && fixEnd && (
        <NewDateModal task={fixEnd.task} kind={fix.kind} now={now} onClose={() => setFix(null)} />
      )}
    </section>
  );
}

function LooseEndRow({ end, onNewDate }: { end: LooseEnd; onNewDate?: () => void }) {
  const { task, missed, when } = end;
  const { checked, celebrating, toggle } = useCheckOff(task.id, task.completed);

  const actions = [
    {
      label: "Find a time",
      icon: <ClockIcon className="h-4 w-4" />,
      onClick: () => openReschedule(task.id),
    },
    ...(onNewDate
      ? [
          {
            label: missed === "due" ? "New due date" : "New preferred date",
            icon: <CalendarIcon className="h-4 w-4" />,
            onClick: onNewDate,
          },
        ]
      : []),
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
  ];

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
      className={`relative flex items-center gap-3.5 overflow-hidden rounded-2xl border border-gold/40 bg-gold-wash/50 px-4 py-3.5 ${
        checked ? "opacity-60" : ""
      }`}
    >
      {celebrating && (
        <motion.span
          aria-hidden
          className="pointer-events-none absolute inset-0 z-0 bg-sage/25"
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
          className={`truncate text-[0.98rem] font-medium text-ink ${
            checked ? "text-muted line-through decoration-muted/60" : ""
          }`}
        >
          {task.title}
        </p>
        <p className="mt-0.5 text-xs text-muted">
          {missed ? (
            <>
              {missed === "due" ? "was due" : "aimed for"} {dayLabel(when)} ·{" "}
              {format(when, "MMM d")}
            </>
          ) : (
            <>
              was set for {dayLabel(when)} · {format(when, "MMM d")}
            </>
          )}
          <span className="mx-1.5 text-muted-soft">·</span>~
          {durationLabel(task.durationMinutes)}
        </p>
      </div>
      <div className="relative z-10 flex shrink-0 items-center">
        <ActionMenu actions={actions} />
      </div>
    </motion.div>
  );
}
