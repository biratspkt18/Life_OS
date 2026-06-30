"use client";
import { useEffect, useMemo, useState } from "react";
import { useAllTasks, useDayBusy, useExternalBusy, useSettings } from "../hooks/useDb";
import { ConflictError, rescheduleTask, updateTask } from "../lib/tasks";
import { windowForDay } from "../lib/types";
import type { Task } from "../lib/types";
import { findFreeSlots } from "../lib/freeSlots";
import {
  atTime,
  dayLabel,
  durationLabel,
  format,
  isBefore,
  startOfDay,
  timeLabel,
} from "../lib/dates";
import { DayPickerButton } from "./pickers";
import { CloseIcon } from "./icons";

const EVENT = "lifeos:reschedule";

/** Open the shared reschedule modal for a task, from anywhere. */
export function openReschedule(taskId: string) {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { taskId } }));
}

/**
 * The single, shared reschedule modal — used by the timeline, the "Got a little
 * room?" nudge, and the Loose ends screen. You pick the exact day **and** time;
 * times that overlap an existing task or a Google Calendar event are blocked, so
 * nothing ever double-books. Rendered once (in the Shell); opened via
 * `openReschedule`.
 */
export function RescheduleHost({ now }: { now: Date }) {
  const [taskId, setTaskId] = useState<string | null>(null);
  const tasks = useAllTasks();

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

  // A to-do (no slot yet) is placed for the first time → "Schedule"; a finished
  // task → "Edit done time"; otherwise → "Reschedule".
  const isNew = !task.scheduledStart;
  const heading = task.completed ? "Edit done time" : isNew ? "Schedule" : "Reschedule";
  const close = () => setTaskId(null);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div
        className="absolute inset-0 bg-ink/20 backdrop-blur-[2px] animate-fade-in"
        onClick={close}
      />
      <div className="surface relative z-10 w-full max-w-md animate-scale-in rounded-b-none rounded-t-2xl p-5 sm:m-4 sm:rounded-2xl">
        <div className="mb-1 flex items-start justify-between">
          <h2 className="text-base font-semibold text-ink">{heading}</h2>
          <button onClick={close} className="btn-ghost -mr-2 px-2 py-1.5" aria-label="Close">
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>
        <p className="text-sm font-medium text-ink">{task.title}</p>
        <p className="mb-4 text-xs text-muted">
          about {durationLabel(task.durationMinutes)} ·{" "}
          {task.completed ? "when did you do it?" : "pick a day and time"}
          {task.dueDate && (
            <span className="text-accent"> · due {dayLabel(new Date(task.dueDate))}</span>
          )}
        </p>
        {/* Keyed by task id so day/time state resets each time it's reopened. */}
        <RescheduleBody key={task.id} task={task} now={now} onDone={close} />
      </div>
    </div>
  );
}

