import {
  applyWindowException,
  dayKeyOf,
  effectiveWindowForDay,
  markPromptAsked,
  parseWindowException,
  proposedEdgeTime,
  shouldPromptEdge,
} from "../lib/effectiveWindow";
import { proposeSlot } from "../lib/schedule";
import { findFreeSlots } from "../lib/freeSlots";
import { DEFAULT_SETTINGS, defaultWeekdayWindows, type DayWindow, type Settings, type Task } from "../lib/types";

import { harness } from "./_harness.mts";

const { check, done } = harness("effectiveWindow");

const WINDOW: DayWindow = {
  enabled: true,
  dayWindowStart: "08:00",
  dayWindowEnd: "20:00",
  primeStart: "09:00",
  primeEnd: "12:00",
};

// ---- applyWindowException ----------------------------------------------

{
  const day = "2026-07-25";
  check("null exception → unchanged", applyWindowException(WINDOW, null, day) === WINDOW);
  const other = applyWindowException(WINDOW, { day: "2026-07-26", start: "06:00" }, day);
  check("other-day exception → unchanged", other === WINDOW);

  const start = applyWindowException(WINDOW, { day, start: "06:00" }, day);
  check("start-only override", start.dayWindowStart === "06:00" && start.dayWindowEnd === "20:00");
  const end = applyWindowException(WINDOW, { day, end: "22:30" }, day);
  check("end-only override", end.dayWindowStart === "08:00" && end.dayWindowEnd === "22:30");
  const both = applyWindowException(WINDOW, { day, start: "06:00", end: "22:30" }, day);
  check("both overridden", both.dayWindowStart === "06:00" && both.dayWindowEnd === "22:30");
  check("prime + enabled untouched", both.primeStart === "09:00" && both.enabled);
}

// ---- parseWindowException ----------------------------------------------

{
  const good = parseWindowException(JSON.stringify({ day: "2026-07-25", start: "06:00" }));
  check("valid exception parses", good?.day === "2026-07-25" && good?.start === "06:00");
  check("junk → null", parseWindowException("{oops") === null);
  check("nothing stored → null", parseWindowException(null) === null);
  check("bad time → null", parseWindowException(JSON.stringify({ day: "2026-07-25", start: "26:00" })) === null);
  check("bad day → null", parseWindowException(JSON.stringify({ day: "yesterday", start: "06:00" })) === null);
  check("no start or end → null", parseWindowException(JSON.stringify({ day: "2026-07-25" })) === null);
}

// ---- effectiveWindowForDay ---------------------------------------------

{
  const settings: Settings = { ...DEFAULT_SETTINGS, weekdayWindows: defaultWeekdayWindows(WINDOW) };
  const day = new Date(2026, 6, 25); // Saturday
  const eff = effectiveWindowForDay(settings, day, { day: dayKeyOf(day), start: "07:00" });
  check("effectiveWindowForDay applies today's exception", eff.dayWindowStart === "07:00");
  const tomorrow = effectiveWindowForDay(settings, new Date(2026, 6, 26), { day: dayKeyOf(day), start: "07:00" });
  check("…but not tomorrow's window", tomorrow.dayWindowStart === "08:00");
}

// ---- once-per-day prompt flags -----------------------------------------

{
  const day = "2026-07-25";
  check("fresh day → prompt allowed (start)", shouldPromptEdge(null, day, "start"));
  check("fresh day → prompt allowed (end)", shouldPromptEdge(null, day, "end"));

  const asked = markPromptAsked(null, day, "start");
  check("asked side blocked", !shouldPromptEdge(asked, day, "start"));
  check("other side still allowed", shouldPromptEdge(asked, day, "end"));

  const bothAsked = markPromptAsked(asked, day, "end");
  check("both sides blocked", !shouldPromptEdge(bothAsked, day, "start") && !shouldPromptEdge(bothAsked, day, "end"));
  check("next day resets both", shouldPromptEdge(bothAsked, "2026-07-26", "start") && shouldPromptEdge(bothAsked, "2026-07-26", "end"));
  check("corrupt raw → prompt allowed", shouldPromptEdge("{garbage", day, "start"));
}

// ---- proposedEdgeTime --------------------------------------------------

{
  const s = new Date(2026, 6, 25, 6, 43);
  const e = new Date(2026, 6, 25, 21, 12);
  check("start floors to 5 min", proposedEdgeTime("start", s, e) === "06:40");
  check("end ceils to 5 min", proposedEdgeTime("end", s, e) === "21:15");
  const exact = new Date(2026, 6, 25, 6, 45);
  check("exact boundary unchanged", proposedEdgeTime("start", exact, e) === "06:45");
}

// ---- brain scoping: the exception must not leak to next week -----------

{
  const settings: Settings = { ...DEFAULT_SETTINGS, weekdayWindows: defaultWeekdayWindows(WINDOW) };
  const saturday = new Date(2026, 6, 25); // Sat
  const now = new Date(2026, 6, 25, 5, 0);
  const exception = { day: dayKeyOf(saturday), start: "06:00" };
  const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

  // A day fully booked from 08:00–20:00 forces proposals into the extension
  // (today) or onto another day. Same busy layout copied to next Saturday.
  const block = (day: Date, id: string): Task => ({
    id,
    title: id,
    durationMinutes: 720,
    importance: "normal",
    scheduledStart: new Date(day.getFullYear(), day.getMonth(), day.getDate(), 8).toISOString(),
    dueDate: null,
    preferredDate: null,
    googleEventId: null,
    completed: false,
    completedAt: null,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    tag: null,
    energy: null,
    deferralCount: 0,
  });

  const tasks = [block(saturday, "sat1")];
  const p = proposeSlot({
    durationMinutes: 60,
    importance: "normal",
    settings,
    tasks,
    now,
    windowException: exception,
  });
  check(
    "proposeSlot uses the extension on the named day",
    p !== null && p.start.getDate() === 25 && hhmm(p.start) === "06:00",
    p ? `${p.start.toString()}` : "null",
  );

  // Next Saturday fully booked too: without a leak the brain must NOT use
  // 06:00 there — the earliest legal slot is Sunday's normal window.
  const tasks2 = [block(saturday, "sat1"), block(new Date(2026, 7, 1), "sat2")];
  const p2 = proposeSlot({
    durationMinutes: 60,
    importance: "normal",
    settings,
    tasks: tasks2,
    now: new Date(2026, 6, 26, 7, 0), // Sunday morning — today's exception day is gone
    windowException: exception,
  });
  check(
    "exception never leaks to the same weekday next week",
    p2 !== null && !(p2.start.getDate() === 1 && hhmm(p2.start) === "06:00"),
    p2 ? `${p2.start.toString()}` : "null",
  );

  // findFreeSlots: extension day offers 06:00; next Saturday doesn't.
  const slots = findFreeSlots({
    durationMinutes: 60,
    settings,
    tasks,
    now,
    days: 1,
    windowException: exception,
    stepMinutes: 30,
    limit: 3,
  });
  check("findFreeSlots proposes into the extension", slots.length > 0 && hhmm(slots[0]) === "06:00", slots.map(hhmm).join(","));

  const nextSat = findFreeSlots({
    durationMinutes: 60,
    settings,
    tasks: [],
    now,
    fromDay: new Date(2026, 7, 1),
    days: 1,
    windowException: exception,
    stepMinutes: 30,
    limit: 1,
  });
  check("findFreeSlots: next Saturday starts at the normal 08:00", nextSat.length > 0 && hhmm(nextSat[0]) === "08:00", nextSat.map(hhmm).join(","));
}

done();
