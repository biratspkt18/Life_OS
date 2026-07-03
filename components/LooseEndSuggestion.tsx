"use client";
import { useState } from "react";
import type { Suggestion } from "../hooks/useSuggestions";
import { dropTask } from "../lib/tasks";
import { dayLabel, durationLabel, format, timeLabel } from "../lib/dates";
import { ClockIcon, EditIcon, LooseEndsIcon, TrashIcon } from "./icons";
import { ActionMenu } from "./ActionMenu";
import { openReschedule } from "./RescheduleModal";
import { openEdit } from "./Capture";

/**
 * The gentle, one-at-a-time nudge on Today (Cue's "Got a little room?"). Shows a
 * single thing that genuinely fits your remaining free time — a slipped task or
 * an unscheduled to-do — with the soonest open slot it fits into. Saying yes
 * opens the free-slot picker. Acting surfaces the next one.
 */
export function LooseEndSuggestion({ suggestions }: { suggestions: Suggestion[]; now: Date }) {
  const [flash, setFlash] = useState<string | null>(null);

  if (suggestions.length === 0) return null;
  const { task: t, slot, kind } = suggestions[0];

  function letGo() {
    dropTask(t.id);
    setFlash(kind === "todo" ? "Removed." : "Let go. That’s allowed.");
    setTimeout(() => setFlash(null), 2600);
  }

  return (
    <section className="mt-8 rounded-2xl border border-gold/45 bg-gold-wash/55 p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-gold-soft">
          <LooseEndsIcon className="h-4 w-4" /> Got a little room?
        </p>
        <span className="shrink-0 rounded-full bg-gold/25 px-2 py-0.5 text-[0.7rem] font-semibold text-gold-soft">
          {suggestions.length} fit{suggestions.length === 1 ? "s" : ""}
        </span>
      </div>
      <p className="mt-1 text-sm text-muted">
        Here’s something that fits your free time today. Slot it in, or pass — no pressure.
      </p>

      {flash ? (
        <p className="mt-3 rounded-xl bg-paper-card px-3.5 py-3 text-sm text-ink shadow-card animate-fade-up">
          {flash}
        </p>
      ) : (
        <div className="mt-3 rounded-xl bg-paper-card p-4 shadow-card">
          <p className="text-[0.98rem] font-semibold text-ink">{t.title}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-muted">
            <span className="inline-flex items-center gap-1 font-medium text-accent">
              <ClockIcon className="h-3.5 w-3.5" /> fits at {timeLabel(slot)}
            </span>
            <span className="text-muted-soft">·</span>
            <span>about {durationLabel(t.durationMinutes)}</span>
            {kind === "loose-end" && t.scheduledStart && (
              <>
                <span className="text-muted-soft">·</span>
                <span>slipped {format(new Date(t.scheduledStart), "MMM d")}</span>
              </>
            )}
            {kind === "todo" && t.dueDate && (
              <>
                <span className="text-muted-soft">·</span>
                <span>due {dayLabel(new Date(t.dueDate))}</span>
              </>
            )}
          </p>

          <div className="mt-3 flex items-center justify-between gap-2">
            <button onClick={() => openReschedule(t.id)} className="btn-primary px-4 py-2 text-sm">
              Slot it in
            </button>
            <ActionMenu
              actions={[
                {
                  label: "Find a time",
                  icon: <ClockIcon className="h-4 w-4" />,
                  onClick: () => openReschedule(t.id),
                },
                {
                  label: "Edit",
                  icon: <EditIcon className="h-4 w-4" />,
                  onClick: () => openEdit(t.id),
                },
                {
                  label: "Delete",
                  icon: <TrashIcon className="h-4 w-4" />,
                  danger: true,
                  onClick: letGo,
                },
              ]}
            />
          </div>
        </div>
      )}
    </section>
  );
}
