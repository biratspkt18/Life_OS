export type Importance = "high" | "normal" | "low";

/** Rank used by the scheduling brain for bump ordering (higher wins prime). */
export const IMPORTANCE_RANK: Record<Importance, number> = {
  high: 2,
  normal: 1,
  low: 0,
};

export const IMPORTANCE_LABEL: Record<Importance, string> = {
  high: "Important",
  normal: "Normal",
  low: "Light",
};

/** Optional per-task energy cost. Neutral wording — a cost, not a judgment. */
export type Energy = "low" | "medium" | "high";

export const ENERGY_ORDER: readonly Energy[] = ["low", "medium", "high"];

export const ENERGY_LABEL: Record<Energy, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

export interface Task {
  id: string;
  title: string;
  durationMinutes: number;
  importance: Importance;
  /** ISO datetime, or null = captured but not yet placed on the day. */
  scheduledStart: string | null;
  /** To-do deadline (ISO, date-only at start of day), or null for no deadline. */
  dueDate: string | null;
  /** Preferred completion date (ISO, date-only), or null. Guides scheduling. */
  preferredDate: string | null;
  /** Set once Google Calendar sync exists (out of scope for the local-only build). */
  googleEventId: string | null;
  completed: boolean;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** Single user-created category, or null for untagged. */
  tag: string | null;
  /** Optional energy cost, or null when the user hasn't set one. */
  energy: Energy | null;
  /** Server-managed: how many times this moved to a different day. */
  deferralCount: number;
  // future (NOT v1): recurrenceRule
}

/**
 * Everything that can land in the task_events log. Most types are derived
 * server-side from real DB transitions; only CLIENT_EVENT_TYPES may be posted
 * directly by the browser.
 */
export type TaskEventType =
  | "created"
  | "completed"
  | "uncompleted"
  | "scheduled"
  | "unscheduled"
  | "rescheduled"
  | "deferred"
  | "edited"
  | "deleted"
  | "breakdown_generated"
  | "broken_down"
  | "breakdown_prompt_shown"
  | "breakdown_dismissed";

/** The only event types the client may POST to /api/events. */
export const CLIENT_EVENT_TYPES = ["breakdown_prompt_shown", "breakdown_dismissed"] as const;

export type ClientEventType = (typeof CLIENT_EVENT_TYPES)[number];

/**
 * Optional telemetry a mutation may carry so the event log can record what
 * the app proposed vs what the user chose. Never affects the write itself;
 * garbage is dropped, not rejected.
 */
export interface TaskEventContext {
  /** The slot the app proposed at the moment of the mutation (first fit). */
  proposedStart?: string | null;
  /** How the user landed on the chosen slot. */
  chosenVia?: "first_fit" | "drag" | "chip" | "exact" | "quick";
  /** Free minutes in the target day as the client saw it (includes Google busy). */
  freeMinutesDay?: number;
}

/**
 * One row in the Today view. Either a Life OS task (`source: "lifeos"`, has a
 * checkbox / importance / completion) or an event read straight from Google
 * Calendar that wasn't created here (`source: "google"`, read-only).
 */
export interface TodayItem {
  id: string;
  title: string;
  /** ISO datetime, or null for an all-day / unscheduled item. */
  start: string | null;
  durationMinutes: number | null;
  importance: Importance | null;
  completed: boolean;
  allDay: boolean;
  source: "lifeos" | "google";
  /** Task energy label; null for unlabeled tasks and Google events. */
  energy: Energy | null;
}

/** The schedulable shape of a single day. */
export interface DayWindow {
  /** When false, the day is off — the brain schedules nothing here. */
  enabled: boolean;
  dayWindowStart: string; // "HH:mm"
  dayWindowEnd: string; // "HH:mm"
  primeStart: string; // "HH:mm"
  primeEnd: string; // "HH:mm"
}

export interface Settings {
  /** Single-row settings; fixed key. */
  id: "app";
  /**
   * Legacy/default day shape. Kept as the template new weekday rows seed from
   * and as a fallback when `weekdayWindows` is missing a slot.
   */
  dayWindowStart: string; // "HH:mm"
  dayWindowEnd: string; // "HH:mm"
  primeStart: string; // "HH:mm"
  primeEnd: string; // "HH:mm"
  /** Per-weekday windows, indexed by JS `Date.getDay()` (0 = Sunday … 6 = Saturday). */
  weekdayWindows: DayWindow[];
  defaultDurationMinutes: number;
  pushEnabled: boolean;
  googleConnected: boolean;
  /** After this many moves to another day, offer to break the task down. */
  deferralBreakdownThreshold: number;
}

const DEFAULT_DAY_WINDOW: DayWindow = {
  enabled: true,
  dayWindowStart: "08:00",
  dayWindowEnd: "20:00",
  primeStart: "09:00",
  primeEnd: "12:00",
};

/** Seven identical weekday windows from a template (defaults to sensible hours). */
export function defaultWeekdayWindows(template: Partial<DayWindow> = {}): DayWindow[] {
  return Array.from({ length: 7 }, () => ({ ...DEFAULT_DAY_WINDOW, ...template }));
}

/** Resolve the window for a given date, falling back to the legacy fields. */
export function windowForDay(settings: Settings, date: Date): DayWindow {
  const w = settings.weekdayWindows?.[date.getDay()];
  if (w) return w;
  return {
    enabled: true,
    dayWindowStart: settings.dayWindowStart,
    dayWindowEnd: settings.dayWindowEnd,
    primeStart: settings.primeStart,
    primeEnd: settings.primeEnd,
  };
}

export const DEFAULT_SETTINGS: Settings = {
  id: "app",
  dayWindowStart: "08:00",
  dayWindowEnd: "20:00",
  primeStart: "09:00",
  primeEnd: "12:00",
  weekdayWindows: defaultWeekdayWindows(),
  defaultDurationMinutes: 30,
  pushEnabled: false,
  googleConnected: false,
  deferralBreakdownThreshold: 5,
};

/**
 * The settings PATCH route has no validation layer, so every consumer of the
 * threshold clamps here rather than trusting the stored blob.
 */
export function breakdownThreshold(settings: Settings): number {
  const n = Math.round(Number(settings.deferralBreakdownThreshold));
  return Number.isFinite(n) && n >= 2 ? Math.min(n, 20) : 5;
}

/** Duration presets offered at capture (brief §5A). */
export const DURATION_PRESETS = [15, 30, 60] as const;
