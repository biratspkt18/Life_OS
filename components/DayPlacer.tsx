"use client";
import { useCallback, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useDayItems, useSettings } from "../hooks/useDb";
import { usePointerDrag } from "../hooks/usePointerDrag";
import { buildDayShape, type Block, type DayShape } from "../lib/dayShape";
import { effectiveWindowForDay } from "../lib/effectiveWindow";
import { useWindowException } from "../hooks/useWindowException";
import { addMinutes, atTime, format, minutesBetween, startOfDay, timeLabel } from "../lib/dates";
import {
  STEP_MIN,
  firstFreeStartMin,
  hourMarks as buildHourMarks,
  resolvePlacement,
  stepForDensity,
  suggestStartsMin,
  type Span,
} from "../lib/placement";

const TRACK_PX = 44;
const LIFT_PX = 26; // how far an overlapped block rises to make room
const DRAG_LIFT_PX = 14; // how far the ghost floats while it can't drop
const SETTLE = { type: "spring", stiffness: 520, damping: 34 } as const;

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/** The day's busy blocks as integer minute spans from the window start. */
function spansOf(shape: DayShape): Span[] {
  return shape.blocks.map((b) => ({
    id: b.item.id,
    startMin: minutesBetween(shape.windowStart, b.start),
    endMin: minutesBetween(shape.windowStart, b.end),
  }));
}

/** A free stretch of the day, and whether the pending task actually fits in it. */
interface FreeZone {
  startMin: number;
  endMin: number;
  fits: boolean;
}

/**
 * The open gaps between busy spans (past the placement floor). Drives the
 * purple "you can drop here" bands on the track — only gaps wide enough for the
 * task get `fits: true`, so purple always means "this task fits here".
 */
function freeZonesMin(
  spans: Span[],
  minStartMin: number,
  windowMinutes: number,
  durationMin: number,
): FreeZone[] {
  const busy = spans
    .map((s) => ({ start: Math.max(s.startMin, minStartMin), end: s.endMin }))
    .filter((s) => s.end > s.start)
    .sort((a, b) => a.start - b.start);
  // Merge overlaps so adjacent/stacked blocks read as one wall.
  const merged: { start: number; end: number }[] = [];
  for (const b of busy) {
    const last = merged[merged.length - 1];
    if (last && b.start <= last.end) last.end = Math.max(last.end, b.end);
    else merged.push({ ...b });
  }
  const zones: FreeZone[] = [];
  let cursor = minStartMin;
  for (const b of merged) {
    if (b.start > cursor) zones.push({ startMin: cursor, endMin: Math.min(b.start, windowMinutes), fits: false });
    cursor = Math.max(cursor, b.end);
  }
  if (cursor < windowMinutes) zones.push({ startMin: cursor, endMin: windowMinutes, fits: false });
  return zones
    .filter((z) => z.endMin > z.startMin)
    .map((z) => ({ ...z, fits: z.endMin - z.startMin >= durationMin }));
}

/** Placement floor: on today nothing lands before `now` (rounded up to the grid). */
function minStartFor(windowStart: Date, day: Date, now: Date): number {
  if (startOfDay(day).getTime() !== startOfDay(now).getTime()) return 0;
  return Math.max(0, Math.ceil(minutesBetween(windowStart, now) / STEP_MIN) * STEP_MIN);
}

/**
 * Earliest free start on `day` for a task of `durationMinutes` (never in the
 * past; `preferred` wins when it's free). Null = day off or nothing fits —
 * parents use this to seed the ghost so it never spawns on a conflict.
 */
export function useFirstFit(
  day: Date,
  durationMinutes: number,
  now: Date,
  excludeId?: string,
  preferred?: Date,
): Date | null {
  const settings = useSettings();
  const items = useDayItems(day);
  const { exception } = useWindowException();
  return useMemo(() => {
    const win = effectiveWindowForDay(settings, day, exception);
    if (!win.enabled) return null;
    const shape = buildDayShape(
      items.filter((i) => i.id !== excludeId),
      win,
      day,
      now,
      settings.defaultDurationMinutes,
    );
    if (shape.windowMinutes <= 0) return null;
    const min = firstFreeStartMin({
      others: spansOf(shape),
      windowMinutes: shape.windowMinutes,
      durationMin: Math.max(STEP_MIN, durationMinutes),
      minStartMin: minStartFor(shape.windowStart, day, now),
      preferredMin: preferred ? minutesBetween(shape.windowStart, preferred) : undefined,
    });
    return min == null ? null : addMinutes(shape.windowStart, min);
  }, [settings, items, day, now, durationMinutes, excludeId, preferred, exception]);
}

