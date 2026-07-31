import { buildDayShape } from "../lib/dayShape";
import type { DayWindow } from "../lib/types";

import { harness } from "./_harness.mts";

const { check, done } = harness("dayShape");

const WINDOW: DayWindow = {
  enabled: true,
  dayWindowStart: "08:00",
  dayWindowEnd: "20:00",
  primeStart: "09:00",
  primeEnd: "12:00",
};
const DAY = new Date(2026, 6, 29);
const at = (h: number, m = 0) => new Date(2026, 6, 29, h, m);
const hhmm = (d: Date) =>
  `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

// Times are local; the bar's hour edges must land on the local :00 mark, not
// a UTC boundary — this is the regression guard for the half-hour-offset-zone
// bug (barStart/barEnd drifting to :30 in e.g. UTC+9:30).

{
  const s = buildDayShape([], WINDOW, DAY, at(6, 30), 30, { extendToNow: true });
  check("before window → extendedBefore only", s.extendedBefore && !s.extendedAfter);
  check("barStart floors to LOCAL hour 06:00", hhmm(s.barStart) === "06:00", hhmm(s.barStart));
  check("barStart on the :00 mark", s.barStart.getMinutes() === 0 && s.barStart.getSeconds() === 0);
  check("barEnd stays window end 20:00", hhmm(s.barEnd) === "20:00");
  check("barMinutes = 06:00→20:00 = 840", s.barMinutes === 840, `${s.barMinutes}`);
}

{
  const s = buildDayShape([], WINDOW, DAY, at(21, 0), 30, { extendToNow: true });
  check("after window → extendedAfter only", s.extendedAfter && !s.extendedBefore);
  check("barEnd ceils to LOCAL hour 22:00 (now+1h)", hhmm(s.barEnd) === "22:00", hhmm(s.barEnd));
  check("barEnd on the :00 mark", s.barEnd.getMinutes() === 0);
}

{
  // now exactly on the hour before the window: floor = that hour (room to windowStart remains).
  const s = buildDayShape([], WINDOW, DAY, at(7, 0), 30, { extendToNow: true });
  check("now on the hour → barStart = 07:00", hhmm(s.barStart) === "07:00");
}

{
  // Late enough that ceil(now+1h) would pass midnight → capped at midnight.
  const s = buildDayShape([], WINDOW, DAY, at(23, 40), 30, { extendToNow: true });
  check("barEnd capped at next midnight", s.barEnd.getTime() === new Date(2026, 6, 30).getTime(), hhmm(s.barEnd));
}

{
  const inside = buildDayShape([], WINDOW, DAY, at(12, 0), 30, { extendToNow: true });
  check("inside window → no extension", !inside.extendedBefore && !inside.extendedAfter);
  check("inside → bar equals window", inside.barMinutes === inside.windowMinutes);

  const noExt = buildDayShape([], WINDOW, DAY, at(6, 30), 30);
  check("extendToNow off → never extends", !noExt.extendedBefore && !noExt.extendedAfter);
  check("off → bar equals window exactly", noExt.barStart.getTime() === noExt.windowStart.getTime() && noExt.barEnd.getTime() === noExt.windowEnd.getTime());
}

{
  // Booked/free stay window-based even when the bar is extended.
  const item = {
    id: "x",
    title: "x",
    start: at(9, 0).toISOString(),
    durationMinutes: 60,
    importance: "normal" as const,
    completed: false,
    allDay: false,
    source: "lifeos" as const,
    energy: null,
  };
  const s = buildDayShape([item], WINDOW, DAY, at(6, 30), 30, { extendToNow: true });
  check("bookedMinutes window-based (60)", s.bookedMinutes === 60);
  check("freeMinutes window-based (660)", s.freeMinutes === 660);
  // 09:00 sits 180 min into an 840-min bar → 21.43%.
  check("block startPct is bar-relative", Math.abs(s.blocks[0].startPct - (180 / 840) * 100) < 0.5, `${s.blocks[0].startPct}`);
}

done();
