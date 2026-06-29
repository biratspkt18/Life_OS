"use client";
import { useEffect, useState } from "react";
import { useAllTasks } from "../hooks/useDb";
import { useScheduler } from "../hooks/useScheduler";
import { rescheduleTask } from "../lib/tasks";
import { durationLabel, startOfDay } from "../lib/dates";
import { SlotPicker } from "./SlotPicker";
import { CloseIcon } from "./icons";

const EVENT = "daybook:reschedule";

/** Open the shared reschedule modal for a task, from anywhere. */
export function openReschedule(taskId: string) {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { taskId } }));
}

/**
 * The single, shared reschedule modal — used by the timeline, the "Got a little
 * room?" nudge, and the Loose ends screen. The app finds the free slots; the
 * user picks one. Rendered once (in the Shell); opened via `openReschedule`.
 */
export function RescheduleHost({ now }: { now: Date }) {
  const [taskId, setTaskId] = useState<string | null>(null);
  const tasks = useAllTasks();
  const { slotsFor } = useScheduler();

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

  const close = () => setTaskId(null);
  const pick = (start: Date) => {
    rescheduleTask(task.id, start);
    close();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div
        className="absolute inset-0 bg-ink/20 backdrop-blur-[2px] animate-fade-in"
        onClick={close}
      />
      <div className="surface relative z-10 w-full max-w-md animate-scale-in rounded-b-none rounded-t-2xl p-5 sm:m-4 sm:rounded-2xl">
        <div className="mb-1 flex items-start justify-between">
          <h2 className="text-base font-semibold text-ink">Reschedule</h2>
          <button onClick={close} className="btn-ghost -mr-2 px-2 py-1.5" aria-label="Close">
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>
        <p className="text-sm font-medium text-ink">{task.title}</p>
        <p className="mb-4 text-xs text-muted">
          about {durationLabel(task.durationMinutes)} · pick a free time below
        </p>
        <SlotPicker slots={slotsFor(task, now, startOfDay(now))} onPick={pick} onCancel={close} />
      </div>
    </div>
  );
}
