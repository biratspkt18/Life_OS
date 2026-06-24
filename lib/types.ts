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

export interface Task {
  id: string;
  title: string;
  durationMinutes: number;
  importance: Importance;
  /** ISO datetime, or null = captured but not yet placed on the day. */
  scheduledStart: string | null;
  /** Set once Google Calendar sync exists (out of scope for the local-only build). */
  googleEventId: string | null;
  completed: boolean;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  // future (NOT v1): recurrenceRule
}

/**
 * One row in the Today view. Either a Daybook task (`source: "daybook"`, has a
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
  source: "daybook" | "google";
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
};

/** Duration presets offered at capture (brief §5A). */
export const DURATION_PRESETS = [15, 30, 60] as const;
