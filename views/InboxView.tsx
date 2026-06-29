"use client";
import { useState } from "react";
import { useInboxTasks } from "../hooks/useDb";
import { useScheduler } from "../hooks/useScheduler";
import { openCapture } from "../components/Capture";
import { dropTask } from "../lib/tasks";
import { durationLabel, whenLabel } from "../lib/dates";
import { ArrowRightIcon, TrashIcon } from "../components/icons";
import type { Task } from "../lib/types";

/**
 * Inbox — thoughts captured with no time yet. The brain proposes a slot when
 * you're ready; nothing is forced. Mirrors Cue's Inbox screen.
 */
export function InboxView({ now }: { now: Date }) {
  const tasks = useInboxTasks();
  const { scheduleInto } = useScheduler();
  const [flash, setFlash] = useState<string | null>(null);

  async function findTime(task: Task) {
    const start = await scheduleInto(task, now);
    setFlash(
      start
        ? `“${task.title}” scheduled for ${whenLabel(start)} ✓`
        : `No room found for “${task.title}” — try a shorter block.`,
    );
  }

  return (
    <section>
      <header className="mb-5">
        <h1 className="text-3xl font-bold tracking-tight text-ink">Inbox</h1>
        <p className="mt-1 text-[0.95rem] leading-relaxed text-muted">
          Thoughts you’ve captured. No times yet — that’s fine. Pick one when you’re ready and I’ll
          propose a slot.
        </p>
      </header>

      {flash && (
        <p className="mb-4 rounded-xl bg-accent-wash px-3.5 py-2.5 text-sm text-ink animate-fade-up">
          {flash}
        </p>
      )}

      <button
        onClick={() => openCapture({ inbox: true })}
        className="mb-4 w-full rounded-2xl border border-dashed border-paper-edge px-4 py-3 text-left text-sm font-medium text-accent transition-colors hover:border-accent/50 hover:bg-accent-wash/40"
      >
        + Jot another thought
      </button>

      {tasks.length === 0 ? (
        <div className="surface px-6 py-12 text-center">
          <p className="text-lg font-medium text-ink">Inbox zero ✦</p>
          <p className="mt-1 text-sm text-muted">Nothing waiting. Jot a thought whenever one lands.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {tasks.map((t) => (
            <div key={t.id} className="surface flex items-center gap-3 px-4 py-3.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[0.98rem] font-medium text-ink">{t.title}</p>
                <p className="mt-0.5 text-xs text-muted">{durationLabel(t.durationMinutes)}</p>
              </div>
              <button
                onClick={() => findTime(t)}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-accent-wash px-3 py-1.5 text-sm font-medium text-accent transition-colors hover:bg-accent/15"
              >
                propose a time <ArrowRightIcon className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => dropTask(t.id)}
                aria-label={`Delete “${t.title}”`}
                className="shrink-0 rounded-lg p-1.5 text-muted-soft transition-colors hover:text-ink"
              >
                <TrashIcon className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
