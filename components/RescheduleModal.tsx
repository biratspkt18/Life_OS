"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { useAllTasks, useExternalBusy, useSettings } from "../hooks/useDb";
import { ConflictError, rescheduleTask, updateTask } from "../lib/tasks";
import type { Task } from "../lib/types";
import { findFreeSlots } from "../lib/freeSlots";
import {
  addDays,
  dayLabel,
  durationLabel,
  format,
  isSameDay,
  isToday,
  isTomorrow,
  startOfDay,
  timeLabel,
} from "../lib/dates";
import { cn } from "../lib/utils";
import { CloseIcon } from "./icons";
import { Button } from "./ui/button";
import { DayPlacer, useFirstFit } from "./DayPlacer";

const EVENT = "lifeos:reschedule";
/** How far ahead we look for free time. */
const HORIZON_DAYS = 14;

/** Open the shared reschedule modal for a task, from anywhere. */
export function openReschedule(taskId: string) {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { taskId } }));
}

/**
 * The shared "find a time" modal — used to place a to-do onto the calendar, to
 * reschedule a task, or to log when a done task happened. Pick a day, then
 * drag the task's block through it: free gaps take the drop and releasing
 * schedules it; conflicts lift it red and won't. Quick chips and an exact-time
 * input are the secondary paths. Rendered once (in the Shell).
 */
export function RescheduleHost({ now }: { now: Date }) {
  const [taskId, setTaskId] = useState<string | null>(null);
  const tasks = useAllTasks();
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    function onOpen(e: Event) {
      setTaskId((e as CustomEvent<{ taskId: string }>).detail.taskId);
    }
    window.addEventListener(EVENT, onOpen);
    return () => window.removeEventListener(EVENT, onOpen);
  }, []);

  useEffect(() => {
    if (!taskId) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setTaskId(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [taskId]);

  if (!taskId) return null;
  const task = tasks.find((t) => t.id === taskId);
  if (!task) return null;

  const isNew = !task.scheduledStart;
  const heading = task.completed ? "Log the time" : isNew ? "Find a time" : "Reschedule";
  const close = () => setTaskId(null);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div
        className="absolute inset-0 bg-ink/25 backdrop-blur-[2px] animate-fade-in"
        onClick={close}
      />
      <motion.div
        className="surface relative z-10 flex max-h-[min(85dvh,38rem)] w-full max-w-md flex-col overflow-hidden rounded-b-none rounded-t-2xl sm:m-4 sm:rounded-2xl"
        initial={reduceMotion ? { opacity: 0 } : { y: 24, opacity: 0, scale: 0.98 }}
        animate={reduceMotion ? { opacity: 1 } : { y: 0, opacity: 1, scale: 1 }}
        transition={{ type: "spring", stiffness: 380, damping: 32 }}
      >
        <div className="shrink-0 px-5 pt-5">
          <div className="mb-1 flex items-start justify-between">
            <h2 className="font-display text-lg font-bold tracking-tight text-ink">{heading}</h2>
            <button
              onClick={close}
              className="-mr-1.5 -mt-1 rounded-lg p-1.5 text-muted-soft transition-colors hover:bg-paper-edge/60 hover:text-ink"
              aria-label="Close"
            >
              <CloseIcon className="h-5 w-5" />
            </button>
          </div>
          <p className="text-sm font-medium text-ink">{task.title}</p>
          <p className="mb-3 text-xs text-muted">
            {durationLabel(task.durationMinutes)}
            <span className="mx-1.5 text-muted-soft">·</span>
            {task.completed ? "when did you get to it?" : "drag it onto a free time"}
            {task.dueDate && !task.completed && (
              <span className="text-accent"> · due {dayLabel(new Date(task.dueDate))}</span>
            )}
          </p>
        </div>
        {/* Keyed by task id so the picker resets each time it's reopened. */}
        <TimePicker key={task.id} task={task} now={now} onDone={close} />
      </motion.div>
    </div>
  );
}

/** Short heading for a day pill: Today / Tomorrow / weekday. */
function dayHeading(day: Date): string {
  if (isToday(day)) return "Today";
  if (isTomorrow(day)) return "Tomorrow";
  return format(day, "EEE");
}

