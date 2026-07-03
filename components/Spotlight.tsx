"use client";
import { motion } from "motion/react";
import type { TodayItem } from "../lib/types";
import { useCheckOff } from "../hooks/useCheckOff";
import { dropTask } from "../lib/tasks";
import { durationLabel, minutesBetween, timeLabel } from "../lib/dates";
import { Checkbox } from "./Checkbox";
import { openEdit } from "./Capture";
import { openReschedule } from "./RescheduleModal";
import { ActionMenu } from "./ActionMenu";
import { CalendarIcon, ClockIcon, EditIcon, TrashIcon } from "./icons";

/**
 * The "now / next" spotlight (brief §5C): the current or next upcoming block,
 * large and friendly. Big, calm, answers "what now?". Works for a Life OS task
 * (checkable) or a read-only Google Calendar event.
 */
export function Spotlight({ item, now }: { item: TodayItem; now: Date }) {
  const start = item.start ? new Date(item.start) : null;
  const end =
    start && item.durationMinutes != null
      ? new Date(start.getTime() + item.durationMinutes * 60_000)
      : null;
  const isNow = !!(start && end && start <= now && now < end);
  const isGoogle = item.source === "google";
  const { checked, celebrating, toggle } = useCheckOff(item.id, item.completed);

  // Live progress for the block in progress: elapsed fraction + minutes left.
  const total = start && end ? minutesBetween(start, end) : 0;
  const minsLeft = isNow && end ? Math.max(0, minutesBetween(now, end)) : 0;
  const progressPct = isNow && total > 0 ? Math.min(100, Math.max(0, ((total - minsLeft) / total) * 100)) : 0;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8, scale: 0.99 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96, y: -8, transition: { duration: 0.3, ease: [0.16, 1, 0.3, 1] } }}
      transition={{ type: "spring", stiffness: 380, damping: 32 }}
      className="surface relative mb-6 overflow-hidden border-l-[3px] border-l-accent bg-paper-card p-5 shadow-spotlight"
    >
      {/* Sage "done" sweep on completion. */}
      {celebrating && (
        <motion.span
          aria-hidden
          className="pointer-events-none absolute inset-0 z-0 bg-sage/20"
          initial={{ x: "-100%" }}
          animate={{ x: "0%" }}
          transition={{ duration: 0.45, ease: "easeOut" }}
        />
      )}
      <div className="relative z-10 mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-accent">
          {isNow ? "Now" : "Next up"}
        </p>
        {!isGoogle && (
          <div className="-mr-1 -mt-1">
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
      <div className="relative z-10 flex items-start gap-4">
        <div className="pt-1">
          {isGoogle ? (
            <span
              className="flex h-6 w-6 items-center justify-center text-muted"
              title="From Google Calendar"
            >
              <CalendarIcon className="h-5 w-5" />
            </span>
          ) : (
            <Checkbox
              checked={checked}
              onChange={toggle}
              label={`Mark “${item.title}” done`}
            />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h2
            className={[
              "text-xl font-semibold leading-snug text-ink",
              checked ? "text-muted line-through" : "",
            ].join(" ")}
          >
            {item.title}
          </h2>
          <p className="mt-1.5 text-sm text-muted">
            {item.allDay ? (
              <span className="font-medium text-ink">All day</span>
            ) : (
              start && <span className="font-medium text-ink">{timeLabel(start)}</span>
            )}
            {item.durationMinutes != null && (
              <>
                <span className="mx-1.5 text-muted-soft">·</span>
                {durationLabel(item.durationMinutes)}
              </>
            )}
            {isGoogle && (
              <>
                <span className="mx-1.5 text-muted-soft">·</span>
                Google Calendar
              </>
            )}
          </p>

          {isNow && end && (
            <div className="mt-3.5">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-paper-edge">
                <div
                  className="h-full rounded-full bg-accent transition-all duration-500"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <p className="mt-1.5 text-xs text-muted">
                about <span className="font-medium text-ink">{minsLeft} min left</span>
                <span className="mx-1.5 text-muted-soft">—</span>
                ends {timeLabel(end)}
              </p>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
