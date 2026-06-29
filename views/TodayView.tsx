"use client";
import { useMemo, useState } from "react";
import { useDayItems, usePastUndoneTasks, useSettings } from "../hooks/useDb";
import { IMPORTANCE_RANK, windowForDay } from "../lib/types";
import { addDays, dayLabel, format, isSameDay, startOfDay, timeLabel } from "../lib/dates";
import { buildDayShape, groupDay } from "../lib/dayShape";
import { DayFeed } from "../components/DayFeed";
import { LooseEndSuggestion } from "../components/LooseEndSuggestion";
import { DoneToday } from "../components/DoneToday";
import { Timeline } from "../components/overview/Timeline";

export function TodayView({ now }: { now: Date }) {
  // The day being viewed — defaults to today every time the app opens.
  const [day, setDay] = useState<Date>(() => startOfDay(now));
  const isToday = isSameDay(day, now);

  const settings = useSettings();
  const items = useDayItems(day);

  const dayWindow = useMemo(() => windowForDay(settings, day), [settings, day]);
  const shape = useMemo(
    () => buildDayShape(items, dayWindow, day, now, settings.defaultDurationMinutes),
    [items, dayWindow, day, now, settings.defaultDurationMinutes],
  );
  const groups = useMemo(() => groupDay(items, now), [items, now]);

  // Past, unchecked tasks that slipped (today only). A current in-progress block
  // is the spotlight, never a loose end. The one-at-a-time suggestion only nudges
  // when there's free time left in the day.
  const pastUndone = usePastUndoneTasks(now);
  const looseEnds = useMemo(
    () =>
      isToday
        ? pastUndone
            .filter((t) => t.id !== groups.spotlight?.id)
            .sort(
              (a, b) =>
                IMPORTANCE_RANK[b.importance] - IMPORTANCE_RANK[a.importance] ||
                new Date(a.scheduledStart!).getTime() - new Date(b.scheduledStart!).getTime(),
            )
        : [],
    [pastUndone, isToday, groups.spotlight],
  );
  const hasRoom = shape.remainingFreeMinutes > 0;

  const countLabel = useMemo(() => {
    if (items.length === 0) return null;
    if (!isToday) return `${items.length} thing${items.length === 1 ? "" : "s"}`;
    if (groups.toGoCount === 0) return "all done";
    const done = groups.doneCount > 0 ? `${groups.doneCount} done · ` : "";
    return `${done}${groups.toGoCount} to go`;
  }, [items.length, isToday, groups]);

  return (
    <section>
      <header className="mb-5 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold tracking-tight text-ink">{dayLabel(day)}</h1>
          <p className="mt-1 text-sm text-muted">{format(day, "EEEE, d MMMM")}</p>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {isToday && (
            <p className="text-sm font-semibold text-accent">{timeLabel(now)}</p>
          )}
          <div className="flex items-center gap-1">
            <DayNavButton label="Previous day" onClick={() => setDay((d) => addDays(d, -1))}>
              ‹
            </DayNavButton>
            {!isToday && (
              <button
                onClick={() => setDay(startOfDay(now))}
                className="rounded-full px-3 py-1.5 text-sm font-medium text-muted hover:text-ink"
              >
                Today
              </button>
            )}
            <DayNavButton label="Next day" onClick={() => setDay((d) => addDays(d, 1))}>
              ›
            </DayNavButton>
          </div>
          {countLabel && (
            <p className="text-xs font-medium uppercase tracking-wide text-muted-soft">
              {countLabel}
            </p>
          )}
        </div>
      </header>

      <Timeline shape={shape} now={now} isToday={isToday} />

      {items.length === 0 && isToday && (
        <p className="mb-6 text-sm text-muted">
          Nothing scheduled yet — tap the&nbsp;+&nbsp;or press&nbsp;
          <kbd className="rounded bg-paper-edge px-1.5 py-0.5 text-xs font-semibold">n</kbd> to fill
          your day.
        </p>
      )}

      <DayFeed groups={groups} now={now} />

      {isToday && hasRoom && <LooseEndSuggestion tasks={looseEnds} now={now} />}

      {isToday && <DoneToday items={items} now={now} />}

      {isToday &&
        items.length > 0 &&
        groups.toGoCount === 0 &&
        groups.upcoming.length === 0 &&
        looseEnds.length === 0 && (
          <div className="mt-6 text-center text-sm text-muted">You’re all done for today. ✦</div>
        )}
    </section>
  );
}

function DayNavButton({
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