function TimePicker({ task, now, onDone }: { task: Task; now: Date; onDone: () => void }) {
  const settings = useSettings();
  const allTasks = useAllTasks();
  const today = useMemo(() => startOfDay(now), [now]);
  const externalBusy = useExternalBusy(today, HORIZON_DAYS);

  // Every free start-time across the horizon that this task actually fits into.
  const slots = useMemo(
    () =>
      findFreeSlots({
        durationMinutes: task.durationMinutes,
        settings,
        tasks: allTasks,
        now,
        fromDay: today,
        days: HORIZON_DAYS,
        excludeTaskId: task.id,
        externalBusy,
        stepMinutes: 30,
        maxPerDay: 80,
        limit: 600,
      }),
    [task, settings, allTasks, now, today, externalBusy],
  );

  const byDay = useMemo(() => {
    const m = new Map<string, Date[]>();
    for (const s of slots) {
      const k = startOfDay(s).toDateString();
      const list = m.get(k);
      if (list) list.push(s);
      else m.set(k, [s]);
    }
    return m;
  }, [slots]);

  const availableDays = useMemo(() => {
    const days: Date[] = [];
    for (let d = 0; d < HORIZON_DAYS; d++) {
      const day = addDays(today, d);
      if (byDay.has(day.toDateString())) days.push(day);
    }
    return days;
  }, [byDay, today]);

  // A to-do with a future preferred date opens the picker *on that day* —
  // "preferred" should guide placement, not just sort suggestions. It's a
  // default, not a wall: earlier days stay one tap away.
  const prefDay = useMemo(() => {
    if (task.completed || !task.preferredDate) return null;
    const p = startOfDay(new Date(task.preferredDate));
    return !Number.isNaN(p.getTime()) && p > today ? p : null;
  }, [task.completed, task.preferredDate, today]);

  // The task's current day, if it still has openings, is the friendly default;
  // then the preferred date; then the first day with room.
  const currentDay = task.scheduledStart ? startOfDay(new Date(task.scheduledStart)) : null;
  const preferredDay =
    (currentDay && byDay.has(currentDay.toDateString()) ? currentDay : null) ??
    (prefDay && byDay.has(prefDay.toDateString()) ? prefDay : null) ??
    availableDays[0] ??
    null;

  // User choices override the derived defaults; everything else is computed in
  // render, so changing day re-seats the ghost at that day's first fit (no
  // effects). The ghost never spawns on a conflict.
  const [pickedDay, setPickedDay] = useState<Date | null>(null);
  const [pickedStart, setPickedStart] = useState<Date | null>(null);

  const activeDay =
    pickedDay && byDay.has(pickedDay.toDateString()) ? pickedDay : preferredDay;
  // Rescheduling within the same day starts from the task's current time, so
  // "just release" (or "Log it") reads as keeping the slot.
  const currentStart = task.scheduledStart ? new Date(task.scheduledStart) : null;
  const firstFit = useFirstFit(
    activeDay ?? today,
    task.durationMinutes,
    now,
    task.id,
    currentStart && activeDay && isSameDay(currentStart, activeDay) ? currentStart : undefined,
  );
  const activeStart =
    pickedStart && activeDay && isSameDay(pickedStart, activeDay) ? pickedStart : firstFit;

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // The modal's opening proposal, for the event log's proposed-vs-chosen pair.
  const initialFitRef = useRef<Date | null>(null);
  useEffect(() => {
    if (!initialFitRef.current && firstFit) initialFitRef.current = firstFit;
  }, [firstFit]);

  async function confirm(start: Date) {
    if (saving) return;
    setSaving(true);
    setError(null);
    const context = {
      proposedStart: initialFitRef.current?.toISOString() ?? null,
      chosenVia: (pickedStart ? "drag" : "first_fit") as "drag" | "first_fit",
    };
    try {
      if (task.completed) {
        // Logging when it happened — must NOT go through rescheduleTask, which
        // would clear `completed`.
        await updateTask(task.id, { scheduledStart: start.toISOString() }, context);
      } else {
        await rescheduleTask(task.id, start, context);
      }
      onDone();
    } catch (err) {
      setSaving(false);
      setError(
        err instanceof ConflictError
          ? "That slot was just taken — pick another."
          : "Couldn't schedule — please try again.",
      );
    }
  }

  if (availableDays.length === 0) {
    return (
      <p className="mx-5 mb-[max(1.25rem,env(safe-area-inset-bottom))] rounded-2xl border border-dashed border-paper-edge bg-paper-deep/30 px-4 py-6 text-center text-sm text-muted sm:mb-5">
        No open time that fits in the next {HORIZON_DAYS} days. Try a shorter estimate, or widen
        your day windows in Settings.
      </p>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Day selector — only days that actually have room. Stays put while slots scroll. */}
      <div className="flex shrink-0 gap-1.5 overflow-x-auto px-4 pb-2 pt-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {availableDays.map((day) => {
          const active = !!activeDay && isSameDay(day, activeDay);
          return (
            <button
              key={day.toDateString()}
              type="button"
              onClick={() => {
                setPickedDay(day);
                setPickedStart(null);
              }}
              className={cn(
                "relative shrink-0 rounded-xl px-3 py-2 text-center outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent/40",
                active ? "text-white" : "text-ink hover:bg-paper-edge/50",
              )}
            >
              {active && (
                <motion.span
                  layoutId="resched-day"
                  aria-hidden
                  className="absolute inset-0 rounded-xl bg-accent shadow-accent"
                  transition={{ type: "spring", stiffness: 520, damping: 34 }}
                />
              )}
              <span className="relative z-10 block text-[0.65rem] font-semibold uppercase tracking-wide opacity-90">
                {dayHeading(day)}
              </span>
              <span className="relative z-10 block text-sm font-semibold tabular-nums">
                {format(day, "d MMM")}
              </span>
            </button>
          );
        })}
      </div>

      {/* The day itself — drag the block into a free gap; release schedules. */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-3">
        {activeDay && (
          <DayPlacer
            day={activeDay}
            durationMinutes={task.durationMinutes}
            now={now}
            value={activeStart}
            onChange={setPickedStart}
            onRelease={(s) => confirm(s)}
            excludeId={task.id}
            disabled={saving}
            ariaLabel={`Start time for ${task.title}`}
          />
        )}
      </div>

      <div className="shrink-0 space-y-2.5 border-t border-paper-edge px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3 sm:pb-5">
        {error && <p className="text-xs font-medium text-accent">{error}</p>}
        <p className="text-xs text-muted">
          {activeStart ? (
            <>
              <span className="text-muted-soft">Schedules for </span>
              <span className="font-medium text-ink">
                {dayLabel(activeStart)} · {timeLabel(activeStart)}
              </span>
            </>
          ) : (
            "Pick a time"
          )}
        </p>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onDone} className="flex-none">
            Cancel
          </Button>
          <Button
            onClick={() => activeStart && confirm(activeStart)}
            disabled={!activeStart || saving}
            className="flex-1"
          >
            {saving ? "Scheduling…" : task.completed ? "Log it" : "Schedule"}
          </Button>
        </div>
      </div>
    </div>
  );
}
