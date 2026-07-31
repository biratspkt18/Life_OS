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
import { ActionMenu, ContextMenu, type MenuAction } from "../ActionMenu";
import { ImportanceMark } from "../pickers";
import { CheckIcon, ClockIcon, EditIcon, TrashIcon } from "../icons";
import { usePointerDrag } from "../../hooks/usePointerDrag";

const TRACK_PX = 44; // thick, easy to read

// Drag-to-schedule tuning (quantize/magnet maths live in lib/placement).
const LIFT_PX = 26; // how far an overlapped block rises above the bar to make room
const DRAG_LIFT_PX = 14; // how far the dragged block floats while it can't drop (conflict)
/** Springy settle shared by the lift, the magnet snap, and the drop. */
const SETTLE = { type: "spring", stiffness: 520, damping: 34 } as const;

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/** What the drag carries for a timeline block (the rest lives in the shared hook). */
interface BlockDrag {
  id: string;
  durationMin: number;
  /** Where the block started — to detect a no-op drop and to spring back to. */
  originMin: number;
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
  onOutsideCommit,
}: {
  shape: DayShape;
  now: Date;
  isToday: boolean;
  /**
   * Fired when a drag commits a task outside the working window (into the
   * extended before/after zone) — lets Today offer "start earlier / end
   * later?" without the Timeline knowing about prompts.
   */
  onOutsideCommit?: (info: { side: "start" | "end"; taskStart: Date; taskEnd: Date }) => void;
}) {
  const { windowStart, windowEnd, windowMinutes, barStart, barEnd, barMinutes } = shape;

  // Every hour mark along the rendered bar; `major` ones get a number below.
  const hourMarks = useMemo(
    () => buildHourMarks(barStart, barEnd, barMinutes),
    [barStart, barEnd, barMinutes],
  );

  // The working window's position along the bar, for the outside-hours zones.
  const windowStartPct = barMinutes > 0 ? (minutesBetween(barStart, windowStart) / barMinutes) * 100 : 0;
  const windowEndPct = barMinutes > 0 ? (minutesBetween(barStart, windowEnd) / barMinutes) * 100 : 100;

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
    closeTimer.current = setTimeout(() => setActiveId(null), 320);
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

  /** The same action set everywhere a block's menu appears (⋯ and right-click). */
  function blockActions(b: Block): MenuAction[] {
    if (b.item.completed) {
      return [
        { label: "Mark not done", icon: <CheckIcon className="h-4 w-4" />, onClick: () => markUndone(b) },
        { label: "Edit", icon: <EditIcon className="h-4 w-4" />, onClick: () => edit(b) },
        { label: "Delete", icon: <TrashIcon className="h-4 w-4" />, danger: true, onClick: () => remove(b) },
      ];
    }
    return [
      { label: "Mark done", icon: <CheckIcon className="h-4 w-4" />, onClick: () => markDone(b) },
      { label: "Reschedule", icon: <ClockIcon className="h-4 w-4" />, onClick: () => reschedule(b) },
      { label: "Edit", icon: <EditIcon className="h-4 w-4" />, onClick: () => edit(b) },
      { label: "Delete", icon: <TrashIcon className="h-4 w-4" />, danger: true, onClick: () => remove(b) },
    ];
  }

  // Right-click menu: same actions as the ⋯ menu, opened at the cursor.
  const [ctxMenu, setCtxMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const ctxBlock = ctxMenu ? shape.blocks.find((b) => b.item.id === ctxMenu.id) ?? null : null;
  function onBlockContextMenu(e: React.MouseEvent, b: Block) {
    if (b.item.source !== "lifeos" || drag) return; // Google events have no actions
    e.preventDefault();
    setCtxMenu({ id: b.item.id, x: e.clientX, y: e.clientY });
  }

  // ── Drag-to-schedule ──────────────────────────────────────────────────────
  const reduceMotion = useReducedMotion();
  const trackRef = useRef<HTMLDivElement | null>(null);

  // Only your own, still-open tasks can be dragged — Google events are read-only
  // and a done block shouldn't silently un-complete itself when nudged.
  const canDrag = (b: Block) => b.item.source === "lifeos" && !b.item.completed;

  // Every block as integer minute spans (bar-space), for overlap / snap checks.
  const blockMins = useMemo(
    () =>
      shape.blocks.map((b) => ({
        id: b.item.id,
        startMin: minutesBetween(barStart, b.start),
        endMin: minutesBetween(barStart, b.end),
      })),
    [shape.blocks, barStart],
  );

  /** Pointer x → minutes from the bar's start (clamped to the track). */
  const pointerMinutes = useCallback(
    (clientX: number) => {
      const el = trackRef.current;
      if (!el) return 0;
      const r = el.getBoundingClientRect();
      return clamp((clientX - r.left) / r.width, 0, 1) * barMinutes;
    },
    [barMinutes],
  );

  /**
   * Resolve a raw dragged start into a placed one — quantize, magnet-snap,
   * detect overlaps (shared maths in lib/placement). On today the floor is
   * "now" rounded up, so nothing can be dropped into the past — including the
   * extended pre-day zone behind the clock.
   */
  const resolve = useCallback(
    (rawStart: number, payload: BlockDrag) => {
      const minStartMin = isToday
        ? Math.max(0, Math.ceil(minutesBetween(barStart, now) / STEP_MIN) * STEP_MIN)
        : 0;
      return resolvePlacement({
        others: blockMins.filter((o) => o.id !== payload.id),
        windowMinutes: barMinutes,
        durationMin: payload.durationMin,
        rawStartMin: rawStart,
        minStartMin,
      });
    },
    [blockMins, barMinutes, barStart, now, isToday],
  );

  // The shared pointer-drag machine (also drives the capture-sheet placer).
  const { drag, begin, trackHandlers } = usePointerDrag<BlockDrag>({
    trackRef,
    toMinutes: pointerMinutes,
    resolve,
    onDragStart: () => {
      setActiveId(null); // drop the hover popover the instant a drag starts
      setCtxMenu(null);
    },
    commit: (d) => {
      // No-op or blocked → spring back to origin (hook clears the drag now).
      if (d.conflict || d.startMin === d.payload.originMin) return;
      const start = addMinutes(barStart, d.startMin);
      const end = addMinutes(start, d.payload.durationMin);
      // Landed outside the working window? Let the parent offer to move the
      // day's edge. Fired alongside the reschedule — never blocks it.
      if (start < windowStart) onOutsideCommit?.({ side: "start", taskStart: start, taskEnd: end });
      else if (end > windowEnd) onOutsideCommit?.({ side: "end", taskStart: start, taskEnd: end });
      // Returned so the block stays pinned at the drop until the optimistic
      // cache update lands (no flicker back to the old slot).
      return rescheduleTaskOptimistic(d.payload.id, start).catch(() => {
        /* rollback handled inside; block springs home when drag clears */
      });
    },
  });

  function onBlockPointerDown(e: React.PointerEvent, b: Block) {
    if (drag || !canDrag(b)) return;
    if (e.button !== 0) return; // only a primary-button press can become a drag
    const originMin = minutesBetween(barStart, b.start);
    const durationMin = Math.max(STEP_MIN, minutesBetween(b.start, b.end));
    begin(e, { id: b.item.id, durationMin, originMin }, originMin);
  }

  if (!shape.enabled || windowMinutes <= 0) {
    return <p className="mb-6 text-sm text-muted">Day off — nothing scheduled.</p>;
  }

  const nowPct =
    isToday && now >= barStart && now <= barEnd
      ? (minutesBetween(barStart, now) / barMinutes) * 100
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
        {...trackHandlers}
      >
        {/* Rounded fill + hour gridlines + now marker (clipped to the bar).
            The base is the grayer "outside my day" tone; the working window is
            painted over it in a soft accent tint so the selected day reads as
            colored and the outside-hours stretch as clearly greyer beside it. */}
        <div className="absolute inset-0 overflow-hidden rounded-lg bg-paper-edge/40">
          {/* The working window — your selected day — in a soft accent wash. */}
          <div
            aria-hidden
            className="absolute top-0 bottom-0 bg-accent-wash"
            style={{ left: `${windowStartPct}%`, width: `${windowEndPct - windowStartPct}%` }}
          />
          {/* Outside-hours zones: a light hatch over the grey base, with a thin
              accent rule where the real working day begins/ends. Purely
              visual — drops still obey the no-past floor. */}
          {shape.extendedBefore && (
            <>
              <div
                aria-hidden
                className="absolute top-0 bottom-0 left-0"
                style={{
                  width: `${windowStartPct}%`,
                  backgroundImage:
                    "repeating-linear-gradient(-45deg, transparent 0 6px, rgb(var(--ink) / 0.05) 6px 7px)",
                }}
              />
              <div
                aria-hidden
                className="absolute top-0 bottom-0 z-[1] w-0.5 bg-accent/40"
                style={{ left: `${windowStartPct}%` }}
              />
            </>
          )}
          {shape.extendedAfter && (
            <>
              <div
                aria-hidden
                className="absolute top-0 bottom-0 right-0"
                style={{
                  width: `${100 - windowEndPct}%`,
                  backgroundImage:
                    "repeating-linear-gradient(-45deg, transparent 0 6px, rgb(var(--ink) / 0.05) 6px 7px)",
                }}
              />
              <div
                aria-hidden
                className="absolute top-0 bottom-0 z-[1] w-0.5 bg-accent/40"
                style={{ left: `${windowEndPct}%` }}
              />
            </>
          )}
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
          const dragging = drag?.payload.id === b.item.id;
          const lifted = !dragging && (drag?.overlapIds.includes(b.item.id) ?? false);
          const leftPct = dragging ? (drag.startMin / barMinutes) * 100 : b.startPct;
          const y = dragging ? (drag.conflict ? -DRAG_LIFT_PX : 0) : lifted ? -LIFT_PX : 0;
          const draggable = canDrag(b);
          return (
            <motion.button
              key={b.item.id}
              type="button"
              aria-label={segmentAria(b, isUndone(b))}
              onPointerDown={(e) => onBlockPointerDown(e, b)}
              onContextMenu={(e) => onBlockContextMenu(e, b)}
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
              style={{ width: `calc(${b.lengthPct}% - 2px)`, minWidth: 4 }}
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
              style={{ left: `${clamp(((drag.startMin + drag.payload.durationMin / 2) / barMinutes) * 100, 13, 87)}%`, top: -DRAG_LIFT_PX }}
              initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 6, scale: 0.92 }}
              animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 6, scale: 0.92 }}
              transition={{ transform: reduceMotion ? { duration: 0 } : SETTLE, left: { duration: 0 } }}
            >
              <span className="text-sm font-semibold tabular-nums text-ink">
                {timeLabel(addMinutes(barStart, drag.startMin))}
              </span>
              <span className="mx-1 text-muted-soft">→</span>
              <span className="text-sm tabular-nums text-muted">
                {timeLabel(addMinutes(barStart, drag.startMin + drag.payload.durationMin))}
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

      {/* Hover/focus detail popover — interactive for unfinished Life OS tasks.
          The outer div carries an invisible padding "bridge" that spans the gap
          down to the track, so the pointer can travel from the block up into the
          popover without ever leaving a hover target. */}
      {active && (
        <div
          onMouseEnter={() => show(active.item.id)}
          onMouseLeave={scheduleClose}
          onContextMenu={(e) => onBlockContextMenu(e, active)}
          className="absolute z-30 w-max pb-[14px]"
          style={{
            left: `${Math.min(88, Math.max(12, active.startPct + active.lengthPct / 2))}%`,
            top: 4,
            transform: "translate(-50%, -100%)",
          }}
        >
          <div className="max-w-[17rem] rounded-xl border border-paper-edge bg-paper-card px-3.5 py-3 shadow-lift">
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
                  <ActionMenu onOpenChange={onMenuOpenChange} actions={blockActions(active)} />
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Right-click menu — the full ⋯ action set, opened at the cursor. */}
      {ctxBlock && ctxMenu && (
        <ContextMenu
          actions={blockActions(ctxBlock)}
          position={{ x: ctxMenu.x, y: ctxMenu.y }}
          onClose={() => setCtxMenu(null)}
        />
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
