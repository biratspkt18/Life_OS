"use client";
import { useMemo, useRef, useState } from "react";
import type { Block, DayShape } from "../../lib/dayShape";
import { compactDuration } from "../../lib/dayShape";
import { IMPORTANCE_LABEL } from "../../lib/types";
import { addMinutes, durationLabel, format, minutesBetween, startOfDay, timeLabel } from "../../lib/dates";
import { setCompleted } from "../../lib/tasks";
import { openReschedule } from "../RescheduleModal";
import { ImportanceMark } from "../pickers";
import { CheckIcon, ClockIcon } from "../icons";

const TRACK_PX = 44; // thick, easy to read

/**
 * The day timeline: a proportional bar across the working window. Each activity
 * is its own segment, gaps are free time, with clock-style hour ticks + numbered
 * labels and a "now" marker. A task whose time has passed without being done
 * shows as a HOLLOW (outline) block — a calm "this slipped" cue.
 */
export function Timeline({
  shape,
  now,
  isToday,
}: {
  shape: DayShape;
  now: Date;
  isToday: boolean;
}) {
  const { windowStart, windowEnd, windowMinutes } = shape;

  // Every hour mark inside the window; `major` ones get a number below the bar.
  const hourMarks = useMemo(() => {
    if (windowMinutes <= 0) return [];
    const windowHours = windowMinutes / 60;
    const labelEvery = Math.max(1, Math.ceil(windowHours / 5)); // ~5 labels max
    const marks: { date: Date; pct: number; major: boolean }[] = [];
    let m = startOfDay(windowStart);
    while (m < windowStart) m = addMinutes(m, 60);
    let i = 0;
    while (m <= windowEnd) {
      const pct = (minutesBetween(windowStart, m) / windowMinutes) * 100;
      marks.push({ date: m, pct, major: i % labelEvery === 0 });
      m = addMinutes(m, 60);
      i += 1;
    }
    return marks;
  }, [windowStart, windowEnd, windowMinutes]);

  // Which segment is hovered/focused, for the detail popover. Keyed by item id
  // (stable across the 30s clock-tick re-renders that rebuild `shape.blocks`).
  const [activeId, setActiveId] = useState<string | null>(null);
  const active = activeId ? shape.blocks.find((b) => b.item.id === activeId) ?? null : null;

  // The popover is interactive, so keep it open while moving from segment to it:
  // close on a short delay, cancelled when the pointer enters either one.
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function show(id: string) {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
    setActiveId(id);
  }
  function scheduleClose() {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setActiveId(null), 220);
  }

  /** A daybook task that isn't done yet can be checked off or moved. */
  const actionable = (b: Block) => b.item.source === "daybook" && !b.item.completed;

  function markDone(b: Block) {
    setCompleted(b.item.id, true);
    setActiveId(null);
  }
  function reschedule(b: Block) {
    setActiveId(null);
    openReschedule(b.item.id);
  }

  if (!shape.enabled || windowMinutes <= 0) {
    return <p className="mb-6 text-sm text-muted">Day off — nothing scheduled.</p>;
  }

  const nowPct =
    isToday && now >= windowStart && now <= windowEnd
      ? (minutesBetween(windowStart, now) / windowMinutes) * 100
      : null;

  /** A daybook task whose time passed without being checked off. */
  const isUndone = (b: Block) =>
    isToday && now > b.end && !b.item.completed && b.item.source === "daybook";

  return (
    <div className="relative mb-6">
      {/* Track */}
      <div
        className="relative w-full overflow-hidden rounded-lg bg-paper-edge/70"
        style={{ height: TRACK_PX }}
      >
        {/* Hour gridlines */}
        {hourMarks.map((mk) => (
          <div
            key={mk.date.toISOString()}
            className={mk.major ? "absolute top-0 bottom-0 w-px bg-muted/25" : "absolute top-0 bottom-0 w-px bg-muted/10"}
            style={{ left: `${mk.pct}%` }}
          />
        ))}

        {/* Activity segments */}
        {shape.blocks.map((b) => (
          <button
            key={b.item.id}
            type="button"
            aria-label={segmentAria(b, isUndone(b))}
            onMouseEnter={() => show(b.item.id)}
            onMouseLeave={scheduleClose}
            onFocus={() => show(b.item.id)}
            onBlur={scheduleClose}
            className={[
              "absolute top-1 bottom-1 rounded-[3px] outline-none transition-[filter] focus-visible:ring-2 focus-visible:ring-ink/40 hover:brightness-95",
              activeId === b.item.id ? "brightness-95 ring-2 ring-ink/30" : "",
              blockClasses(b, isUndone(b)),
            ].join(" ")}
            style={{ left: `${b.topPct}%`, width: `calc(${b.heightPct}% - 2px)`, minWidth: 4 }}
          />
        ))}

        {/* Now marker */}
        {nowPct != null && (
          <div className="absolute top-0 bottom-0 z-10 w-0.5 bg-ink" style={{ left: `${nowPct}%` }}>
            <span className="absolute -left-[3px] -top-[3px] h-2 w-2 rounded-full bg-ink" />
          </div>
        )}
      </div>

      {/* Hover/focus detail popover — interactive for unfinished daybook tasks */}
      {active && (
        <div
          onMouseEnter={() => show(active.item.id)}
          onMouseLeave={scheduleClose}
          className="absolute z-30 w-max max-w-[17rem] rounded-xl border border-paper-edge bg-paper-card px-3.5 py-3 shadow-lift"
          style={{
            left: `${Math.min(88, Math.max(12, active.topPct + active.heightPct / 2))}%`,
            top: 0,
            transform: "translate(-50%, calc(-100% - 10px))",
          }}
        >
          <p className="truncate text-sm font-medium text-ink">{active.item.title}</p>
          <p className="mt-0.5 text-xs text-muted">
            {timeLabel(active.start)}
            {active.item.durationMinutes != null && (
              <>
                <span className="mx-1.5 text-muted-soft">·</span>
                {durationLabel(active.item.durationMinutes)}
              </>
            )}
          </p>
          <div className="mt-1 flex items-center gap-1.5 text-xs text-muted">
            {active.item.importance ? (
              <>
                <ImportanceMark importance={active.item.importance} />
                {IMPORTANCE_LABEL[active.item.importance]}
                {active.item.completed && <span className="text-muted-soft">· done</span>}
                {isUndone(active) && <span className="text-muted-soft">· not done</span>}
              </>
            ) : (
              "Google Calendar"
            )}
          </div>

          {actionable(active) && (
            <div className="mt-2.5 flex items-center gap-2 border-t border-paper-edge pt-2.5">
              <button
                onClick={() => markDone(active)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-sage/15 px-2.5 py-1.5 text-xs font-medium text-sage-soft transition-colors hover:bg-sage/25"
              >
                <CheckIcon className="h-3.5 w-3.5" /> Done
              </button>
              <button
                onClick={() => reschedule(active)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-accent-wash px-2.5 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent/15"
              >
                <ClockIcon className="h-3.5 w-3.5" /> Reschedule
              </button>
            </div>
          )}
        </div>
      )}

      {/* Hour labels */}
      <div className="relative mt-1.5 h-4">
        {hourMarks
          .filter((mk) => mk.major)
          .map((mk) => (
            <span
              key={mk.date.toISOString()}
              className="absolute text-[0.7rem] font-medium text-muted-soft"
              style={labelStyle(mk.pct)}
            >
              {hourLabel(mk.date)}
            </span>
          ))}
      </div>

      {/* Booked / free summary */}
      <div className="mt-1 flex items-center justify-between text-xs text-muted">
        <p>
          <span className="font-medium text-ink">{compactDuration(shape.bookedMinutes)}</span> booked
          <span className="mx-1.5 text-muted-soft">·</span>
          <span className="font-medium text-ink">{compactDuration(shape.freeMinutes)}</span> free
        </p>
        <p className="text-muted-soft">
          {timeLabel(windowStart)} – {timeLabel(windowEnd)}
        </p>
      </div>
    </div>
  );
}

/** Segment style by state: hollow if it slipped, faded if done, else filled. */
function blockClasses(b: Block, undone: boolean): string {
  // Opaque paper fill so a stacked block never bleeds through the outline.
  if (undone) return "border-2 border-accent/70 bg-paper-card";
  if (b.item.completed) return "bg-sage/50";
  if (b.item.source === "google") return "bg-gold/70";
  if (b.item.importance === "high") return "bg-accent";
  if (b.item.importance === "low") return "bg-accent/45";
  return "bg-accent/70";
}

/** Screen-reader description of a segment. */
function segmentAria(b: Block, undone: boolean): string {
  const dur = b.item.durationMinutes != null ? `, ${durationLabel(b.item.durationMinutes)}` : "";
  const imp = b.item.importance ? `, ${IMPORTANCE_LABEL[b.item.importance]}` : "";
  const state = undone ? ", not done" : b.item.completed ? ", done" : "";
  return `${b.item.title} at ${timeLabel(b.start)}${dur}${imp}${state}`;
}

/** Compact clock label: "8a", "12p", "5p". */
function hourLabel(d: Date): string {
  const h = format(d, "h");
  const ap = format(d, "a").toLowerCase().charAt(0);
  return `${h}${ap}`;
}

/** Keep edge labels from overflowing the track. */
function labelStyle(pct: number): React.CSSProperties {
  if (pct <= 1) return { left: 0 };
  if (pct >= 99) return { left: "100%", transform: "translateX(-100%)" };
  return { left: `${pct}%`, transform: "translateX(-50%)" };
}
