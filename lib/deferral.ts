import { isSameDay } from "./dates";

/**
 * The single definition of "the user moved this task to another day".
 * `patchTask` adds the returned delta to the persisted counter; nothing on
 * the client can set the count directly.
 *
 * Counts (+1, at most once per patch, direction-agnostic — the surfaced copy
 * is the neutral "moved N times", so churn in either direction is the signal):
 *   - scheduledStart changing from one calendar day to another
 *   - dueDate or preferredDate changing from one calendar day to another
 *
 * Never counts:
 *   - same-day time changes (dragging a block along the day bar)
 *   - scheduling for the first time (null → date is progress, not deferral)
 *   - unscheduling, or clearing / first-setting a due/preferred date
 *   - anything on a completed task, or a patch that completes the task
 *     (logging a done task at its real time must not read as a deferral)
 *
 * "Passed deadline" is a deliberately separate signal — computed from
 * dueDate vs completedAt elsewhere, never mixed into this counter.
 *
 * Day comparison uses server-local time (`isSameDay`). Fine while the app
 * and its users share a timezone (self-hosted); revisit here first if the
 * server ever moves to UTC hosting.
 */

export interface DeferralSnapshot {
  scheduledStart: string | null;
  dueDate: string | null;
  preferredDate: string | null;
  completed: boolean;
}

export type DeferralPatch = Partial<
  Pick<DeferralSnapshot, "scheduledStart" | "dueDate" | "preferredDate" | "completed">
>;

const DATE_FIELDS = ["scheduledStart", "dueDate", "preferredDate"] as const;

function movedDay(from: string | null, to: string | null | undefined): boolean {
  if (to === undefined || to === null || from === null) return false;
  return !isSameDay(new Date(from), new Date(to));
}

export function computeDeferralDelta(
  existing: DeferralSnapshot,
  patch: DeferralPatch,
): 0 | 1 {
  if (existing.completed || patch.completed === true) return 0;
  for (const field of DATE_FIELDS) {
    if (movedDay(existing[field], patch[field])) return 1;
  }
  return 0;
}
