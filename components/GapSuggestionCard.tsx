"use client";
import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { GapSuggestion } from "../hooks/useGapSuggestion";
import { ConflictError } from "../lib/tasks";
import { dayLabel, durationLabel, timeLabel } from "../lib/dates";
import { ENERGY_LABEL } from "../lib/types";
import { ClockIcon, LooseEndsIcon } from "./icons";
import { openReschedule } from "./RescheduleModal";

/**
 * The "Got a little room?" card on Today. Deterministic code found the gap and
 * the pick, so the card always renders instantly; when the AI's re-rank lands
 * (cached per gap), the pick and its one-line reason cross-fade in. Three
 * quiet actions: place it in the gap, see the runner-up, or wave it off.
 */
export function GapSuggestionCard({ s }: { s: GapSuggestion }) {
  const [placing, setPlacing] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  if (!s.gap || !s.pick) return null;
  const { gap, pick } = s;
  const t = pick.task;

  async function placeIt() {
    if (placing) return;
    setPlacing(true);
    try {
      await s.placeIt();
      // Success: the schedule change moves the gap, and the card retires itself.
    } catch (err) {
      if (err instanceof ConflictError) {
        // The gap moved under us (likely a fresh Google event). Hand over to
        // the picker instead of erroring.
        setFlash("That spot just got taken — pick a time instead.");
        setTimeout(() => {
          setFlash(null);
          openReschedule(t.id);
        }, 1200);
      } else {
        setFlash("Couldn’t place it just now. Nothing lost — try again in a moment.");
        setTimeout(() => setFlash(null), 2600);
      }
    } finally {
      setPlacing(false);
    }
  }

  return (
    <section className="mt-8 rounded-2xl border border-gold/45 bg-gold-wash/55 p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-gold-soft">
          <LooseEndsIcon className="h-4 w-4" /> Got a little room?
        </p>
        <span className="shrink-0 rounded-full bg-gold/25 px-2 py-0.5 text-[0.7rem] font-semibold text-gold-soft">
          free until {timeLabel(gap.end)}
        </span>
      </div>
      <p className="mt-1 text-sm text-muted">
        About {durationLabel(gap.usableMinutes)} open from {timeLabel(gap.usableStart)}. This
        would fit.
      </p>

      {flash ? (
        <p className="mt-3 rounded-xl bg-paper-card px-3.5 py-3 text-sm text-ink shadow-card animate-fade-up">
          {flash}
        </p>
      ) : (
        <div className="mt-3 rounded-xl bg-paper-card p-4 shadow-card">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
            >
              <p className="text-[0.98rem] font-semibold text-ink">{t.title}</p>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-muted">
                <span className="inline-flex items-center gap-1 font-medium text-accent">
                  <ClockIcon className="h-3.5 w-3.5" /> fits at {timeLabel(gap.usableStart)}
                </span>
                <span className="text-muted-soft">·</span>
                <span>about {durationLabel(t.durationMinutes)}</span>
                {t.tag && (
                  <>
                    <span className="text-muted-soft">·</span>
                    <span>{t.tag}</span>
                  </>
                )}
                {t.energy && (
                  <>
                    <span className="text-muted-soft">·</span>
                    <span>{ENERGY_LABEL[t.energy].toLowerCase()} energy</span>
                  </>
                )}
                {t.dueDate && (
                  <>
                    <span className="text-muted-soft">·</span>
                    <span>due {dayLabel(new Date(t.dueDate))}</span>
                  </>
                )}
              </p>
            </motion.div>
          </AnimatePresence>

          <AnimatePresence initial={false}>
            {pick.reason && (
              <motion.p
                key={pick.reason}
                initial={{ opacity: 0, y: 3 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25, ease: "easeOut" }}
                className="mt-2 text-[0.83rem] italic leading-relaxed text-muted"
              >
                {pick.reason}
              </motion.p>
            )}
          </AnimatePresence>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              onClick={placeIt}
              disabled={placing}
              className="btn-primary px-4 py-2 text-sm disabled:opacity-60"
            >
              {placing ? "Placing…" : "Place it"}
            </button>
            {s.hasAlternatives && (
              <button
                onClick={s.somethingElse}
                className="rounded-xl px-3 py-2 text-sm font-medium text-muted transition-colors hover:text-ink"
              >
                Something else
              </button>
            )}
            <button
              onClick={s.notNow}
              className="ml-auto rounded-xl px-3 py-2 text-sm text-muted-soft transition-colors hover:text-muted"
            >
              Not now
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
