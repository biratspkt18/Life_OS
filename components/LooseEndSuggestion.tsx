"use client";
import { useState } from "react";
import type { Task } from "../lib/types";
import { dropTask } from "../lib/tasks";
import { dayLabel, durationLabel, format } from "../lib/dates";
import { LooseEndsIcon } from "./icons";
import { openReschedule } from "./RescheduleModal";

/**
 * The gentle, one-at-a-time loose-end nudge on Today (Cue's "Got a little
 * room?"). Shows a single slipped task; saying yes opens the reschedule modal so
 * you choose a free time. Acting surfaces the next one. Only shown when there's
 * room left in the day.
 */
export function LooseEndSuggestion({ tasks }: { tasks: Task[]; now: Date }) {
  const [flash, setFlash] = useState<string | null>(null);

  if (tasks.length === 0) return null;
  const t = tasks[0];

  function letGo() {
    dropTask(t.id);
    setFlash("Let go. That’s allowed.");
    setTimeout(() => setFlash(null), 2600);
  }

  return (
    <section className="mt-8 rounded-2xl border border-gold/45 bg-gold-wash/55 p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-gold-soft">
          <LooseEndsIcon className="h-4 w-4" /> Got a little room?
        </p>
        <span className="shrink-0 rounded-full bg-gold/25 px-2 py-0.5 text-[0.7rem] font-semibold text-gold-soft">
          {tasks.length} from before
        </span>
      </div>
      <p className="mt-1 text-sm text-muted">
        Here’s one thing that slipped by. Want to take it on today? Totally fine to pass.
      </p>

      {flash ? (
        <p className="mt-3 rounded-xl bg-paper-card px-3.5 py-3 text-sm text-ink shadow-card animate-fade-up">
          {flash}
        </p>
      ) : (
        <div className="mt-3 rounded-xl bg-paper-card p-4 shadow-card">
          <p className="text-[0.98rem] font-semibold text-ink">{t.title}</p>
          {t.scheduledStart && (
            <p className="mt-0.5 text-xs text-muted">
              slipped {dayLabel(new Date(t.scheduledStart))} · {format(new Date(t.scheduledStart), "MMM d")} ·
              about {durationLabel(t.durationMinutes)}
            </p>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button onClick={() => openReschedule(t.id)} className="btn-primary px-4 py-2 text-sm">
              Yes
            </button>
            <button onClick={letGo} className="btn-ghost px-3 py-2 text-sm text-muted">
              let it go
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
