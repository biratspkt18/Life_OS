import {
  COARSE_STEP_MIN,
  STEP_MIN,
  firstFreeStartMin,
  hourMarks,
  resolvePlacement,
  stepForDensity,
  suggestStartsMin,
  type Span,
} from "../lib/placement";

import { harness } from "./_harness.mts";

const { check, done } = harness("placement");

const span = (id: string, startMin: number, endMin: number): Span => ({ id, startMin, endMin });
const WIN = 720; // a 12-hour window, e.g. 08:00-20:00

// 1) Quantize + clamp.
{
  const r = resolvePlacement({ others: [], windowMinutes: WIN, durationMin: 30, rawStartMin: 47 });
  check("quantize 47 → 45", r.startMin === 45 && !r.conflict && !r.snapped, String(r.startMin));

  const lo = resolvePlacement({ others: [], windowMinutes: WIN, durationMin: 30, rawStartMin: -20 });
  check("clamp below → 0, snapped to window edge", lo.startMin === 0 && lo.snapped && !lo.conflict, String(lo.startMin));

  const hi = resolvePlacement({ others: [], windowMinutes: WIN, durationMin: 30, rawStartMin: 9999 });
  check("clamp above → maxStart 690", hi.startMin === 690, String(hi.startMin));
}

// 2) Magnet: snaps flush to a neighbour's end; skips an occupied flush spot.
{
  const r = resolvePlacement({ others: [span("a", 33, 63)], windowMinutes: WIN, durationMin: 30, rawStartMin: 66 });
  check("magnet → flush at 63", r.startMin === 63 && r.snapped && !r.conflict, String(r.startMin));

  const r2 = resolvePlacement({
    others: [span("a", 33, 63), span("b", 63, 93)],
    windowMinutes: WIN,
    durationMin: 30,
    rawStartMin: 66,
  });
  check(
    "occupied flush spot → conflict, no snap",
    r2.conflict && !r2.snapped && r2.overlapIds.length === 1 && r2.overlapIds[0] === "b",
    JSON.stringify(r2),
  );
}

// 3) minStartMin floor (the past-guard).
{
  const r = resolvePlacement({ others: [], windowMinutes: WIN, durationMin: 30, rawStartMin: 0, minStartMin: 120 });
  check("floor clamps to minStart", r.startMin === 120 && !r.conflict, String(r.startMin));

  const magnetPast = resolvePlacement({
    others: [span("a", 90, 118)],
    windowMinutes: WIN,
    durationMin: 30,
    rawStartMin: 121,
    minStartMin: 120,
  });
  check(
    "magnet candidate below floor is lifted to the floor",
    magnetPast.startMin === 120 && !magnetPast.conflict,
    JSON.stringify(magnetPast),
  );

  const nofit = resolvePlacement({ others: [], windowMinutes: WIN, durationMin: 30, rawStartMin: 300, minStartMin: 700 });
  check("minStart > maxStart → always conflict", nofit.conflict, JSON.stringify(nofit));
}

// 4) firstFreeStartMin.
{
  const empty = firstFreeStartMin({ others: [], windowMinutes: WIN, durationMin: 30, minStartMin: 7 });
  check("empty day → minStart rounded up to step", empty === 10, String(empty));

  const full = firstFreeStartMin({ others: [span("x", 0, WIN)], windowMinutes: WIN, durationMin: 30 });
  check("full day → null", full === null, String(full));

  const pref = firstFreeStartMin({ others: [], windowMinutes: WIN, durationMin: 30, preferredMin: 137 });
  check("free preferred → returned exactly (off-grid ok)", pref === 137, String(pref));

  const prefBusy = firstFreeStartMin({
    others: [span("x", 120, 180)],
    windowMinutes: WIN,
    durationMin: 30,
    preferredMin: 130,
  });
  check("busy preferred → earliest free instead", prefBusy === 0, String(prefBusy));

  const gap = firstFreeStartMin({
    others: [span("a", 0, 63), span("b", 93, WIN)],
    windowMinutes: WIN,
    durationMin: 30,
  });
  check("finds the exact off-grid 63-93 gap", gap === 63, String(gap));
}

// 5) Coarse step (narrow tracks) still reaches flush edges via the magnet.
{
  const r = resolvePlacement({
    others: [span("a", 0, 68)],
    windowMinutes: WIN,
    durationMin: 30,
    rawStartMin: 73,
    stepMin: COARSE_STEP_MIN,
  });
  check("15-min step magnets flush at 68", r.startMin === 68 && r.snapped, String(r.startMin));
  check("stepForDensity fine at 0.8 px/min", stepForDensity(0.8) === STEP_MIN);
  check("stepForDensity coarse at 0.5 px/min", stepForDensity(0.5) === COARSE_STEP_MIN);
}

// 6) suggestStartsMin: one opening per part of day (window 08:00 → 480 min-of-day).
{
  const s = suggestStartsMin({
    others: [span("a", 0, 60)],
    windowMinutes: WIN,
    durationMin: 30,
    windowStartMinOfDay: 480,
  });
  check("three suggestions", s.length === 3, JSON.stringify(s));
  check("morning: after the 08-09 blocker → 60", s[0] === 60, String(s[0]));
  check("afternoon: 12:00 → 240", s[1] === 240, String(s[1]));
  check("evening: 17:00 → 540", s[2] === 540, String(s[2]));

  const booked = suggestStartsMin({
    others: [span("x", 0, WIN)],
    windowMinutes: WIN,
    durationMin: 30,
    windowStartMinOfDay: 480,
  });
  check("fully booked day → no suggestions", booked.length === 0, JSON.stringify(booked));
}

// 7) hourMarks: 08:00-20:00 window.
{
  const ws = new Date(2026, 5, 22, 8, 0, 0);
  const we = new Date(2026, 5, 22, 20, 0, 0);
  const marks = hourMarks(ws, we, WIN);
  check("13 marks for 8a-8p inclusive", marks.length === 13, String(marks.length));
  check("first mark at 0%", marks[0].pct === 0, String(marks[0].pct));
  check("last mark at 100%", marks[marks.length - 1].pct === 100, String(marks[marks.length - 1].pct));
  // 12 window-hours → label every ceil(12/5)=3 → majors at hours 0,3,6,9,12.
  check("major cadence every 3rd hour", marks.filter((m) => m.major).length === 5);
}

done();
