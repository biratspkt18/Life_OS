"use client";
import { AnimatePresence, motion } from "motion/react";
import { usePastUndoneTasks } from "../hooks/useDb";
import { useCheckOff } from "../hooks/useCheckOff";
import { dropTask } from "../lib/tasks";
import { dayLabel, durationLabel, format } from "../lib/dates";
import { Checkbox } from "../components/Checkbox";
import { openEdit } from "../components/Capture";
import { openReschedule } from "../components/RescheduleModal";
import { ActionMenu } from "../components/ActionMenu";
import { ClockIcon, EditIcon, TrashIcon } from "../components/icons";
import { Celebration } from "../components/Celebration";
import type { Task } from "../lib/types";

/**
 * Loose ends — past tasks that slipped by. No guilt: check off what's done,
 * re-home what still matters, let the rest go. The full list lives here (the
 * Today screen only nudges one at a time). Mirrors Cue's Loose ends screen.
 */
export function LooseEndsView({ now }: { now: Date }) {
  const tasks = usePastUndoneTasks(now);

  return (
    <section>
      <header className="mb-5">
        <h1 className="text-3xl font-bold tracking-tight text-ink">Loose ends</h1>
        <p className="mt-1 text-[0.95rem] leading-relaxed text-muted">
          Tasks from the past that didn’t happen. No guilt here — pick what still matters and let the
          rest go.
        </p>
      </header>

      {tasks.length === 0 ? (
        <Celebration title="All tied up." sub="Nothing slipped past. Nice." />
      ) : (
        <div className="space-y-2.5">
          <AnimatePresence initial={false}>
            {tasks.map((t) => (
              <LooseEndRow key={t.id} task={t} />
            ))}
          </AnimatePresence>
        </div>
      )}
    </section>
  );
}

function LooseEndRow({ task }: { task: Task }) {
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
          {task.scheduledStart && (
            <>
              was set for {dayLabel(new Date(task.scheduledStart))} ·{" "}
              {format(new Date(task.scheduledStart), "MMM d")}
              <span className="mx-1.5 text-muted-soft">·</span>
            </>
          )}
          ~{durationLabel(task.durationMinutes)}
        </p>
      </div>
      <div className="relative z-10 flex shrink-0 items-center">
        <ActionMenu
          actions={[
            {
              label: "Find a time",
              icon: <ClockIcon className="h-4 w-4" />,
              onClick: () => openReschedule(task.id),
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
