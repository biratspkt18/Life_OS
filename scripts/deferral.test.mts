import { computeDeferralDelta, type DeferralSnapshot } from "../lib/deferral";

import { harness } from "./_harness.mts";

const { check, done } = harness("deferral");

function snap(p: Partial<DeferralSnapshot> = {}): DeferralSnapshot {
  return {
    scheduledStart: p.scheduledStart ?? null,
    dueDate: p.dueDate ?? null,
    preferredDate: p.preferredDate ?? null,
    completed: p.completed ?? false,
  };
}

// Fixed local times on two adjacent days.
const mon9 = new Date(2026, 5, 22, 9, 0).toISOString();
const mon14 = new Date(2026, 5, 22, 14, 0).toISOString();
const tue9 = new Date(2026, 5, 23, 9, 0).toISOString();
const monLate = new Date(2026, 5, 22, 23, 59).toISOString();
const tueEarly = new Date(2026, 5, 23, 0, 1).toISOString();

{
  // 1. Moving a scheduled task to a different day counts.
  check(
    "cross-day reschedule → 1",
    computeDeferralDelta(snap({ scheduledStart: mon9 }), { scheduledStart: tue9 }) === 1,
  );

  // 2. Same-day time changes (timeline drags) never count.
  check(
    "same-day time change → 0",
    computeDeferralDelta(snap({ scheduledStart: mon9 }), { scheduledStart: mon14 }) === 0,
  );

  // 3. Scheduling for the first time is progress, not deferral.
  check(
    "null → start (first scheduling) → 0",
    computeDeferralDelta(snap(), { scheduledStart: tue9 }) === 0,
  );

  // 4. Unscheduling doesn't count.
  check(
    "start → null (unscheduling) → 0",
    computeDeferralDelta(snap({ scheduledStart: mon9 }), { scheduledStart: null }) === 0,
  );

  // 5. Moving a due date to another day counts (re-dated to-dos are the signal).
  check(
    "dueDate day change → 1",
    computeDeferralDelta(snap({ dueDate: mon9 }), { dueDate: tue9 }) === 1,
  );

  // 6. Preferred-date day change counts too.
  check(
    "preferredDate day change → 1",
    computeDeferralDelta(snap({ preferredDate: mon9 }), { preferredDate: tue9 }) === 1,
  );

  // 7. Setting a first due date / clearing one doesn't count.
  check("first dueDate → 0", computeDeferralDelta(snap(), { dueDate: tue9 }) === 0);
  check(
    "clearing dueDate → 0",
    computeDeferralDelta(snap({ dueDate: mon9 }), { dueDate: null }) === 0,
  );

  // 8. Two date fields moving in one patch still count once.
  check(
    "two fields moved in one patch → 1 (not 2)",
    computeDeferralDelta(snap({ scheduledStart: mon9, dueDate: mon9 }), {
      scheduledStart: tue9,
      dueDate: tue9,
    }) === 1,
  );

  // 9. Completed tasks never accrue deferrals (logging a done task's real time).
  check(
    "completed task moved → 0",
    computeDeferralDelta(snap({ scheduledStart: mon9, completed: true }), {
      scheduledStart: tue9,
    }) === 0,
  );

  // 10. A patch that completes while moving doesn't count either.
  check(
    "completing + moving in one patch → 0",
    computeDeferralDelta(snap({ scheduledStart: mon9 }), {
      scheduledStart: tue9,
      completed: true,
    }) === 0,
  );

  // 11. Un-completing while moving DOES count (it's active again and moved).
  check(
    "uncompleting + cross-day move → 1",
    computeDeferralDelta(snap({ scheduledStart: mon9 }), {
      scheduledStart: tue9,
      completed: false,
    }) === 1,
  );

  // 12. Minutes across midnight are different days.
  check(
    "23:59 → 00:01 next day → 1",
    computeDeferralDelta(snap({ scheduledStart: monLate }), { scheduledStart: tueEarly }) === 1,
  );

  // 13. A patch not touching dates never counts.
  check("title-only patch → 0", computeDeferralDelta(snap({ scheduledStart: mon9 }), {}) === 0);

  // 14. Direction-agnostic: moving *earlier* is still a move.
  check(
    "moving to an earlier day → 1",
    computeDeferralDelta(snap({ scheduledStart: tue9 }), { scheduledStart: mon9 }) === 1,
  );
}

done();
