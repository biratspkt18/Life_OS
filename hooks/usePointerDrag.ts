"use client";
import { useRef, useState, type PointerEvent, type RefObject } from "react";

/** Pointer travel (px) before a press becomes a drag rather than a tap/hover. */
export const DRAG_THRESHOLD_PX = 4;

/** The resolved placement of a drag, in window/bar minutes. */
export interface DragResolution {
  startMin: number;
  conflict: boolean;
  overlapIds: string[];
  snapped: boolean;
}

/** Live drag state: the resolution plus the caller's payload (id, duration, …). */
export interface DragState<P> extends DragResolution {
  pointerId: number;
  /** Pointer-minute minus the target's start at grab, so it doesn't jump under the finger. */
  grabOffsetMin: number;
  payload: P;
}

/**
 * The shared pointer-drag state machine behind the Today timeline and the
 * capture-sheet placer. It owns the fiddly, identical parts — the press→drag
 * threshold, pointer capture/release, and the drag lifecycle — while each
 * surface supplies what differs: how a raw pointer position `resolve`s to a
 * placement (which neighbours to dodge, the step, the floor) and what to
 * `commit` on release. `commit` may return a promise; the target stays pinned
 * at the drop until it settles, so it never flickers back to its old spot.
 */
export function usePointerDrag<P>(opts: {
  trackRef: RefObject<HTMLDivElement | null>;
  /** Pointer clientX → minutes from the track's start. */
  toMinutes: (clientX: number) => number;
  /** Raw dragged start + payload → a snapped, conflict-checked placement. */
  resolve: (rawStartMin: number, payload: P) => DragResolution;
  /** Fired once on release with the final drag state. Return a promise to keep the drag pinned until it resolves. */
  commit: (drag: DragState<P>) => void | Promise<void>;
  /** Fired the instant a real drag begins (e.g. to dismiss a hover popover). */
  onDragStart?: () => void;
}): {
  drag: DragState<P> | null;
  /**
   * Call from a target's onPointerDown; `atMin` is where that target sits now.
   * `immediate` skips the press→drag threshold, so a plain click on the track
   * teleports the target under the pointer and commits on release (no drag).
   */
  begin: (e: PointerEvent, payload: P, atMin: number, immediate?: boolean) => void;
  trackHandlers: {
    onPointerMove: (e: PointerEvent) => void;
    onPointerUp: (e: PointerEvent) => void;
    onPointerCancel: (e: PointerEvent) => void;
  };
  /** Clear any in-flight drag (e.g. when the viewed day changes). */
  reset: () => void;
} {
  const [drag, setDrag] = useState<DragState<P> | null>(null);
  const pending = useRef<{
    pointerId: number;
    x: number;
    y: number;
    grabOffsetMin: number;
    payload: P;
  } | null>(null);

  function begin(e: PointerEvent, payload: P, atMin: number, immediate = false) {
    const grabOffsetMin = opts.toMinutes(e.clientX) - atMin;
    if (immediate) {
      // The drag is live from the first frame — the target jumps to the pointer
      // now, follows it if the press moves, and commits on release.
      try {
        opts.trackRef.current?.setPointerCapture(e.pointerId);
      } catch {
        /* capture is best-effort */
      }
      opts.onDragStart?.();
      const r = opts.resolve(opts.toMinutes(e.clientX) - grabOffsetMin, payload);
      pending.current = null;
      setDrag({ pointerId: e.pointerId, grabOffsetMin, payload, ...r });
      return;
    }
    pending.current = {
      pointerId: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      grabOffsetMin,
      payload,
    };
  }

  function onPointerMove(e: PointerEvent) {
    const p = pending.current;
    // Promote a press into a drag once it travels past the threshold.
    if (!drag && p && e.pointerId === p.pointerId) {
      if (Math.hypot(e.clientX - p.x, e.clientY - p.y) < DRAG_THRESHOLD_PX) return;
      try {
        opts.trackRef.current?.setPointerCapture(p.pointerId);
      } catch {
        /* capture is best-effort */
      }
      opts.onDragStart?.();
      const r = opts.resolve(opts.toMinutes(e.clientX) - p.grabOffsetMin, p.payload);
      setDrag({ pointerId: p.pointerId, grabOffsetMin: p.grabOffsetMin, payload: p.payload, ...r });
      return;
    }
    if (drag && e.pointerId === drag.pointerId) {
      e.preventDefault();
      const r = opts.resolve(opts.toMinutes(e.clientX) - drag.grabOffsetMin, drag.payload);
      setDrag((d) => (d ? { ...d, ...r } : d));
    }
  }

  function onPointerUp(e: PointerEvent) {
    const d = drag;
    pending.current = null;
    if (!d || e.pointerId !== d.pointerId) return;
    try {
      opts.trackRef.current?.releasePointerCapture(d.pointerId);
    } catch {
      /* already released */
    }
    // Keep the drag pinned until commit settles (async reschedule), else clear now.
    Promise.resolve(opts.commit(d)).finally(() => setDrag(null));
  }

  function reset() {
    pending.current = null;
    setDrag(null);
  }

  return {
    drag,
    begin,
    trackHandlers: { onPointerMove, onPointerUp, onPointerCancel: onPointerUp },
    reset,
  };
}
