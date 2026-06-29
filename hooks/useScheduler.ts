"use client";
import { useCallback } from "react";
import { useAllTasks, useSettings } from "./useDb";
import { proposeSlot } from "../lib/schedule";
import { findFreeSlots } from "../lib/freeSlots";
import { rescheduleTask } from "../lib/tasks";
import type { Importance } from "../lib/types";

/** The minimum a task needs to be (re)scheduled by the brain. */
export interface Schedulable {
  id: string;
  durationMinutes: number;
  importance: Importance;
}

/**
 * Shared "find a time" helper for the Inbox, Loose ends, and timeline UIs: it
 * asks the scheduling brain for a slot (respecting the day windows + existing
 * tasks) and, via `scheduleInto`, writes it. The app proposes; the user accepts.
 */
export function useScheduler() {
  const settings = useSettings();
  const tasks = useAllTasks();

  const propose = useCallback(
    (task: Schedulable, now: Date, earliestDay?: Date) =>
      proposeSlot({
        durationMinutes: task.durationMinutes,
        importance: task.importance,
        settings,
        tasks,
        now,
        earliestDay,
        excludeTaskId: task.id,
      }),
    [settings, tasks],
  );

  const scheduleInto = useCallback(
    async (task: Schedulable, now: Date, earliestDay?: Date): Promise<Date | null> => {
      const proposal = propose(task, now, earliestDay);
      if (!proposal) return null;
      await rescheduleTask(task.id, proposal.start);
      return proposal.start;
    },
    [propose],
  );

  // Candidate free slots the user can choose from (the app finds the openings;
  // the user decides which one).
  const slotsFor = useCallback(
    (task: Schedulable, now: Date, fromDay?: Date): Date[] =>
      findFreeSlots({
        durationMinutes: task.durationMinutes,
        settings,
        tasks,
        now,
        fromDay,
        excludeTaskId: task.id,
      }),
    [settings, tasks],
  );

  return { propose, scheduleInto, slotsFor };
}
