"use client";
import { useMemo, useState } from "react";
import { useAllTasks, useExternalBusy } from "../hooks/useDb";
import { breakdownThreshold, ENERGY_LABEL, type Settings, type Task } from "../lib/types";
import { proposeSlot } from "../lib/schedule";
import { ConflictError, dropTask, fetchTasks, rescheduleTask, setCompleted } from "../lib/tasks";
import { addDays, format, isSameDay, startOfDay, whenLabel } from "../lib/dates";
import { CheckIcon, StepsIcon, TrashIcon } from "./icons";
import { ImportanceMark } from "./pickers";
import { openBreakdown } from "./BreakdownModal";

/**
 * Reschedule-at-login loop (brief §7). Calm, forgiving, fast — never a guilt
 * pile. Collects past undone tasks and offers one-tap re-homing before Today.
 */
export function RescheduleLoop({
  tasks,
  settings,
  now,
  onDismiss,
}: {
  tasks: Task[];
  settings: Settings;
  now: Date;
  onDismiss: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const externalBusy = useExternalBusy(startOfDay(now), 30);

  async function pushAllToTomorrow() {
    setBusy(true);
    const tomorrow = addDays(startOfDay(now), 1);
    // Process sequentially, re-reading state so each placement sees the last.
    for (const t of tasks) {
      const all = await fetchTasks();
      const proposal = proposeSlot({
        durationMinutes: t.durationMinutes,
        importance: t.importance,
        settings,
        tasks: all,
        externalBusy,
        now,
        earliestDay: tomorrow,
        excludeTaskId: t.id,
      });
      if (!proposal) continue;
      // If the proposed slot was taken (e.g. a calendar event), skip and move on.
      try {
        await rescheduleTask(t.id, proposal.start, {
          proposedStart: proposal.start.toISOString(),
          chosenVia: "quick",
        });
      } catch {
        /* leave it for the user to re-home by hand */
      }
    }
    setBusy(false);
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-paper/95 backdrop-blur-sm">
      <div className="paper-grain min-h-full" />
      <div className="relative z-10 mx-auto max-w-xl px-4 py-10">
        <header className="mb-6 animate-fade-up">
          <h1 className="text-2xl font-bold tracking-tight text-ink">
            A few things slipped past
          </h1>
          <p className="mt-1.5 text-[0.95rem] leading-relaxed text-muted">
            No worries — that's normal. Let's find new homes for them, then get on with
            today.
          </p>
        </header>

        <div className="mb-5 flex flex-wrap gap-2">
          <button
            onClick={pushAllToTomorrow}
            disabled={busy}
            className="btn-primary"
          >
            Push all to tomorrow
          </button>
          <button onClick={onDismiss} className="btn-ghost">
            Not now
          </button>
        </div>

        <div className="space-y-2.5">
          {tasks.map((t) => (
            <RescheduleRow key={t.id} task={t} settings={settings} now={now} />
          ))}
        </div>

        <p className="mt-6 text-center text-xs text-muted-soft">
          {tasks.length} thing{tasks.length === 1 ? "" : "s"} to re-home
        </p>
      </div>
    </div>
  );
}

export function RescheduleRow({
  task,
  settings,
  now,
}: {
  task: Task;
  settings: Settings;
  now: Date;
}) {
  const [picking, setPicking] = useState(false);
  const [dayOffset, setDayOffset] = useState(1); // default: tomorrow
  const [error, setError] = useState<string | null>(null);
  const allTasks = useAllTasks();
  const externalBusy = useExternalBusy(startOfDay(now), 30);

  const earliestDay = useMemo(
    () => addDays(startOfDay(now), dayOffset),
    [now, dayOffset],
  );
  const proposal = useMemo(
    () =>
      proposeSlot({
        durationMinutes: task.durationMinutes,
        importance: task.importance,
        settings,
        tasks: allTasks,
        externalBusy,
        now,
        earliestDay,
        excludeTaskId: task.id,
      }),
    [task, settings, allTasks, externalBusy, now, earliestDay],
  );

  async function move() {
    if (!proposal) return;
    setError(null);
    try {
      await rescheduleTask(task.id, proposal.start, {
        proposedStart: proposal.start.toISOString(),
        chosenVia: "quick",
      });
    } catch (err) {
      setError(
        err instanceof ConflictError
          ? `That overlaps “${err.conflict.title}” — try another day.`
          : "Couldn't move it — please try again.",
      );
    }
  }

  const start = task.scheduledStart ? new Date(task.scheduledStart) : null;

  return (
    <div className="surface animate-fade-up p-4">
      <div className="flex items-start gap-3">
        <span className="mt-1.5">
          <ImportanceMark importance={task.importance} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[0.98rem] font-medium text-ink">{task.title}</p>
          {start && (
            <p className="mt-0.5 text-xs text-muted">
              was {whenLabel(start)}
              {task.tag && <> · {task.tag}</>}
              {task.energy && <> · {ENERGY_LABEL[task.energy].toLowerCase()} energy</>}
            </p>
          )}
        </div>
      </div>

      {!picking ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <button onClick={move} className="btn-outline px-3 py-1.5 text-sm">
            Tomorrow
          </button>
          <button
            onClick={() => setPicking(true)}
            className="btn-ghost px-3 py-1.5 text-sm"
          >
            Pick a day
          </button>
          <button
            onClick={() => setCompleted(task.id, true)}
            className="btn-ghost px-3 py-1.5 text-sm"
          >
            <CheckIcon className="h-4 w-4" /> I did this
          </button>
          {task.deferralCount >= breakdownThreshold(settings) && (
            <button
              onClick={() => openBreakdown(task.id)}
              className="btn-ghost px-3 py-1.5 text-sm"
            >
              <StepsIcon className="h-4 w-4" /> Break it down
            </button>
          )}
          <button
            onClick={() => dropTask(task.id)}
            className="btn-ghost px-3 py-1.5 text-sm text-muted"
          >
            <TrashIcon className="h-4 w-4" /> Drop
          </button>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            onClick={() => setDayOffset((d) => Math.max(1, d - 1))}
            disabled={dayOffset <= 1}
            className="btn-outline px-2.5 py-1.5"
            aria-label="Earlier day"
          >
            ‹
          </button>
          <div className="min-w-[9.5rem] rounded-xl bg-paper-edge/50 px-3 py-2 text-center text-sm font-medium text-ink">
            {proposal ? whenLabel(proposal.start) : "No room found"}
          </div>
          <button
            onClick={() => setDayOffset((d) => d + 1)}
            className="btn-outline px-2.5 py-1.5"
            aria-label="Later day"
          >
            ›
          </button>
          <button
            onClick={move}
            disabled={!proposal}
            className="btn-primary px-3 py-1.5 text-sm"
          >
            Move here
          </button>
          <button onClick={() => setPicking(false)} className="btn-ghost px-3 py-1.5 text-sm">
            Back
          </button>
          {proposal && !isSameDay(proposal.start, earliestDay) && (
            <p className="w-full text-xs text-muted">
              {format(earliestDay, "EEE d MMM")} was full — proposing the next day that
              fits.
            </p>
          )}
        </div>
      )}

      {error && <p className="mt-2 text-xs font-medium text-accent">{error}</p>}
    </div>
  );
}
