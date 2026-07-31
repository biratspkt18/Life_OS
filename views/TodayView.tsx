"use client";
import { useMemo, useState } from "react";
import { useDayItems, useInboxTasks, usePastUndoneTasks, useSettings } from "../hooks/useDb";
import { useEnergyLane } from "../hooks/useEnergyLane";
import { useGapSuggestion } from "../hooks/useGapSuggestion";
import { useWindowException } from "../hooks/useWindowException";
import { EnergyLaneToggle } from "../components/EnergyLaneToggle";
import { DayEdgePrompt } from "../components/DayEdgePrompt";
import {
  dayKeyOf,
  effectiveWindowForDay,
  getEdgePromptRaw,
  markPromptAsked,
  setEdgePromptRaw,
  shouldPromptEdge,
  type EdgeSide,
} from "../lib/effectiveWindow";
import type { Task } from "../lib/types";
import { dayLabel, durationLabel, format, isSameDay, startOfDay } from "../lib/dates";
import { buildDayShape, groupDay } from "../lib/dayShape";
import { computeDayBattery } from "../lib/battery";
import { DayIntensity } from "../components/DayIntensity";
import { DayFeed } from "../components/DayFeed";
import { GapSuggestionCard } from "../components/GapSuggestionCard";
import { DoneToday } from "../components/DoneToday";
import { Timeline } from "../components/overview/Timeline";
import { openCapture, openEdit } from "../components/Capture";
import { FlagIcon, PlusIcon } from "../components/icons";
import { Button } from "../components/ui/button";
import { Celebration } from "../components/Celebration";

