"use client";
import type { Task } from "../lib/types";
import { useSettings } from "../hooks/useDb";
import { RescheduleRow } from "./RescheduleLoop";

/**
 * Loose ends — tasks whose time slipped by without being checked off. They drop
 * out of the day's timeline and gather here, each with one-tap re-homing (same
 * row the login reschedule loop uses). Calm, forgiving — never a guilt pile.
 */
export function LooseEnds({ tasks, now }: { tasks: Task[]; now: Date }) {
  const settings = useSettings();
  if (tasks.length === 0) return null;

  return (
    <section className="mt-8">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
          Loose ends
        </h2>
        <span className="text-xs text-muted-soft">
          {tasks.length} thing{tasks.length === 1 ? "" : "s"} slipped past
        </span>
      </div>
      <div className="space-y-2.5">
        {tasks.map((t) => (
          <RescheduleRow key={t.id} task={t} settings={settings} now={now} />
        ))}
      </div>
    </section>
  );
}
