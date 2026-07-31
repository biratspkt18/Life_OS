import { format } from "./dates";
import { windowForDay, type DayWindow, type Settings } from "./types";

/**
 * One-day working-window exceptions ("start my day earlier just for today"),
 * plus the once-per-day bookkeeping for the prompts that create them.
 *
 * The exception lives per device (localStorage) and is *date-stamped*: it
 * only ever applies to the calendar day it names, so it self-expires at
 * midnight and can never leak onto other days — including the same weekday
 * next week inside the brain's search horizon. Saving a "usual" time goes
 * through Settings (`weekdayWindows`) instead and is account-wide.
 */

export interface WindowException {
  /** The one calendar day this applies to, "yyyy-MM-dd" (local). */
  day: string;
  /** Overridden window start, "HH:mm" — absent = keep the settings start. */
  start?: string;
  /** Overridden window end, "HH:mm" — absent = keep the settings end. */
  end?: string;
}

export const WINDOW_EXCEPTION_KEY = "lifeos-window-exception";
export const WINDOW_EXCEPTION_EVENT = "lifeos:window-exception";
export const EDGE_PROMPT_KEY = "lifeos-edge-prompt";

export type EdgeSide = "start" | "end";

/** The day-stamp used across exceptions and prompt flags. */
export function dayKeyOf(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

/** Harden a stored exception: junk, bad times, or a bad day → null. */
export function parseWindowException(raw: string | null): WindowException | null {
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as Record<string, unknown>;
    if (typeof p.day !== "string" || !DAY_KEY.test(p.day)) return null;
    const start = typeof p.start === "string" && HHMM.test(p.start) ? p.start : undefined;
    const end = typeof p.end === "string" && HHMM.test(p.end) ? p.end : undefined;
    if (!start && !end) return null;
    return { day: p.day, ...(start ? { start } : {}), ...(end ? { end } : {}) };
  } catch {
    return null;
  }
}

/**
 * Overlay an exception onto a base window — only when the exception names
 * exactly this day. Start/end are overridden independently; prime and
 * enabled are never touched.
 */
export function applyWindowException(
  window: DayWindow,
  exception: WindowException | null,
  dayKey: string,
): DayWindow {
  if (!exception || exception.day !== dayKey) return window;
  return {
    ...window,
    dayWindowStart: exception.start ?? window.dayWindowStart,
    dayWindowEnd: exception.end ?? window.dayWindowEnd,
  };
}

/** The window a given day actually runs on: settings + today's exception. */
export function effectiveWindowForDay(
  settings: Settings,
  day: Date,
  exception: WindowException | null,
): DayWindow {
  return applyWindowException(windowForDay(settings, day), exception, dayKeyOf(day));
}

/**
 * The proposed new edge time for the prompt: an earlier start is the placed
 * task's start floored to 5 minutes; a later end is its end ceiled to 5.
 */
export function proposedEdgeTime(side: EdgeSide, taskStart: Date, taskEnd: Date): string {
  const step = 5 * 60_000;
  const t =
    side === "start"
      ? Math.floor(taskStart.getTime() / step) * step
      : Math.ceil(taskEnd.getTime() / step) * step;
  return format(new Date(t), "HH:mm");
}

// ---- once-per-day prompt flags ------------------------------------------

interface EdgePromptFlags {
  day: string;
  startAsked: boolean;
  endAsked: boolean;
}

function parseFlags(raw: string | null, dayKey: string): EdgePromptFlags {
  const fresh: EdgePromptFlags = { day: dayKey, startAsked: false, endAsked: false };
  if (!raw) return fresh;
  try {
    const p = JSON.parse(raw) as Record<string, unknown>;
    if (p.day !== dayKey) return fresh; // new day → both prompts available again
    return {
      day: dayKey,
      startAsked: p.startAsked === true,
      endAsked: p.endAsked === true,
    };
  } catch {
    return fresh;
  }
}

/** May this side's prompt still be shown today? (Each side asks at most once.) */
export function shouldPromptEdge(raw: string | null, dayKey: string, side: EdgeSide): boolean {
  const f = parseFlags(raw, dayKey);
  return side === "start" ? !f.startAsked : !f.endAsked;
}

/** The stored value after marking this side's prompt as shown today. */
export function markPromptAsked(raw: string | null, dayKey: string, side: EdgeSide): string {
  const f = parseFlags(raw, dayKey);
  if (side === "start") f.startAsked = true;
  else f.endAsked = true;
  return JSON.stringify(f);
}

// ---- thin client storage layer (theme.ts pattern) -----------------------

export function getWindowException(): WindowException | null {
  if (typeof window === "undefined") return null;
  return parseWindowException(window.localStorage.getItem(WINDOW_EXCEPTION_KEY));
}

/** Persist (null clears) and let same-tab listeners re-render. */
export function setWindowException(e: WindowException | null): void {
  if (typeof window === "undefined") return;
  if (e === null) window.localStorage.removeItem(WINDOW_EXCEPTION_KEY);
  else window.localStorage.setItem(WINDOW_EXCEPTION_KEY, JSON.stringify(e));
  window.dispatchEvent(new CustomEvent(WINDOW_EXCEPTION_EVENT, { detail: e }));
}

export function getEdgePromptRaw(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(EDGE_PROMPT_KEY);
}

export function setEdgePromptRaw(raw: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(EDGE_PROMPT_KEY, raw);
}
