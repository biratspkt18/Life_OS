"use client";
import { motion } from "motion/react";
import type { TodayItem } from "../lib/types";
import { useCheckOff } from "../hooks/useCheckOff";
import { dropTask } from "../lib/tasks";
import { durationLabel, timeLabel } from "../lib/dates";
import { Checkbox } from "./Checkbox";
import { openEdit } from "./Capture";
import { openReschedule } from "./RescheduleModal";
import { ActionMenu } from "./ActionMenu";
import { ImportanceMark } from "./pickers";
import { CalendarIcon, ClockIcon, EditIcon, TrashIcon } from "./icons";

/**
 * One row in the day list. A Life OS task gets a checkbox (checking = the only
 * way to complete) and importance mark; an event pulled from Google Calendar is
 * read-only, marked with a small calendar glyph.
 *
 * Checking a task plays a beat of "done" (sage sweep + strike-through) and then
 * the row collapses away via the parent <AnimatePresence>.
 */
export function TaskRow({ item }: { item: TodayItem }) {
  const start = item.start ? new Date(item.start) : null;
  const isGoogle = item.source === "google";
  const { checked, celebrating, toggle } = useCheckOff(item.id, item.completed);

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
      className="overflow-hidden"
    >
      <div
        className={[
          "surface group relative flex items-center gap-3.5 overflow-hidden px-4 py-3.5 transition-colors duration-300",
          checked ? "opacity-60" : "",
          item.importance === "high" && !checked ? "border-l-[3px] border-l-accent" : "",
        ].join(" ")}
      >
        {/* Sage "done" sweep across the row on completion. */}
        {celebrating && (
          <motion.span
            aria-hidden
            className="pointer-events-none absolute inset-0 z-0 bg-sage/20"
            initial={{ x: "-100%" }}
            animate={{ x: "0%" }}
            transition={{ duration: 0.4, ease: "easeOut" }}
          />
        )}

        <div className="relative z-10">
          {isGoogle ? (
            <span
              className="flex h-5 w-5 shrink-0 items-center justify-center text-muted"
              title="From Google Calendar"
            >
              <CalendarIcon className="h-4 w-4" />
            </span>
          ) : (
            <Checkbox
              checked={checked}
              onChange={toggle}
              label={`Mark “${item.title}” ${checked ? "not done" : "done"}`}
            />
          )}
        </div>

        <div className="relative z-10 min-w-0 flex-1">
          <p
            className={[
              "truncate text-[0.98rem] text-ink transition-all duration-300",
              checked ? "text-muted line-through decoration-muted/60" : "",
            ].join(" ")}
          >
            {item.title}
          </p>
          <p className="mt-0.5 flex items-center gap-2 text-xs text-muted">
            {item.allDay ? <span>All day</span> : start && <span>{timeLabel(start)}</span>}
            {item.durationMinutes != null && (
              <>
                <span className="text-muted-soft">·</span>
                <span>{durationLabel(item.durationMinutes)}</span>
              </>
            )}
            {isGoogle && (
              <>
                <span className="text-muted-soft">·</span>
                <span>Google Calendar</span>
              </>
            )}
          </p>
        </div>

        {!isGoogle && item.importance && (
          <span className="relative z-10">
            <ImportanceMark importance={item.importance} />
          </span>
        )}

        {!isGoogle && (
          <div className="relative z-10">
            <ActionMenu
              actions={[
                {
                  label: "Edit",
                  icon: <EditIcon className="h-4 w-4" />,
                  onClick: () => openEdit(item.id),
                },
                {
                  label: "Reschedule",
                  icon: <ClockIcon className="h-4 w-4" />,
                  onClick: () => openReschedule(item.id),
                },
                {
                  label: "Delete",
                  icon: <TrashIcon className="h-4 w-4" />,
                  danger: true,
                  onClick: () => dropTask(item.id),
                },
              ]}
            />
          </div>
        )}
      </div>
    </motion.div>
  );
}
