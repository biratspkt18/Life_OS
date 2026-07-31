import {
  buildCandidates,
  buildSuggestPrompt,
  computeTagTimeStats,
  findCurrentGap,
  formatLocalHHmm,
  gapKey,
  MAX_CANDIDATES,
  parseSuggestResponse,
  rankDeterministic,
  type Gap,
  type SuggestContext,
} from "../lib/gapSuggest";
import type { DayWindow, Task, TodayItem } from "../lib/types";

import { harness } from "./_harness.mts";

const { check, done } = harness("gapSuggest");

// ---- fixtures ----------------------------------------------------------

const DAY = new Date(2026, 6, 24); // local midnight, Fri 24 Jul 2026
const at = (h: number, m = 0) => new Date(2026, 6, 24, h, m);
const hhmm = (d: Date) =>
  `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

const WINDOW: DayWindow = {
  enabled: true,
  dayWindowStart: "08:00",
  dayWindowEnd: "20:00",
  primeStart: "09:00",
  primeEnd: "12:00",
};

let n = 0;
function mkTask(p: Partial<Task> = {}): Task {
  n++;
  return {
    id: p.id ?? `t${n}`,
    title: p.title ?? `Task ${n}`,
    durationMinutes: p.durationMinutes ?? 30,
    importance: p.importance ?? "normal",
    scheduledStart: p.scheduledStart ?? null,
    dueDate: p.dueDate ?? null,
    preferredDate: p.preferredDate ?? null,
    googleEventId: null,
    completed: p.completed ?? false,
    completedAt: p.completedAt ?? null,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    tag: p.tag ?? null,
    energy: p.energy ?? null,
    deferralCount: p.deferralCount ?? 0,
  };
}

function mkItem(startH: number, startM: number, minutes: number, allDay = false): TodayItem {
  n++;
  return {
    id: `i${n}`,
    title: `Item ${n}`,
    start: allDay ? null : at(startH, startM).toISOString(),
    durationMinutes: minutes,
    importance: "normal",
    completed: false,
    allDay,
    source: "lifeos",
    energy: null,
  };
}

const mkGap = (usableMinutes: number): Gap => ({
  start: at(9),
  end: at(9, usableMinutes),
  usableStart: at(9),
  usableMinutes,
});

// ---- gap detection -----------------------------------------------------

{
  const g = findCurrentGap([], WINDOW, DAY, at(9), 30);
  check("empty day: whole window is the gap", g !== null && hhmm(g.start) === "08:00" && hhmm(g.end) === "20:00");
  check("empty day: usable starts now", g !== null && hhmm(g.usableStart) === "09:00" && g.usableMinutes === 660);

  const g2 = findCurrentGap([], WINDOW, DAY, at(9, 2), 30);
  check("usable start rounds up to 5 min", g2 !== null && hhmm(g2.usableStart) === "09:05");

  const g3 = findCurrentGap([], WINDOW, DAY, at(7), 30);
  check("before the window: usable clamps to window start", g3 !== null && hhmm(g3.usableStart) === "08:00");
}

{
  // 08:00–09:00 busy, 09:20 next block → 20-min sliver skipped, gap after 10:20 wins.
  const items = [mkItem(8, 0, 60), mkItem(9, 20, 60)];
  const g = findCurrentGap(items, WINDOW, DAY, at(9), 30);
  check("sub-30-min gap skipped for the next one", g !== null && hhmm(g.start) === "10:20" && hhmm(g.end) === "20:00");
}

{
  const items = [mkItem(8, 0, 12 * 60)]; // 08:00–20:00 solid
  check("fully booked day → null", findCurrentGap(items, WINDOW, DAY, at(9), 30) === null);
  check("now past window end → null", findCurrentGap([], WINDOW, DAY, at(20, 30), 30) === null);
  check("disabled window → null", findCurrentGap([], { ...WINDOW, enabled: false }, DAY, at(9), 30) === null);
}

{
  // Now inside a busy block → the gap that follows it.
  const items = [mkItem(9, 0, 60)];
  const g = findCurrentGap(items, WINDOW, DAY, at(9, 30), 30);
  check("now inside a block → gap after it", g !== null && hhmm(g.usableStart) === "10:00" && hhmm(g.end) === "20:00");
}

{
  // Structural identity: the key ignores the moving clock.
  const items = [mkItem(8, 0, 60), mkItem(15, 0, 60)];
  const a = findCurrentGap(items, WINDOW, DAY, at(9, 5), 30);
  const b = findCurrentGap(items, WINDOW, DAY, at(13, 40), 30);
  check("same gap across two different nows", a !== null && b !== null && gapKey(a) === gapKey(b));
  check("usable minutes shrink as time passes", a !== null && b !== null && b.usableMinutes < a.usableMinutes);

  // With <30 usable left in the 09:00–15:00 gap, we move on to the next gap.
  const c = findCurrentGap(items, WINDOW, DAY, at(14, 40), 30);
  check("nearly-spent gap skipped for the next", c !== null && hhmm(c.start) === "16:00");
  check("...and the key changes with it", a !== null && c !== null && gapKey(a) !== gapKey(c));
}

{
  // All-day items never block the day; missing durations use the fallback.
  const items = [mkItem(0, 0, 0, true)];
  check("all-day item doesn't block", findCurrentGap(items, WINDOW, DAY, at(9), 30) !== null);
  const noDur: TodayItem = { ...mkItem(8, 0, 60), durationMinutes: null };
  const g = findCurrentGap([noDur], WINDOW, DAY, at(8), 45);
  check("null duration uses fallback", g !== null && hhmm(g.start) === "08:45");
}

// ---- candidates --------------------------------------------------------

{
  const gap = mkGap(45);
  const fits = mkTask({ id: "fits", durationMinutes: 45 });
  const tooLong = mkTask({ id: "tooLong", durationMinutes: 60 });
  const done = mkTask({ id: "done", durationMinutes: 20, completed: true });
  const spotlight = mkTask({ id: "spot", durationMinutes: 20 });
  const out = buildCandidates(gap, [fits, tooLong, done, spotlight], [], "spot");
  check("too-long task excluded", !out.some((c) => c.id === "tooLong"));
  check("completed task excluded", !out.some((c) => c.id === "done"));
  check("spotlight excluded", !out.some((c) => c.id === "spot"));
  check("fitting task kept", out.some((c) => c.id === "fits"));
}

{
  const gap = mkGap(60);
  const dupe = mkTask({ id: "dupe", durationMinutes: 30 });
  const out = buildCandidates(gap, [dupe], [dupe], undefined);
  check("duplicate deduped, loose-end kind wins", out.length === 1 && out[0].kind === "loose-end");

  const many = Array.from({ length: 20 }, (_, i) => mkTask({ id: `m${i}`, durationMinutes: 15 }));
  check("capped at MAX_CANDIDATES", buildCandidates(gap, many, []).length === MAX_CANDIDATES);
}

// ---- energy-lane filtering of candidates -------------------------------

{
  const gap = mkGap(60);
  const low = mkTask({ id: "low", energy: "low", durationMinutes: 15 });
  const med = mkTask({ id: "med", energy: "medium", durationMinutes: 15 });
  const high = mkTask({ id: "high", energy: "high", durationMinutes: 15 });
  const none = mkTask({ id: "none", energy: null, durationMinutes: 15 });
  const pool = [low, med, high, none];

  const slow = buildCandidates(gap, pool, [], undefined, "slow");
  check("slow lane: low + unlabeled only", slow.length === 2 && slow.some((c) => c.id === "low") && slow.some((c) => c.id === "none"));

  const zippy = buildCandidates(gap, pool, [], undefined, "zippy");
  check("zippy lane: medium + high + unlabeled", zippy.length === 3 && !zippy.some((c) => c.id === "low"));

  const all = buildCandidates(gap, pool, [], undefined, null);
  check("no lane: everything", all.length === 4);
  check("omitted lane arg: everything (back-compat)", buildCandidates(gap, pool, []).length === 4);

  // Filter-before-cap: 14 undated high-energy tasks outrank 2 low ones (via
  // deferralCount), so a post-cap filter would starve the slow lane.
  const many = [
    ...Array.from({ length: 14 }, (_, i) =>
      mkTask({ id: `h${i}`, energy: "high", durationMinutes: 15, deferralCount: 10 }),
    ),
    mkTask({ id: "l1", energy: "low", durationMinutes: 15 }),
    mkTask({ id: "l2", energy: "low", durationMinutes: 15 }),
  ];
  const slowMany = buildCandidates(gap, many, [], undefined, "slow");
  check(
    "lane filters before the cap",
    slowMany.length === 2 && slowMany.every((c) => c.energy === "low"),
    JSON.stringify(slowMany.map((c) => c.id)),
  );
}

// ---- deterministic ranking ---------------------------------------------

{
  const gap = mkGap(120);
  const dueSoon = mkTask({ id: "dueSoon", dueDate: "2026-07-25T00:00:00.000Z", importance: "low" });
  const important = mkTask({ id: "important", importance: "high" });
  const slipped = mkTask({ id: "slipped", deferralCount: 4 });
  const plain = mkTask({ id: "plain" });
  const ranked = buildCandidates(gap, [plain, slipped, important, dueSoon], []);
  check("due date beats importance", ranked[0].id === "dueSoon");
  check("importance beats deferrals when undated", ranked[1].id === "important");
  check("deferral count is the last tiebreak", ranked[2].id === "slipped" && ranked[3].id === "plain");

  const prefEarly = mkTask({ id: "prefEarly", preferredDate: "2026-07-24T00:00:00.000Z" });
  const dueLater = mkTask({ id: "dueLater", dueDate: "2026-07-30T00:00:00.000Z" });
  const r2 = rankDeterministic(buildCandidates(gap, [dueLater, prefEarly], []));
  check("preferred date counts as urgency", r2[0].id === "prefEarly");
}

// ---- AI response validation --------------------------------------------

const IDS = ["a", "b", "c"];
{
  const ok = parseSuggestResponse('{"pickId":"a","reason":"Mornings suit this.","runnerUpId":"b"}', IDS);
  check("clean JSON parses", ok !== null && ok.pickId === "a" && ok.runnerUpId === "b");
  check("missing runnerUpReason tolerated", ok !== null && ok.runnerUpReason === null);

  const both = parseSuggestResponse(
    '{"pickId":"a","reason":"Due soon.","runnerUpId":"b","runnerUpReason":"A lighter option."}',
    IDS,
  );
  check("runnerUpReason kept when valid", both !== null && both.runnerUpReason === "A lighter option.");

  const orphanReason = parseSuggestResponse(
    '{"pickId":"a","reason":"Due soon.","runnerUpId":"zzz","runnerUpReason":"A lighter option."}',
    IDS,
  );
  check(
    "runnerUpReason dropped with its invalid runnerUp",
    orphanReason !== null && orphanReason.runnerUpId === null && orphanReason.runnerUpReason === null,
  );

  const fenced = parseSuggestResponse('```json\n{"pickId":"b","reason":"Short and due soon.","runnerUpId":"a"}\n```', IDS);
  check("fenced JSON parses", fenced !== null && fenced.pickId === "b");

  const prose = parseSuggestResponse('Sure! Here you go: {"pickId":"c","reason":"A quick win.","runnerUpId":null}', IDS);
  check("surrounding prose tolerated", prose !== null && prose.pickId === "c" && prose.runnerUpId === null);
}

{
  check("unknown pickId → null", parseSuggestResponse('{"pickId":"zzz","reason":"nope","runnerUpId":"a"}', IDS) === null);
  check("malformed JSON → null", parseSuggestResponse('{"pickId": "a", "reason": ', IDS) === null);
  check("no JSON at all → null", parseSuggestResponse("I could not decide.", IDS) === null);
  check("missing reason → null", parseSuggestResponse('{"pickId":"a","runnerUpId":"b"}', IDS) === null);
  check("empty reason → null", parseSuggestResponse('{"pickId":"a","reason":"  ","runnerUpId":"b"}', IDS) === null);
  check("array reply → null", parseSuggestResponse('[{"pickId":"a"}]', IDS) === null);
}

{
  const badRunner = parseSuggestResponse('{"pickId":"a","reason":"Fine.","runnerUpId":"zzz"}', IDS);
  check("bad runnerUp degrades, pick survives", badRunner !== null && badRunner.runnerUpId === null);
  const selfRunner = parseSuggestResponse('{"pickId":"a","reason":"Fine.","runnerUpId":"a"}', IDS);
  check("runnerUp = pick → null runnerUp", selfRunner !== null && selfRunner.runnerUpId === null);
  const long = parseSuggestResponse(`{"pickId":"a","reason":"${"x".repeat(400)}","runnerUpId":"b"}`, IDS);
  check("overlong reason truncated", long !== null && long.reason.length <= 241);
}

// ---- tag time stats ----------------------------------------------------

{
  const uni = (h: number, done = true) =>
    mkTask({ tag: "uni", completed: done, completedAt: done ? `2026-07-20T${String(h).padStart(2, "0")}:00:00.000Z` : null });
  const tasks = [uni(9), uni(10), uni(11), mkTask({ tag: "uni" }), mkTask({ tag: "gym", completed: true, completedAt: "2026-07-20T18:00:00.000Z" }), mkTask({ title: "untagged", completed: true, completedAt: "2026-07-20T08:00:00.000Z" })];
  const stats = computeTagTimeStats(tasks, 0);
  const u = stats.find((s) => s.tag === "uni");
  check("median finish hour (UTC clock)", u?.typicalFinishHour === 10);
  check("completion rate counts open tasks", u?.completionRate === 0.75);
  const g = stats.find((s) => s.tag === "gym");
  check("under 3 samples → no typical hour", g !== null && g?.typicalFinishHour === null && g?.sampleSize === 1);
  check("untagged tasks skipped", !stats.some((s) => s.tag === ""));

  // UTC+2 device (getTimezoneOffset() === -120): 10:00Z finishes at 12 local.
  const shifted = computeTagTimeStats([uni(9), uni(10), uni(11)], -120);
  check("tz offset shifts the median", shifted[0].typicalFinishHour === 12);
}

{
  check("formatLocalHHmm shifts by offset", formatLocalHHmm(new Date("2026-07-24T10:30:00.000Z"), -120) === "12:30");
  check("formatLocalHHmm at UTC", formatLocalHHmm(new Date("2026-07-24T10:30:00.000Z"), 0) === "10:30");
}

// ---- battery-aware prompt ----------------------------------------------

{
  const baseCtx: SuggestContext = {
    now: "14:00",
    gap: { start: "14:00", end: "15:30", minutes: 90 },
    candidates: [
      { id: "a", title: "Task A", tag: "uni", energy: "low", minutes: 30, importance: "normal", due: null, preferred: null, timesRescheduled: 0 },
    ],
    tagHistory: [{ tag: "uni", completionRate: 0.7, typicalFinishHour: 10, sampleSize: 5 }],
  };

  const noBattery = buildSuggestPrompt(baseCtx);
  check("prompt omits day-load line when no battery given", !noBattery.includes("how full the day already is"));

  const heavy = buildSuggestPrompt({ ...baseCtx, dayLoadPercent: 120 });
  check("heavy day → prompt mentions load + overloaded", heavy.includes("how full the day already is") && heavy.includes("overloaded") && heavy.includes("120%"));

  const light = buildSuggestPrompt({ ...baseCtx, dayLoadPercent: 20 });
  check("light day → prompt says still light", light.includes("still light") && light.includes("20%"));

  const full = buildSuggestPrompt({ ...baseCtx, dayLoadPercent: 85 });
  check("full day → prompt says quite full", full.includes("quite full"));

  check("prompt always carries the context JSON", heavy.includes("\"minutes\":90") && heavy.includes("Task A"));
}

done();