/** An exact-time entry that can't be placed (kept local so the red ghost can show why). */
interface TypedInvalid {
  text: string;
  startMin: number;
  reason: "past" | "overlap" | "outside";
}

/**
 * The drag-to-place scheduling bar: the chosen day rendered exactly like the
 * Today timeline (existing tasks + Google events read-only), plus one draggable
 * ghost block of the pending task's duration. Drag it through the day — a live
 * readout shows the exact start → end time; free gaps let it settle in,
 * conflicts lift it with a red ring and won't accept the drop. Controlled:
 * the parent owns `value`; `onRelease` fires only when a *drag* ends on a free
 * spot, so the reschedule modal can commit instantly while Capture waits for
 * its Add button. Suggestion chips and an exact-time input are the secondary,
 * non-drag paths.
 */
export function DayPlacer({
  day,
  durationMinutes,
  now,
  value,
  onChange,
  onRelease,
  excludeId,
  disabled,
  ariaLabel,
  showSuggestions = true,
  showExactTime = true,
}: {
  day: Date;
  durationMinutes: number;
  now: Date;
  value: Date | null;
  onChange: (start: Date) => void;
  onRelease?: (start: Date) => void;
  excludeId?: string;
  disabled?: boolean;
  ariaLabel?: string;
  showSuggestions?: boolean;
  showExactTime?: boolean;
}) {
  const settings = useSettings();
  const items = useDayItems(day);
  const reduceMotion = useReducedMotion();

  const { exception } = useWindowException();
  const win = effectiveWindowForDay(settings, day, exception);
  const shape = useMemo(
    () =>
      buildDayShape(
        items.filter((i) => i.id !== excludeId),
        win,
        day,
        now,
        settings.defaultDurationMinutes,
      ),
    [items, win, day, now, settings.defaultDurationMinutes, excludeId],
  );
  const { windowStart, windowEnd, windowMinutes } = shape;
  const durationMin = Math.max(STEP_MIN, durationMinutes);
  const maxStart = Math.max(0, windowMinutes - durationMin);
  const minStart = minStartFor(windowStart, day, now);

  const spans = useMemo(() => spansOf(shape), [shape]);
  const marks = useMemo(
    () => buildHourMarks(windowStart, windowEnd, windowMinutes),
    [windowStart, windowEnd, windowMinutes],
  );
  const noRoom = useMemo(
    () =>
      firstFreeStartMin({ others: spans, windowMinutes, durationMin, minStartMin: minStart }) == null,
    [spans, windowMinutes, durationMin, minStart],
  );
  const suggestions = useMemo(
    () =>
      suggestStartsMin({
        others: spans,
        windowMinutes,
        durationMin,
        minStartMin: minStart,
        windowStartMinOfDay: windowStart.getHours() * 60 + windowStart.getMinutes(),
      }),
    [spans, windowMinutes, durationMin, minStart, windowStart],
  );
  // Purple "open time" bands: gaps the task fits into. Recomputed as duration
  // or the day's blocks change, so the signposting always reflects this task.
  const freeZones = useMemo(
    () => freeZonesMin(spans, minStart, windowMinutes, durationMin),
    [spans, minStart, windowMinutes, durationMin],
  );

  const trackRef = useRef<HTMLDivElement | null>(null);
  const [typed, setTyped] = useState<TypedInvalid | null>(null);

  /** Pointer x → minutes from window start (clamped to the track). */
  const pointerMinutes = useCallback(
    (clientX: number) => {
      const el = trackRef.current;
      if (!el) return 0;
      const r = el.getBoundingClientRect();
      return clamp((clientX - r.left) / r.width, 0, 1) * windowMinutes;
    },
    [windowMinutes],
  );

  /** Snap a raw dragged start into a placement (density step chosen per drag). */
  const resolve = useCallback(
    (rawStart: number, payload: { step: number }) =>
      resolvePlacement({
        others: spans,
        windowMinutes,
        durationMin,
        rawStartMin: rawStart,
        stepMin: payload.step,
        minStartMin: minStart,
      }),
    [spans, windowMinutes, durationMin, minStart],
  );

  // The shared pointer-drag machine (also drives the Today timeline).
  const { drag, begin, trackHandlers, reset } = usePointerDrag<{ step: number }>({
    trackRef,
    toMinutes: pointerMinutes,
    resolve,
    commit: (d) => {
      if (d.conflict) return; // blocked → springs back to the resting spot
      setTyped(null);
      const start = addMinutes(windowStart, d.startMin);
      onChange(start);
      onRelease?.(start);
    },
  });

  // A day switch invalidates any in-flight drag or rejected typed time —
  // reset during render (the sanctioned derive-from-props pattern).
  const [seenDay, setSeenDay] = useState(day.toDateString());
  if (day.toDateString() !== seenDay) {
    setSeenDay(day.toDateString());
    setTyped(null);
    reset();
  }

  // Where the ghost sits right now, in window minutes (null = nothing to show).
  const valueMin = value ? minutesBetween(windowStart, value) : null;
  const restMin = typed ? typed.startMin : valueMin;
  const ghostMin = drag ? drag.startMin : restMin;
  const ghostConflict = drag ? drag.conflict : typed != null;
  const liftedIds = drag?.overlapIds ?? [];

  function place(startMin: number) {
    setTyped(null);
    onChange(addMinutes(windowStart, startMin));
  }

  /** Density-quantized step for the current track width. */
  function dragStep(): number {
    const rect = trackRef.current?.getBoundingClientRect();
    return rect ? stepForDensity(rect.width / windowMinutes) : STEP_MIN;
  }

  // Grab the ghost where it sits and drag from there (threshold guards a tap).
  function onGhostPointerDown(e: React.PointerEvent) {
    if (disabled || drag || ghostMin == null) return;
    e.stopPropagation(); // don't also trigger the track's click-to-place
    begin(e, { step: dragStep() }, ghostMin);
  }

  // Click-to-place: tapping an empty spot on the bar jumps the ghost's start to
  // the clicked minute (snapped to a valid slot), then it follows the pointer
  // and commits on release — no dragging required.
  function onTrackPointerDown(e: React.PointerEvent) {
    if (disabled || drag || ghostMin == null || e.button !== 0) return;
    begin(e, { step: dragStep() }, pointerMinutes(e.clientX), true);
  }

  /** Arrow-key nudge to the next free spot in `dir`. */
  function nudge(dir: 1 | -1) {
    if (ghostMin == null || drag) return;
    const step = STEP_MIN;
    let c = ghostMin + dir * step;
    while (c >= minStart && c <= maxStart) {
      const r = resolvePlacement({
        others: spans,
        windowMinutes,
        durationMin,
        rawStartMin: c,
        stepMin: step,
        minStartMin: minStart,
      });
      const moved = dir > 0 ? r.startMin > ghostMin : r.startMin < ghostMin;
      if (!r.conflict && moved) {
        place(r.startMin);
        return;
      }
      c += dir * step;
    }
  }

  function onGhostKeyDown(e: React.KeyboardEvent) {
    if (disabled) return;
    if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
      e.preventDefault();
      nudge(-1);
    } else if (e.key === "ArrowRight" || e.key === "ArrowUp") {
      e.preventDefault();
      nudge(1);
    } else if (e.key === "Enter" && value && !typed) {
      e.preventDefault();
      onRelease?.(value);
    }
  }

  function onTimeInput(e: React.ChangeEvent<HTMLInputElement>) {
    const text = e.target.value;
    if (!text) {
      setTyped(null);
      return;
    }
    const raw = minutesBetween(windowStart, atTime(day, text));
    if (raw < 0 || raw > maxStart) {
      setTyped({ text, startMin: clamp(raw, 0, maxStart), reason: "outside" });
      return;
    }
    if (raw < minStart) {
      setTyped({ text, startMin: raw, reason: "past" });
      return;
    }
    // Exact minute — no quantize, no magnet; only the conflict + past rules.
    const r = resolvePlacement({
      others: spans,
      windowMinutes,
      durationMin,
      rawStartMin: raw,
      stepMin: 1,
      snapMin: 0,
      minStartMin: minStart,
    });
    if (r.conflict) {
      setTyped({ text, startMin: r.startMin, reason: "overlap" });
      return;
    }
    place(r.startMin);
  }

  if (!win.enabled || windowMinutes <= 0) {
    return (
      <p className="rounded-2xl border border-dashed border-paper-edge bg-paper-deep/30 px-4 py-6 text-center text-sm text-muted">
        Day off — pick another day.
      </p>
    );
  }

  const nowPct =
    now >= windowStart && now <= windowEnd
      ? (minutesBetween(windowStart, now) / windowMinutes) * 100
      : null;
  const ghostEnd = ghostMin != null ? addMinutes(windowStart, ghostMin + durationMin) : null;
  const typedNote =
    typed?.reason === "past"
      ? "That time has already passed today."
      : typed?.reason === "outside"
        ? `Outside your day window (${timeLabel(windowStart)} – ${timeLabel(windowEnd)}).`
        : typed
          ? "That time overlaps something — drag the block or pick another."
          : null;

  return (
    <div className={disabled ? "pointer-events-none opacity-60" : undefined}>
      {/* Track — the wrapper doesn't clip, so blocks can lift above the bar. */}
      <div
        ref={trackRef}
        className="relative w-full"
        style={{ height: TRACK_PX, touchAction: drag ? "none" : undefined, marginTop: DRAG_LIFT_PX + 14 }}
        onPointerDown={onTrackPointerDown}
        {...trackHandlers}
      >
        {/* Rounded fill + hour gridlines + past shade + now marker (clipped). */}
        <div className="absolute inset-0 overflow-hidden rounded-lg bg-paper-edge/70">
          {marks.map((mk) => (
            <div
              key={mk.date.toISOString()}
              className={
                mk.major
                  ? "absolute top-0 bottom-0 w-px bg-muted/25"
                  : "absolute top-0 bottom-0 w-px bg-muted/10"
              }
              style={{ left: `${mk.pct}%` }}
            />
          ))}
          {nowPct != null && (
            <>
              <div className="absolute inset-y-0 left-0 bg-ink/10" style={{ width: `${nowPct}%` }} />
              <div className="absolute top-0 bottom-0 z-10 w-0.5 bg-ink" style={{ left: `${nowPct}%` }}>
                <span className="absolute -left-[3px] -top-[3px] h-2 w-2 rounded-full bg-ink" />
              </div>
            </>
          )}
        </div>

        {/* Open-time bands: purple where THIS task fits — "you can drop here". */}
        {freeZones
          .filter((z) => z.fits)
          .map((z) => (
            <div
              key={`free-${z.startMin}`}
              aria-hidden
              className="absolute top-1 bottom-1 rounded-[3px] bg-accent/[0.12] ring-1 ring-inset ring-accent/25"
              style={{
                left: `${(z.startMin / windowMinutes) * 100}%`,
                width: `calc(${((z.endMin - z.startMin) / windowMinutes) * 100}% - 1px)`,
              }}
            />
          ))}

        {/* Existing blocks — read-only context; they lift out of the ghost's
            way, and turn red as the walls you're colliding with mid-drag. */}
        {shape.blocks.map((b) => {
          const lifted = liftedIds.includes(b.item.id);
          const colliding = !!drag?.conflict && lifted;
          return (
            <motion.div
              key={b.item.id}
              aria-hidden
              title={b.item.title}
              className={[
                "absolute top-1 bottom-1 rounded-[3px]",
                colliding
                  ? "z-20 shadow-lift ring-2 ring-danger/60"
                  : lifted
                    ? "z-20 shadow-lift ring-1 ring-ink/10"
                    : "",
                colliding ? "bg-danger/70" : segClasses(b),
              ].join(" ")}
              style={{ left: `${b.startPct}%`, width: `calc(${b.lengthPct}% - 2px)`, minWidth: 4 }}
              animate={{ y: lifted ? -LIFT_PX : 0 }}
              transition={reduceMotion ? { duration: 0 } : SETTLE}
            />
          );
        })}

        {/* The ghost — the task being placed. */}
        {ghostMin != null && (
          <motion.button
            type="button"
            role="slider"
            aria-label={ariaLabel ?? "Start time"}
            aria-valuemin={minStart}
            aria-valuemax={maxStart}
            aria-valuenow={ghostMin}
            aria-valuetext={
              ghostEnd ? `${timeLabel(addMinutes(windowStart, ghostMin))} to ${timeLabel(ghostEnd)}` : undefined
            }
            onPointerDown={onGhostPointerDown}
            onKeyDown={onGhostKeyDown}
            className={[
              "absolute top-1 bottom-1 z-30 rounded-[3px] outline-none focus-visible:ring-2 focus-visible:ring-ink/40",
              "cursor-grab touch-none select-none",
              ghostConflict
                ? "bg-danger/80 shadow-lift ring-2 ring-danger/70"
                : drag
                  ? "bg-accent shadow-lift ring-2 ring-accent/80 cursor-grabbing"
                  : "bg-accent shadow-lift ring-2 ring-accent/80",
            ].join(" ")}
            style={{ width: `calc(${(durationMin / windowMinutes) * 100}% - 2px)`, minWidth: 6 }}
            animate={{ left: `${(ghostMin / windowMinutes) * 100}%`, y: ghostConflict ? -DRAG_LIFT_PX : 0 }}
            transition={{
              left: drag && !drag.snapped ? { duration: 0 } : reduceMotion ? { duration: 0 } : SETTLE,
              y: reduceMotion ? { duration: 0 } : SETTLE,
              default: reduceMotion ? { duration: 0 } : SETTLE,
            }}
          >
            {/* Grip — signals "this is the block you drag". */}
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 flex items-center justify-center gap-[3px] opacity-80"
            >
              <span className="h-2.5 w-[2px] rounded-full bg-white/80" />
              <span className="h-2.5 w-[2px] rounded-full bg-white/80" />
              <span className="h-2.5 w-[2px] rounded-full bg-white/80" />
            </span>
          </motion.button>
        )}

        {/* Live readout that tracks the drag — the exact time it'll land on. */}
        <AnimatePresence>
          {drag && (
            <motion.div
              key="placer-time"
              aria-hidden
              className="pointer-events-none absolute z-40 -translate-x-1/2 whitespace-nowrap rounded-lg border border-paper-edge bg-paper-card px-2.5 py-1 text-center shadow-lift"
              style={{
                left: `${clamp(((drag.startMin + durationMin / 2) / windowMinutes) * 100, 13, 87)}%`,
                top: -DRAG_LIFT_PX - 12,
              }}
              initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 6, scale: 0.92 }}
              animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 6, scale: 0.92 }}
              transition={{ transform: reduceMotion ? { duration: 0 } : SETTLE, left: { duration: 0 } }}
            >
              <span className="text-sm font-semibold tabular-nums text-ink">
                {timeLabel(addMinutes(windowStart, drag.startMin))}
              </span>
              <span className="mx-1 text-muted-soft">→</span>
              <span className="text-sm tabular-nums text-muted">
                {timeLabel(addMinutes(windowStart, drag.startMin + durationMin))}
              </span>
              <span
                className={[
                  "mt-0.5 block text-[0.65rem] font-semibold uppercase tracking-wide",
                  drag.conflict ? "text-danger" : "text-accent",
                ].join(" ")}
              >
                {drag.conflict
                  ? "Overlaps — won’t drop"
                  : onRelease
                    ? "Release to schedule"
                    : "Release to set the time"}
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Hour labels */}
      <div className="relative mt-1.5 h-4">
        {marks
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

      {/* Signpost the interaction — the bar isn't obviously draggable on its own. */}
      {!noRoom && !typed && ghostMin != null && (
        <p className="mt-2 text-xs text-muted">
          Tap or drag to an{" "}
          <span className="font-medium text-accent">open slot</span>
          {showSuggestions ? ", or tap a suggested time below" : ""}.
        </p>
      )}
      {typedNote && <p className="mt-2 text-xs font-medium text-danger">{typedNote}</p>}
      {noRoom && (
        <p className="mt-2 rounded-xl border border-dashed border-paper-edge bg-paper-deep/30 px-3 py-2.5 text-center text-xs text-muted">
          No open time on this day — try another day.
        </p>
      )}

      {/* Secondary, non-drag paths: quick free times + an exact minute. */}
      {!noRoom && (showSuggestions || showExactTime) && (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          {showSuggestions &&
            suggestions.map((m) => {
              const s = addMinutes(windowStart, m);
              const on = !drag && !typed && valueMin === m;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => place(m)}
                  aria-pressed={on}
                  className={[
                    "rounded-xl border px-2.5 py-1.5 text-xs font-medium tabular-nums outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent/40",
                    on
                      ? "border-accent bg-accent text-white shadow-accent"
                      : "border-paper-edge bg-paper-card text-ink hover:border-accent/50 hover:bg-accent-wash",
                  ].join(" ")}
                >
                  {timeLabel(s)}
                </button>
              );
            })}
          {showExactTime && (
            <label className="ml-auto flex items-center gap-1.5 text-xs text-muted">
              Exact time
              <input
                type="time"
                value={typed ? typed.text : value ? format(value, "HH:mm") : ""}
                onChange={onTimeInput}
                className={[
                  "rounded-lg border bg-paper-card px-2 py-1 text-xs font-medium tabular-nums text-ink outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
                  typed ? "border-danger/70" : "border-paper-edge",
                ].join(" ")}
              />
            </label>
          )}
        </div>
      )}
    </div>
  );
}

/** Same palette as the Timeline's segments, so the bar reads as "your day". */
function segClasses(b: Block): string {
  if (b.item.completed) return "bg-sage";
  if (b.item.source === "google") return "bg-gold/70";
  if (b.item.importance === "high") return "bg-accent/60";
  if (b.item.importance === "low") return "bg-accent/30";
  return "bg-accent/50";
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