function RescheduleBody({
  task,
  now,
  onDone,
}: {
  task: Task;
  now: Date;
  onDone: () => void;
}) {
  const settings = useSettings();
  const allTasks = useAllTasks();
  const minDay = useMemo(() => startOfDay(now), [now]);

  // Default day: the task's current slot if still upcoming; otherwise, for a
  // to-do, lean on its preferred date (then due date); else today.
  const current = task.scheduledStart ? new Date(task.scheduledStart) : null;
  const [day, setDay] = useState<Date>(() => {
    const future = (d: Date | null) => (d && !isBefore(d, minDay) ? startOfDay(d) : null);
    return (
      future(current) ??
      future(task.preferredDate ? new Date(task.preferredDate) : null) ??
      future(task.dueDate ? new Date(task.dueDate) : null) ??
      minDay
    );
  });
  const [time, setTime] = useState<string>(() => (current ? format(current, "HH:mm") : "09:00"));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Busy intervals on the chosen day (this task excluded), incl. Google events.
  const dayBusy = useDayBusy(day, task.id);
  // Google busy across the day, so free-time suggestions dodge external events.
  const externalBusy = useExternalBusy(day, 1);

  const start = useMemo(() => atTime(day, time), [day, time]);
  const end = useMemo(() => start.getTime() + task.durationMinutes * 60_000, [start, task]);

  const isPast = start.getTime() < now.getTime();
  const conflict = useMemo(
    () => dayBusy.find((iv) => start.getTime() < iv.end.getTime() && iv.start.getTime() < end) ?? null,
    [dayBusy, start, end],
  );
  const blocked = isPast || !!conflict;

  // A few free start-times on the chosen day to tap (the app finds them; you choose).
  const suggestions = useMemo(
    () =>
      findFreeSlots({
        durationMinutes: task.durationMinutes,
        settings,
        tasks: allTasks,
        now,
        fromDay: day,
        days: 1,
        excludeTaskId: task.id,
        externalBusy,
        maxPerDay: 6,
        limit: 6,
      }),
    [task, settings, allTasks, now, day, externalBusy],
  );

  const win = windowForDay(settings, day);

  async function confirm() {
    if (blocked || saving) return;
    setSaving(true);
    setError(null);
    try {
      if (task.completed) {
        // Logging when a done task actually happened — keep it completed.
        await updateTask(task.id, { scheduledStart: start.toISOString() });
      } else {
        await rescheduleTask(task.id, start);
      }
      onDone();
    } catch (err) {
      setSaving(false);
      if (err instanceof ConflictError) {
        setError(`That overlaps “${err.conflict.title}” — pick another time.`);
      } else {
        setError("Couldn't reschedule — please try again.");
      }
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <FieldLabel>Which day?</FieldLabel>
        <DayPickerButton
          value={day}
          min={minDay}
          label={`${dayLabel(day)} · ${format(day, "d MMM")}`}
          onSelect={(d) => setDay(startOfDay(d))}
        />
        {!win.enabled && (
          <p className="mt-1.5 text-xs text-muted">
            Heads up — {format(day, "EEEE")} is set as a day off in your settings.
          </p>
        )}
      </div>

      <div>
        <FieldLabel>What time?</FieldLabel>
        <input
          type="time"
          value={time}
          onChange={(e) => setTime(e.target.value || "09:00")}
          className="rounded-xl border border-paper-edge bg-paper-card px-3 py-2 text-base font-medium tabular-nums text-ink outline-none focus:border-accent/40 [color-scheme:light]"
          aria-label="Time"
        />
        {suggestions.length > 0 && (
          <div className="mt-2.5">
            <p className="mb-1.5 text-[0.7rem] font-semibold uppercase tracking-wide text-muted-soft">
              Free that day
            </p>
            <div className="flex flex-wrap gap-1.5">
              {suggestions.map((s) => {
                const hhmm = format(s, "HH:mm");
                const active = hhmm === time;
                return (
                  <button
                    key={s.toISOString()}
                    type="button"
                    onClick={() => setTime(hhmm)}
                    className={[
                      "rounded-lg border px-2.5 py-1 text-xs font-medium tabular-nums transition-colors",
                      active
                        ? "border-accent/50 bg-accent-wash text-accent"
                        : "border-paper-edge bg-paper-card text-ink hover:border-accent/50 hover:bg-accent-wash",
                    ].join(" ")}
                  >
                    {timeLabel(s)}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {(blocked || error) && (
        <p className="text-xs font-medium text-accent">
          {error
            ? error
            : isPast
              ? "That time has already passed — pick a later one."
              : `That overlaps “${conflict!.title}” — pick another time.`}
        </p>
      )}

      <div className="flex items-center justify-end gap-2 pt-1">
        <button onClick={onDone} className="btn-ghost px-3 py-1.5 text-sm">
          Cancel
        </button>
        <button
          onClick={confirm}
          disabled={blocked || saving}
          className="btn-primary px-3 py-1.5 text-sm"
        >
          {saving ? "Moving…" : "Reschedule"}
        </button>
      </div>
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">{children}</p>;
}
