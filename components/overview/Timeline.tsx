"use client";
import { useCallback, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { Block, DayShape } from "../../lib/dayShape";
import { compactDuration } from "../../lib/dayShape";
import { IMPORTANCE_LABEL } from "../../lib/types";
import { addMinutes, durationLabel, format, minutesBetween, timeLabel } from "../../lib/dates";
import { STEP_MIN, hourMarks as buildHourMarks, resolvePlacement } from "../../lib/placement";
import { dropTask, rescheduleTaskOptimistic, setCompleted } from "../../lib/tasks";
import { openReschedule } from "../RescheduleModal";
import { openEdit } from "../Capture";
import { ActionMenu } from "../ActionMenu";
import { ImportanceMark } from "../pickers";
import { CheckIcon, ClockIcon, EditIcon, TrashIcon } from "../icons";

const TRACK_PX = 44; // thick, easy to read

// Drag-to-schedule tuning (quantize/magnet maths live in lib/placement).
const LIFT_PX = 26; // how far an overlapped block rises above the bar to make room
const DRAG_LIFT_PX = 14; // how far the dragged block floats while it can't drop (conflict)
const DRAG_THRESHOLD_PX = 4; // pointer travel before a press becomes a drag (vs a hover/tap)
/** Springy settle shared by the lift, the magnet snap, and the drop. */
const SETTLE = { type: "spring", stiffness: 520, damping: 34 } as const;

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/**
 * Live drag state for a timeline block being repositioned by pointer. All times
 * are minutes from the window start, so overlap / snap math stays integer-simple.
 */
interface DragState {
  id: string;
  pointerId: number;
  durationMin: number;
  /** Where the block started (to detect a no-op drop and to spring back to). */
  originMin: number;
  /** pointer-minute minus start-minute at grab, so the block doesn't jump under the finger. */
  grabOffsetMin: number;
  /** Current proposed start (quantized / snapped). */
  startMin: number;
  /** The proposed slot overlaps another block — can't drop here. */
  conflict: boolean;
  /** Ids of the blocks the proposal currently overlaps (they lift out of the way). */
  liftedIds: string[];
  /** The magnet engaged this frame (snapped flush to a neighbour / edge). */
  snapped: boolean;
}

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
  const hourMarks = useMemo(
    () => buildHourMarks(windowStart, windowEnd, windowMinutes),
    [windowStart, windowEnd, windowMinutes],
  );

  // Which segment is hovered/focused, for the detail popover. Keyed by item id
  // (stable across the 30s clock-tick re-renders that rebuild `shape.blocks`).
  const [activeId, setActiveId] = useState<string | null>(null);
  const active = activeId ? shape.blocks.find((b) => b.item.id === activeId) ?? null : null;

  // The popover is interactive, so keep it open while moving from segment to it:
  // close on a short delay, cancelled when the pointer enters either one.
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // While the ⋯ menu (portaled outside the popover) is open, never close the
  // popover — otherwise moving the pointer to the menu would dismiss both.
  const menuOpen = useRef(false);
  function show(id: string) {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
    setActiveId(id);
  }
  function scheduleClose() {
    if (menuOpen.current) return;
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setActiveId(null), 220);
  }
  function onMenuOpenChange(open: boolean) {
    menuOpen.current = open;
    if (open && closeTimer.current) clearTimeout(closeTimer.current);
    else if (!open) scheduleClose();
  }

  function markDone(b: Block) {
    setCompleted(b.item.id, true);
    setActiveId(null);
  }
  function markUndone(b: Block) {
    setCompleted(b.item.id, false);
    setActiveId(null);
  }
  function reschedule(b: Block) {
    setActiveId(null);
    openReschedule(b.item.id);
  }
  function edit(b: Block) {
    setActiveId(null);
    openEdit(b.item.id);
  }
  function remove(b: Block) {
    setActiveId(null);
    dropTask(b.item.id);
  }

  // ── Drag-to-schedule ──────────────────────────────────────────────────────
  const reduceMotion = useReducedMotion();
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  // A press that hasn't yet moved past the threshold — kept in a ref so it
  // doesn't re-render, and so a tiny wobble stays a hover/tap, not a drag.
  const pending = useRef<{
    id: string;
    pointerId: number;
    x: number;
    y: number;
    durationMin: number;
    originMin: number;
    grabOffsetMin: number;
  } | null>(null);

  // Only your own, still-open tasks can be dragged — Google events are read-only
  // and a done block shouldn't silently un-complete itself when nudged.
  const canDrag = (b: Block) => b.item.source === "lifeos" && !b.item.completed;

  // Every block as integer minute spans, for overlap / snap checks.
  const blockMins = useMemo(
    () =>
      shape.blocks.map((b) => ({
        id: b.item.id,
        startMin: minutesBetween(windowStart, b.start),
        endMin: minutesBetween(windowStart, b.end),
      })),
    [shape.blocks, windowStart],
  );

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

  /**
   * Resolve a raw dragged start into a placed one — quantize, magnet-snap,
   * detect overlaps (shared maths in lib/placement).
   */
  const resolve = useCallback(
    (id: string, durationMin: number, rawStart: number) => {
      const r = resolvePlacement({
        others: blockMins.filter((o) => o.id !== id),
        windowMinutes,
        durationMin,
        rawStartMin: rawStart,
      });
      return { startMin: r.startMin, conflict: r.conflict, liftedIds: r.overlapIds, snapped: r.snapped };
    },
    [blockMins, windowMinutes],
  );

  function onBlockPointerDown(e: React.PointerEvent, b: Block) {
    if (drag || !canDrag(b)) return;
    const originMin = minutesBetween(windowStart, b.start);
    const durationMin = Math.max(STEP_MIN, minutesBetween(b.start, b.end));
    pending.current = {
      id: b.item.id,
      pointerId: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      durationMin,
      originMin,
      grabOffsetMin: pointerMinutes(e.clientX) - originMin,
    };
  }

  function onTrackPointerMove(e: React.PointerEvent) {
    const p = pending.current;
    if (!drag && p && e.pointerId === p.pointerId) {
      if (Math.hypot(e.clientX - p.x, e.clientY - p.y) < DRAG_THRESHOLD_PX) return;
      const el = trackRef.current;
      if (el) {
        try {
          el.setPointerCapture(p.pointerId);
        } catch {
          /* capture is best-effort */
        }
      }
      setActiveId(null); // drop the hover popover the instant a drag starts
      const r = resolve(p.id, p.durationMin, pointerMinutes(e.clientX) - p.grabOffsetMin);
      setDrag({
        id: p.id,
        pointerId: p.pointerId,
        durationMin: p.durationMin,
        originMin: p.originMin,
        grabOffsetMin: p.grabOffsetMin,
        ...r,
      });
      return;
    }
    if (drag && e.pointerId === drag.pointerId) {
      e.preventDefault();
      const r = resolve(drag.id, drag.durationMin, pointerMinutes(e.clientX) - drag.grabOffsetMin);
      setDrag((d) => (d ? { ...d, ...r } : d));
    }
  }

  function onTrackPointerUp(e: React.PointerEvent) {
    const d = drag;
    pending.current = null;
    if (!d || e.pointerId !== d.pointerId) return;
    const el = trackRef.current;
    if (el) {
      try {
        el.releasePointerCapture(d.pointerId);
      } catch {
        /* already released */
      }
    }
    // Commit only a real, conflict-free move. Keep the block pinned at the drop
    // spot (drag stays set) until the optimistic cache update lands, so it never
    // flickers back to the old slot; then clear.
    if (!d.conflict && d.startMin !== d.originMin) {
      rescheduleTaskOptimistic(d.id, addMinutes(windowStart, d.startMin))
        .catch(() => {
          /* rollback handled inside; block springs home when drag clears */
        })
        .finally(() => setDrag(null));
    } else {
      setDrag(null); // no-op or blocked → spring back to origin
    }
  }

  if (!shape.enabled || windowMinutes <= 0) {
    return <p className="mb-6 text-sm text-muted">Day off — nothing scheduled.</p>;
  }

  const nowPct =
    isToday && now >= windowStart && now <= windowEnd
      ? (minutesBetween(windowStart, now) / windowMinutes) * 100
      : null;

  /**
   * A Life OS task whose time has passed without being checked off — on today
   * *or* any earlier day (so yesterday's missed tasks show hollow in the
   * calendar too). Outlined, not filled, as a calm "this slipped" cue.
   */
  const isUndone = (b: Block) =>
    now > b.end && !b.item.completed && b.item.source === "lifeos";

  return (
    <div className="relative mb-6">
      {/* Track. The wrapper doesn't clip, so a block can lift *above* the bar
          while being dragged over; the backdrop layer below keeps the rounded
          fill + gridlines crisp. */}
      <div
        ref={trackRef}
        className="relative w-full"
        style={{ height: TRACK_PX, touchAction: drag ? "none" : undefined }}
        onPointerMove={onTrackPointerMove}
        onPointerUp={onTrackPointerUp}
        onPointerCancel={onTrackPointerUp}
      >
        {/* Rounded fill + hour gridlines + now marker (clipped to the bar). */}
        <div className="absolute inset-0 overflow-hidden rounded-lg bg-paper-edge/70">
          {hourMarks.map((mk) => (
            <div
              key={mk.date.toISOString()}
              className={mk.major ? "absolute top-0 bottom-0 w-px bg-muted/25" : "absolute top-0 bottom-0 w-px bg-muted/10"}
              style={{ left: `${mk.pct}%` }}
            />
          ))}
          {nowPct != null && (
            <div className="absolute top-0 bottom-0 z-10 w-0.5 bg-ink" style={{ left: `${nowPct}%` }}>
              <span className="absolute -left-[3px] -top-[3px] h-2 w-2 rounded-full bg-ink" />
            </div>
          )}
        </div>

        {/* Activity segments — draggable when they're your own open tasks. */}
        {shape.blocks.map((b) => {
          const dragging = drag?.id === b.item.id;
          const lifted = !dragging && (drag?.liftedIds.includes(b.item.id) ?? false);
          const leftPct = dragging ? (drag.startMin / windowMinutes) * 100 : b.topPct;
          const y = dragging ? (drag.conflict ? -DRAG_LIFT_PX : 0) : lifted ? -LIFT_PX : 0;
          const draggable = canDrag(b);
          return (
            <motion.button
              key={b.item.id}
              type="button"
              aria-label={segmentAria(b, isUndone(b))}
              onPointerDown={(e) => onBlockPointerDown(e, b)}
              onMouseEnter={() => !drag && show(b.item.id)}
              onMouseLeave={scheduleClose}
              onFocus={() => !drag && show(b.item.id)}
              onBlur={scheduleClose}
              className={[
                "absolute top-1 bottom-1 rounded-[3px] outline-none focus-visible:ring-2 focus-visible:ring-ink/40",
                dragging
                  ? drag.conflict
                    ? "z-30 shadow-lift ring-2 ring-danger/70 cursor-grabbing"
                    : "z-30 shadow-lift ring-2 ring-accent/80 cursor-grabbing"
                  : lifted
                    ? "z-20 shadow-lift ring-1 ring-ink/10"
                    : "transition-[filter] hover:brightness-95",
                !dragging && activeId === b.item.id ? "brightness-95 ring-2 ring-ink/30" : "",
                draggable && !dragging ? "cursor-grab touch-none select-none" : "",
                blockClasses(b, isUndone(b)),
              ].join(" ")}
              style={{ width: `calc(${b.heightPct}% - 2px)`, minWidth: 4 }}
              animate={{ left: `${leftPct}%`, y }}
              transition={{
                left: dragging && !drag.snapped ? { duration: 0 } : reduceMotion ? { duration: 0 } : SETTLE,
                y: reduceMotion ? { duration: 0 } : SETTLE,
                default: reduceMotion ? { duration: 0 } : SETTLE,
              }}
            />
          );
        })}

        {/* Live time readout that tracks the drag — the exact time it'll land on. */}
        <AnimatePresence>
          {drag && (
            <motion.div
              key="drag-time"
              aria-hidden
              className="pointer-events-none absolute z-40 -translate-x-1/2 whitespace-nowrap rounded-lg border border-paper-edge bg-paper-card px-2.5 py-1 text-center shadow-lift"
              style={{ left: `${clamp(((drag.startMin + drag.durationMin / 2) / windowMinutes) * 100, 13, 87)}%`, top: -DRAG_LIFT_PX }}
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
                {timeLabel(addMinutes(windowStart, drag.startMin + drag.durationMin))}
              </span>
              <span
                className={[
                  "mt-0.5 block text-[0.65rem] font-semibold uppercase tracking-wide",
                  drag.conflict ? "text-danger" : "text-accent",
                ].join(" ")}
              >
                {drag.conflict ? "Overlaps — won’t drop" : "Release to schedule"}
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Hover/focus detail popover — interactive for unfinished Life OS tasks */}
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
          {/* Content on the left; a pencil edit button (like the task rows) on
              the right for Life OS items. */}
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
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
            </div>

            {active.item.source === "lifeos" && (
              <div className="-mr-1 -mt-0.5 shrink-0">
                <ActionMenu
                  onOpenChange={onMenuOpenChange}
                  actions={
                    active.item.completed
                      ? [
                          {
                            label: "Mark not done",
                            icon: <CheckIcon className="h-4 w-4" />,
                            onClick: () => markUndone(active),
                          },
                          {
                            label: "Edit",
                            icon: <EditIcon className="h-4 w-4" />,
                            onClick: () => edit(active),
                          },
                          {
                            label: "Delete",
                            icon: <TrashIcon className="h-4 w-4" />,
                            danger: true,
                            onClick: () => remove(active),
                          },
                        ]
                      : [
                          {
                            label: "Mark done",
                            icon: <CheckIcon className="h-4 w-4" />,
                            onClick: () => markDone(active),
                          },
                          {
                            label: "Reschedule",
                            icon: <ClockIcon className="h-4 w-4" />,
                            onClick: () => reschedule(active),
                          },
                          {
                            label: "Edit",
                            icon: <EditIcon className="h-4 w-4" />,
                            onClick: () => edit(active),
                          },
                          {
                            label: "Delete",
                            icon: <TrashIcon className="h-4 w-4" />,
                            danger: true,
                            onClick: () => remove(active),
                          },
                        ]
                  }
                />
              </div>
            )}
          </div>
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

/** Segment style by state: hollow if it slipped, success-green if done, else filled. */
function blockClasses(b: Block, undone: boolean): string {
  // Opaque paper fill so a stacked block never bleeds through the outline.
  if (undone) return "border-2 border-accent/70 bg-paper-card";
  // Done → the app's success green (sage), at full strength so it reads clearly.
  if (b.item.completed) return "bg-sage";
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