export function TodayView({ now }: { now: Date }) {
  // The homepage always shows today — no day browsing here.
  const [day] = useState<Date>(() => startOfDay(now));
  const isToday = isSameDay(day, now);

  const settings = useSettings();
  const items = useDayItems(day);

  // The day's *effective* window: per-weekday settings plus today's one-day
  // exception ("started early today"), if any. Everything downstream — shape,
  // battery capacity, gap suggestions — reads this.
  const { exception } = useWindowException();
  const dayWindow = useMemo(
    () => effectiveWindowForDay(settings, day, exception),
    [settings, day, exception],
  );
  const shape = useMemo(
    () =>
      buildDayShape(items, dayWindow, day, now, settings.defaultDurationMinutes, {
        extendToNow: isToday,
      }),
    [items, dayWindow, day, now, settings.defaultDurationMinutes, isToday],
  );
  const groups = useMemo(() => groupDay(items, now), [items, now]);

  // The day's intensity — how heavy the day as built is (duration × energy over
  // the window's capacity). A mirror only; capacity follows the day's window.
  const intensity = useMemo(
    () => computeDayBattery(items, dayWindow, day, settings.defaultDurationMinutes),
    [items, dayWindow, day, settings.defaultDurationMinutes],
  );

  // The energy lane — "how I'm feeling right now". Device-scoped, resets each
  // day, and narrows only the suggestion card's candidate pool below; it never
  // hides or moves scheduled blocks.
  const { lane, setLane } = useEnergyLane(now);

  // "Got a little room?" — the current open gap in today's schedule, plus the
  // one slipped task or to-do best suited to fill it (deterministic pick shown
  // instantly, AI re-rank + reason swapped in when it lands). The current
  // spotlight is excluded so we never suggest it.
  const gapSuggestion = useGapSuggestion(now, items, day, groups.spotlight?.id, {
    lane: isToday ? lane : null,
    window: dayWindow,
    dayLoadPercent: intensity.percent ?? undefined,
  });

  // "Start earlier / end later?" — offered after a task lands outside the
  // window, at most once per side per day (a "No" also counts as asked).
  const [edgePrompt, setEdgePrompt] = useState<{
    side: EdgeSide;
    taskStart: Date;
    taskEnd: Date;
  } | null>(null);
  const handleOutsideCommit = (info: { side: EdgeSide; taskStart: Date; taskEnd: Date }) => {
    const key = dayKeyOf(now);
    if (!shouldPromptEdge(getEdgePromptRaw(), key, info.side)) return;
    setEdgePromptRaw(markPromptAsked(getEdgePromptRaw(), key, info.side));
    setEdgePrompt(info);
  };

  // Unscheduled to-dos whose deadline (or preferred date) lands on today, so the
  // Today view surfaces what's actually due — the section hides when there's none.
  const inboxTodos = useInboxTasks();
  const dueToday = useMemo(() => {
    const key = startOfDay(now).getTime();
    const onToday = (iso: string | null) =>
      iso != null && startOfDay(new Date(iso)).getTime() === key;
    return inboxTodos
      .filter((t) => onToday(t.dueDate) || onToday(t.preferredDate))
      .map((t) => ({ task: t, due: onToday(t.dueDate) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inboxTodos, startOfDay(now).getTime()]);

  // The day is finished: it held real work and none of it is left. When the
  // to-do list and loose ends are empty too, that's the rare everything-clear
  // moment — the biggest (still calm) pop the app has.
  const looseEnds = usePastUndoneTasks(now);
  const dayDone =
    isToday &&
    items.length > 0 &&
    groups.toGoCount === 0 &&
    groups.upcoming.length === 0 &&
    // A dismissed suggestion still counts — "Not now" shouldn't fake the
    // celebration while something genuinely fits the remaining room.
    !gapSuggestion.hasCandidates;
  const allClear = dayDone && inboxTodos.length === 0 && looseEnds.length === 0;

  return (
    <section>
      <header className="mb-5 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold tracking-tight text-ink">{dayLabel(day)}</h1>
          <p className="mt-1 text-sm text-muted">{format(day, "EEEE, d MMMM")}</p>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <DayIntensity intensity={intensity} />
        </div>
      </header>

      {isToday && (
        <div className="mb-3 flex items-center justify-end gap-2">
          <span className="text-xs text-muted-soft">Feeling</span>
          <EnergyLaneToggle lane={lane} onChange={setLane} />
        </div>
      )}

      <Timeline
        shape={shape}
        now={now}
        isToday={isToday}
        onOutsideCommit={isToday ? handleOutsideCommit : undefined}
      />

      {edgePrompt && (
        <DayEdgePrompt
          side={edgePrompt.side}
          taskStart={edgePrompt.taskStart}
          taskEnd={edgePrompt.taskEnd}
          day={day}
          onClose={() => setEdgePrompt(null)}
        />
      )}

      <div className="mb-5 mt-5 grid grid-cols-2 gap-2">
        <Button
          variant="dashed"
          onClick={() => openCapture({ day })}
          className="h-auto rounded-2xl py-3"
        >
          <PlusIcon className="h-4 w-4" />
          Add a task
        </Button>
        <Button
          variant="dashed"
          onClick={() => openCapture({ inbox: true })}
          className="h-auto rounded-2xl py-3"
        >
          <PlusIcon className="h-4 w-4" />
          Add a to-do
        </Button>
      </div>

      {isToday && dueToday.length > 0 && (
        <section className="mb-5 rounded-2xl border border-danger/30 bg-danger-wash/50 p-4">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-danger">
            <FlagIcon className="h-3.5 w-3.5" /> Due today
          </p>
          <div className="space-y-1.5">
            {dueToday.map(({ task, due }) => (
              <DueRow key={task.id} task={task} due={due} />
            ))}
          </div>
        </section>
      )}

      {items.length === 0 && isToday && (
        <p className="mb-6 text-sm text-muted">
          Nothing scheduled yet — use&nbsp;
          <span className="font-medium text-accent">Add a task</span> above, or press&nbsp;
          <kbd className="rounded bg-paper-edge px-1.5 py-0.5 text-xs font-semibold">n</kbd>.
        </p>
      )}

      <DayFeed groups={groups} now={now} />

      {isToday && <GapSuggestionCard s={gapSuggestion} />}

      {isToday && <DoneToday items={items} now={now} />}

      {allClear ? (
        <Celebration
          className="mt-6"
          big
          pop
          title="Completely clear."
          sub="Today’s done, the list is empty, nothing slipped past. Right now you owe the day nothing."
        />
      ) : dayDone ? (
        <Celebration
          className="mt-6"
          pop
          title="That’s the day, done."
          sub={
            now.getHours() >= 17
              ? "Every block checked off. Enjoy your evening."
              : "Every block checked off — the rest of the day is yours."
          }
        />
      ) : null}
    </section>
  );
}

/** One to-do whose deadline (or preferred date) is today. Click to edit. */
function DueRow({ task, due }: { task: Task; due: boolean }) {
  return (
    <button
      type="button"
      onClick={() => openEdit(task.id)}
      className="flex w-full items-center gap-2.5 rounded-xl border border-danger/25 bg-paper-card/70 px-3 py-2 text-left text-sm transition-colors hover:border-danger/50"
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-danger" />
      <span className="min-w-0 flex-1 truncate font-medium text-ink">{task.title}</span>
      <span className="shrink-0 text-xs text-muted">
        {due ? "due" : "prefer"}
        <span className="mx-1 text-muted-soft">·</span>
        {durationLabel(task.durationMinutes)}
      </span>
    </button>
  );
}
