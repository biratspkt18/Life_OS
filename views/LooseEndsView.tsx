"use client";
import { usePastUndoneTasks } from "../hooks/useDb";
import { dropTask, setCompleted } from "../lib/tasks";
import { dayLabel, durationLabel, format } from "../lib/dates";
import { Checkbox } from "../components/Checkbox";
import { openReschedule } from "../components/RescheduleModal";

/**
 * Loose ends — past tasks that slipped by. No guilt: check off what's done,
 * re-home what still matters, let the rest go. The full list lives here (the
 * Today screen only nudges one at a time). Mirrors Cue's Loose ends screen.
 */
export function LooseEndsView({ now }: { now: Date }) {
  const tasks = usePastUndoneTasks(now);

  return (
    <section>
      <header className="mb-5">
        <h1 className="text-3xl font-bold tracking-tight text-ink">Loose ends</h1>
        <p className="mt-1 text-[0.95rem] leading-relaxed text-muted">
          Tasks from the past that didn’t happen. No guilt here — pick what still matters and let the
          rest go.
        </p>
      </header>

      {tasks.length === 0 ? (
        <div className="surface px-6 py-12 text-center">
          <p className="text-lg font-medium text-ink">All caught up ✦</p>
          <p className="mt-1 text-sm text-muted">Nothing slipped past. Nice.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {tasks.map((t) => (
            <div
              key={t.id}
              className="flex items-center gap-3.5 rounded-2xl border border-gold/40 bg-gold-wash/50 px-4 py-3.5"
            >
              <Checkbox
                checked={false}
                onChange={() => setCompleted(t.id, true)}
                label={`Mark “${t.title}” done`}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[0.98rem] font-medium text-ink">{t.title}</p>
                <p className="mt-0.5 text-xs text-muted">
                  {t.scheduledStart && (
                    <>
                      was due {dayLabel(new Date(t.scheduledStart))} ·{" "}
                      {format(new Date(t.scheduledStart), "MMM d")}
                      <span className="mx-1.5 text-muted-soft">·</span>
                    </>
                  )}
                  ~{durationLabel(t.durationMinutes)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  onClick={() => openReschedule(t.id)}
                  className="rounded-xl bg-accent px-3 py-1.5 text-sm font-medium text-white shadow-accent transition-colors hover:bg-accent-soft"
                >
                  find a time
                </button>
                <button
                  onClick={() => dropTask(t.id)}
                  className="rounded-xl px-2.5 py-1.5 text-sm text-muted-soft transition-colors hover:text-ink"
                >
                  let it go
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
