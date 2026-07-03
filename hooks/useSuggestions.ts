"use client";
import { useMemo } from "react";
import {
  useAllTasks,
  useExternalBusy,
  useInboxTasks,
  usePastUndoneTasks,
  useSettings,
} from "./useDb";
import { findFreeSlots } from "../lib/freeSlots";
import { startOfDay } from "../lib/dates";
import { IMPORTANCE_RANK, type Task } from "../lib/types";

export interface Suggestion {
  task: Task;
  /** The soonest open slot today this task actually fits into. */
  slot: Date;
  /** Where it came from, for the right copy in the UI. */
  kind: "loose-end" | "todo";
}

/**
 * The smallest opening we'll call "a little room". A task must fit into a free
 * block at least this long, so we never nudge you to cram something into a tiny
 * gap between back-to-back appointments (a 15-minute sliver isn't real room).
 */
const MIN_ROOM_MINUTES = 30;

/** Soonest of a task's due / preferred dates (Infinity when it has neither). */
function urgencyKey(t: Task): number {
  const due = t.dueDate ? new Date(t.dueDate).getTime() : Infinity;
  const pref = t.preferredDate ? new Date(t.preferredDate).getTime() : Infinity;
  return Math.min(due, pref);
}

/**
 * The "Got a little room?" candidates: slipped tasks and unscheduled to-dos that
 * genuinely fit into an open slot on today's calendar. Ordered smartly —
 *   1. by the soonest time they can actually be done today,
 *   2. then by urgency (due / preferred date),
 *   3. then by importance.
 * A task that doesn't fit anywhere today is left out entirely, so we never
 * suggest an hour-long task when there's only fifteen minutes free.
 */
export function useFittingSuggestions(now: Date, excludeId?: string): Suggestion[] {
  const settings = useSettings();
  const allTasks = useAllTasks();
  const looseEnds = usePastUndoneTasks(now);
  const todos = useInboxTasks();
  const today = startOfDay(now);
  const externalBusy = useExternalBusy(today, 1);
  const minuteKey = Math.floor(now.getTime() / 60000);

  return useMemo(() => {
    const kindById = new Map<string, "loose-end" | "todo">();
    for (const t of looseEnds) kindById.set(t.id, "loose-end");
    for (const t of todos) if (!kindById.has(t.id)) kindById.set(t.id, "todo");

    const candidates = [...looseEnds, ...todos].filter(
      (t, i, arr) => t.id !== excludeId && arr.findIndex((x) => x.id === t.id) === i,
    );

    const out: Suggestion[] = [];
    for (const task of candidates) {
      // Require a real opening: the task's own length, but never less than the
      // minimum "room" — so a 15-min task still needs a 30-min free block.
      const need = Math.max(task.durationMinutes, MIN_ROOM_MINUTES);
      const slots = findFreeSlots({
        durationMinutes: need,
        settings,
        tasks: allTasks,
        now,
        fromDay: today,
        days: 1,
        excludeTaskId: task.id,
        externalBusy,
        stepMinutes: 15,
        maxPerDay: 1,
        limit: 1,
      });
      if (slots.length > 0) {
        out.push({ task, slot: slots[0], kind: kindById.get(task.id) ?? "todo" });
      }
    }

    out.sort((a, b) => {
      const bySlot = a.slot.getTime() - b.slot.getTime();
      if (bySlot !== 0) return bySlot;
      const byUrgency = urgencyKey(a.task) - urgencyKey(b.task);
      if (byUrgency !== 0) return byUrgency;
      return IMPORTANCE_RANK[b.task.importance] - IMPORTANCE_RANK[a.task.importance];
    });

    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [looseEnds, todos, allTasks, settings, externalBusy, today.getTime(), excludeId, minuteKey]);
}
