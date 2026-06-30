"use client";
import { useMemo, useState } from "react";
import { useDayItems, useMonthItems, useSettings } from "../hooks/useDb";
import { windowForDay } from "../lib/types";
import type { TodayItem } from "../lib/types";
import {
  addMonths,
  dayLabel,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  monthGrid,
  startOfDay,
  startOfMonth,
} from "../lib/dates";
import { buildDayShape, groupDay } from "../lib/dayShape";
import { DayFeed } from "../components/DayFeed";
import { Timeline } from "../components/overview/Timeline";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function CalendarView({ now }: { now: Date }) {
  // The month being browsed, and the day whose schedule is shown below it.
  const [month, setMonth] = useState<Date>(() => startOfMonth(now));
  const [selected, setSelected] = useState<Date>(() => startOfDay(now));

  const weeks = useMemo(() => monthGrid(month), [month]);
  const { byDay } = useMonthItems(month);
  const isCurrentMonth = isSameMonth(month, now);

  function go(delta: number) {
    setMonth((m) => startOfMonth(addMonths(m, delta)));
  }
  function jumpToToday() {
    setMonth(startOfMonth(now));
    setSelected(startOfDay(now));
  }

  return (
    <section>
      <header className="mb-5 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-3xl font-bold tracking-tight text-ink">
            {format(month, "MMMM")}
          </h1>
          <p className="mt-1 text-sm text-muted">{format(month, "yyyy")}</p>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <MonthNavButton label="Previous month" onClick={() => go(-1)}>
            ‹
          </MonthNavButton>
          {!isCurrentMonth && (
            <button
              onClick={jumpToToday}
              className="rounded-full px-3 py-1.5 text-sm font-medium text-muted hover:text-ink"
            >
              Today
            </button>
          )}
          <MonthNavButton label="Next month" onClick={() => go(1)}>
            ›
          </MonthNavButton>
        </div>
      </header>

      {/* Month grid */}
      <div className="mb-7">
        <div className="mb-2 grid grid-cols-7">
          {WEEKDAYS.map((d) => (
            <div
              key={d}
              className="py-2.5 text-center text-xs font-bold uppercase tracking-wider text-muted"
            >
              {d}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {weeks.flat().map((day) => (
            <DayCell
              key={day.toISOString()}
              day={day}
              items={byDay.get(day.toDateString()) ?? []}
              inMonth={isSameMonth(day, month)}
              today={isToday(day)}
              selected={isSameDay(day, selected)}
              onSelect={() => setSelected(startOfDay(day))}
            />
          ))}
        </div>
      </div>

      {/* Selected day's schedule */}
      <DayDetail day={selected} now={now} />
    </section>
  );
}

function DayCell({
  day,
  items,
  inMonth,
  today,
  selected,
  onSelect,
}: {
  day: Date;
  items: TodayItem[];
  inMonth: boolean;
  today: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  // A day's "weight": how much is on it, shown as up to three dots coloured by
  // source — indigo for Life OS tasks, gold for events synced from Google.
  const lifeos = items.filter((i) => i.source === "lifeos").length;
  const google = items.filter((i) => i.source === "google").length;
  const total = lifeos + google;

  const dots: string[] = [];
  for (let i = 0; i < Math.min(lifeos, 3); i++) dots.push("bg-accent");
  for (let i = 0; i < Math.min(google, 3 - dots.length); i++) dots.push("bg-gold");

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-label={`${format(day, "EEEE d MMMM")}${total ? `, ${total} item${total === 1 ? "" : "s"}` : ""}`}
      aria-pressed={selected}
      className={[
        "relative flex aspect-square flex-col items-center justify-start rounded-xl px-1 pt-1.5 text-sm transition-colors",
        selected
          ? "bg-accent text-white shadow-accent"
          : today
            ? "bg-accent-wash text-ink hover:bg-accent/15"
            : inMonth
              ? "text-ink hover:bg-paper-edge/60"
              : "text-muted-soft hover:bg-paper-edge/40",
      ].join(" ")}
    >
      <span
        className={[
          "flex h-6 w-6 items-center justify-center rounded-full font-display text-[0.8rem] font-medium tabular-nums",
          today && !selected ? "font-bold text-accent" : "",
        ].join(" ")}
      >
        {format(day, "d")}
      </span>

      {/* Item dots */}
      {total > 0 && (
        <span className="mt-0.5 flex items-center gap-0.5">
          {dots.map((c, i) => (
            <span
              key={i}
              className={`h-1.5 w-1.5 rounded-full ${selected ? "bg-white/80" : c}`}
            />
          ))}
          {total > 3 && (
            <span
              className={`text-[0.6rem] font-semibold leading-none ${
                selected ? "text-white/80" : "text-muted-soft"
              }`}
            >
              +{total - 3}
            </span>
          )}
        </span>
      )}
    </button>
  );
}

function DayDetail({ day, now }: { day: Date; now: Date }) {
  const settings = useSettings();
  const items = useDayItems(day);
  const isViewingToday = isSameDay(day, now);

  const dayWindow = useMemo(() => windowForDay(settings, day), [settings, day]);
  const shape = useMemo(
    () => buildDayShape(items, dayWindow, day, now, settings.defaultDurationMinutes),
    [items, dayWindow, day, now, settings.defaultDurationMinutes],
  );
  const groups = useMemo(() => groupDay(items, now), [items, now]);

  const countLabel =
    items.length === 0 ? null : `${items.length} thing${items.length === 1 ? "" : "s"}`;

  return (
    <div className="animate-fade-up">
      <header className="mb-4 flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl font-bold tracking-tight text-ink">{dayLabel(day)}</h2>
          <p className="mt-0.5 text-sm text-muted">{format(day, "EEEE, d MMMM")}</p>
        </div>
        {countLabel && (
          <p className="shrink-0 text-xs font-medium uppercase tracking-wide text-muted-soft">
            {countLabel}
          </p>
        )}
      </header>

      {items.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-paper-edge bg-paper-deep/30 px-4 py-6 text-center text-sm text-muted">
          Nothing scheduled on this day.
        </p>
      ) : (
        <>
          <Timeline shape={shape} now={now} isToday={isViewingToday} />
          <DayFeed groups={groups} now={now} />
        </>
      )}
    </div>
  );
}

function MonthNavButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="flex h-8 w-8 items-center justify-center rounded-full border border-paper-edge bg-paper-card text-lg leading-none text-muted transition-colors hover:text-ink"
    >
      {children}
    </button>
  );
}
