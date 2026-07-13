"use client";
import { useMemo, useState } from "react";
import { useDayItems, useInboxTasks, usePastUndoneTasks, useSettings } from "../hooks/useDb";
import { useFittingSuggestions } from "../hooks/useSuggestions";
import { windowForDay } from "../lib/types";
import type { Task } from "../lib/types";
import {
  addDays,
  dayLabel,
  durationLabel,
  format,
  isBefore,
  isSameDay,
  startOfDay,
  timeLabel,
} from "../lib/dates";
import { buildDayShape, groupDay } from "../lib/dayShape";
import { DayFeed } from "../components/DayFeed";
import { LooseEndSuggestion } from "../components/LooseEndSuggestion";
import { DoneToday } from "../components/DoneToday";
import { NewDateModal } from "../components/NewDateModal";
import { Timeline } from "../components/overview/Timeline";
import { openCapture, openEdit } from "../components/Capture";
import { dropTask } from "../lib/tasks";
import { FlagIcon, PlusIcon, TrashIcon } from "../components/icons";
import { Button } from "../components/ui/button";
import { Celebration } from "../components/Celebration";

/** You can browse at most this many days on either side of today. */
const DAY_RANGE = 7;

export function TodayView({ now }: { now: Date }) {
  // The day being viewed — defaults to today every time the app opens.
  const [day, setDay] = useState<Date>(() => startOfDay(now));
  const isToday = isSameDay(day, now);

  // Browsing is capped to ±7 days around today; the arrows disable at the edges.
  const today = useMemo(() => startOfDay(now), [now]);
  const minDay = useMemo(() => addDays(today, -DAY_RANGE), [today]);
  const maxDay = useMemo(() => addDays(today, DAY_RANGE), [today]);
  const atMin = day.getTime() <= minDay.getTime();
  const atMax = day.getTime() >= maxDay.getTime();
  const step = (delta: number) =>
    setDay((d) => {
      const next = addDays(d, delta);
      if (next.getTime() < minDay.getTime()) return minDay;
      if (next.getTime() > maxDay.getTime()) return maxDay;
      return next;
    });

  const settings = useSettings();
  const items = useDayItems(day);

  const dayWindow = useMemo(() => windowForDay(settings, day), [settings, day]);
  const shape = useMemo(
    () => buildDayShape(items, dayWindow, day, now, settings.defaultDurationMinutes),
    [items, dayWindow, day, now, settings.defaultDurationMinutes],
  );
  const groups = useMemo(() => groupDay(items, now), [items, now]);

  // "Got a little room?" — slipped tasks *and* unscheduled to-dos that actually
  // fit an open slot today, ordered by soonest-fit, then urgency, then
  // importance. The current spotlight is excluded so we never suggest it.
  const suggestions = useFittingSuggestions(now, groups.spotlight?.id);

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

  // To-dos whose due date already slipped — surfaced here too so they can't be
  // avoided by never opening the To-do screen. One tap to redate or let go.
  const overdueTodos = useMemo(() => {
    return inboxTodos
      .filter((t) => t.dueDate && isBefore(new Date(t.dueDate), today))
      .sort((a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime());
  }, [inboxTodos, today]);
  const [fixId, setFixId] = useState<string | null>(null);
  const fixTask = fixId ? overdueTodos.find((t) => t.id === fixId) ?? null : null;

  // The day is finished: it held real work and none of it is left. When the
  // to-do list and loose ends are empty too, that's the rare everything-clear
  // moment — the biggest (still calm) pop the app has.
  const looseEnds = usePastUndoneTasks(now);
  const dayDone =
    isToday &&
    items.length > 0 &&
    groups.toGoCount === 0 &&
    groups.upcoming.length === 0 &&
    suggestions.length === 0;
  const allClear = dayDone && inboxTodos.length === 0 && looseEnds.length === 0;

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
            <DayNavButton label="Previous day" onClick={() => step(-1)} disabled={atMin}>
              ‹
            </DayNavButton>
            {!isToday && (
              <Button
                variant="ghost"
                size="pill"
                onClick={() => setDay(today)}
                className="text-muted hover:text-ink"
              >
                Today
              </Button>
            )}
            <DayNavButton label="Next day" onClick={() => step(1)} disabled={atMax}>
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

      {isToday && overdueTodos.length > 0 && (
        <section className="mb-5 rounded-2xl border border-danger/30 bg-danger-wash/50 p-4">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-danger">
            <FlagIcon className="h-3.5 w-3.5" /> Overdue
          </p>
          <div className="space-y-1.5">
            {overdueTodos.map((t) => (
              <OverdueRow key={t.id} task={t} onNewDate={() => setFixId(t.id)} />
            ))}
          </div>
        </section>
      )}

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

      {isToday && <LooseEndSuggestion suggestions={suggestions} now={now} />}

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

      {fixTask && (
        <NewDateModal task={fixTask} kind="due" now={now} onClose={() => setFixId(null)} />
      )}
    </section>
  );
}

/** One slipped to-do: what it was, how it slipped, and the two ways out. */
function OverdueRow({ task, onNewDate }: { task: Task; onNewDate: () => void }) {
  return (
    <div className="rounded-xl border border-danger/25 bg-paper-card/70 px-3 py-2">
      <button
        type="button"
        onClick={() => openEdit(task.id)}
        className="flex w-full items-center gap-2.5 text-left text-sm"
      >
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-danger" />
        <span className="min-w-0 flex-1 truncate font-medium text-ink">{task.title}</span>
        <span className="shrink-0 text-xs text-muted">
          was due {dayLabel(new Date(task.dueDate!))}
        </span>
      </button>
      <div className="mt-1.5 flex items-center gap-2 pl-4">
        <Button size="sm" variant="secondary" onClick={onNewDate}>
          New due date
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="gap-1.5 text-muted hover:text-accent"
          onClick={() => dropTask(task.id)}
        >
          <TrashIcon className="h-3.5 w-3.5" />
          Let it go
        </Button>
      </div>
    </div>
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

function DayNavButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Button
      variant="outline"
      size="icon"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="text-lg leading-none text-muted hover:text-ink"
    >
      {children}
    </Button>
  );
}
