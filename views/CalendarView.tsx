"use client";
import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useDayItems, useInboxTasks, useMonthItems, useSettings } from "../hooks/useDb";
import { windowForDay } from "../lib/types";
import type { Task, TodayItem } from "../lib/types";
import {
  addMonths,
  dayLabel,
  durationLabel,
  format,
  isBefore,
  isSameDay,
  isSameMonth,
  isToday,
  monthGrid,
  startOfDay,
  startOfMonth,
} from "../lib/dates";
import { buildDayShape } from "../lib/dayShape";
import { TaskRow } from "../components/TaskRow";
import { Timeline } from "../components/overview/Timeline";
import { openCapture, openEdit } from "../components/Capture";
import { CalendarIcon, FlagIcon, PlusIcon } from "../components/icons";
import { Button } from "../components/ui/button";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function CalendarView({ now }: { now: Date }) {
  // The month being browsed, and the day whose schedule is shown below it.
  const [month, setMonth] = useState<Date>(() => startOfMonth(now));
  const [selected, setSelected] = useState<Date>(() => startOfDay(now));

  const weeks = useMemo(() => monthGrid(month), [month]);
  const { byDay } = useMonthItems(month);
  const isCurrentMonth = isSameMonth(month, now);

  // To-do deadlines (unscheduled tasks with a due date), bucketed by their due
  // day, so the calendar shows *when things are due*, not just what's scheduled.
  const todos = useInboxTasks();
  const dueByDay = useMemo(() => {
    const m = new Map<string, Task[]>();
    for (const t of todos) {
      if (!t.dueDate) continue;
      const k = startOfDay(new Date(t.dueDate)).toDateString();
      const list = m.get(k);
      if (list) list.push(t);
      else m.set(k, [t]);
    }
    return m;
  }, [todos]);

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
            <Button
              variant="ghost"
              size="pill"
              onClick={jumpToToday}
              className="text-muted hover:text-ink"
            >
              Today
            </Button>
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

        <motion.div
          key={month.toISOString()}
          className="grid grid-cols-7 gap-1"
          initial="hidden"
          animate="show"
          variants={{ hidden: {}, show: { transition: { staggerChildren: 0.012 } } }}
        >
          {weeks.flat().map((day) => (
            <DayCell
              key={day.toISOString()}
              day={day}
              items={byDay.get(day.toDateString()) ?? []}
              deadlines={(dueByDay.get(day.toDateString()) ?? []).length}
              inMonth={isSameMonth(day, month)}
              today={isToday(day)}
              selected={isSameDay(day, selected)}
              onSelect={() => setSelected(startOfDay(day))}
            />
          ))}
        </motion.div>
      </div>

      {/* Selected day's schedule — cross-fades as you pick different days */}
      <AnimatePresence mode="wait">
        <DayDetail
          key={selected.toDateString()}
          day={selected}
          now={now}
          dueTodos={dueByDay.get(selected.toDateString()) ?? []}
        />
      </AnimatePresence>
    </section>
  );
}

function DayCell({
  day,
  items,
  deadlines,
  inMonth,
  today,
  selected,
  onSelect,
}: {
  day: Date;
  items: TodayItem[];
  deadlines: number;
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

  const dueLabel = deadlines > 0 ? `, ${deadlines} due` : "";

  return (
    <motion.button
      type="button"
      onClick={onSelect}
      aria-label={`${format(day, "EEEE d MMMM")}${total ? `, ${total} item${total === 1 ? "" : "s"}` : ""}${dueLabel}`}
      aria-pressed={selected}
      variants={{
        hidden: { opacity: 0, y: 6, scale: 0.96 },
        show: { opacity: 1, y: 0, scale: 1 },
      }}
      whileHover={selected ? undefined : { scale: 1.07 }}
      whileTap={{ scale: 0.92 }}
      transition={{ type: "spring", stiffness: 480, damping: 30 }}
      className={[
        "relative flex aspect-square flex-col items-center justify-start rounded-xl px-1 pt-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-accent/45 transition-colors",
        selected
          ? "text-white"
          : today
            ? "bg-accent-wash text-ink hover:bg-accent/15"
            : inMonth
              ? "text-ink hover:bg-paper-edge/60"
              : "text-muted-soft hover:bg-paper-edge/40",
      ].join(" ")}
    >
      {/* The selection: a single pill that slides between days via layoutId. */}
      {selected && (
        <motion.span
          layoutId="calendar-selection"
          aria-hidden
          className="absolute inset-0 rounded-xl bg-accent shadow-accent"
          transition={{ type: "spring", stiffness: 520, damping: 34 }}
        />
      )}

      <span
        className={[
          "relative z-10 flex h-6 w-6 items-center justify-center rounded-full font-display text-[0.8rem] font-medium tabular-nums",
          today && !selected ? "font-bold text-accent" : "",
        ].join(" ")}
      >
        {format(day, "d")}
      </span>

      {/* Markers: scheduled-item dots (indigo/gold) + a deadline dot (terracotta)
          for any day something is *due*, shown on every day, selected or not. */}
      {(total > 0 || deadlines > 0) && (
        <span className="relative z-10 mt-0.5 flex items-center gap-0.5">
          {dots.map((c, i) => (
            <span
              key={i}
              className={`h-1.5 w-1.5 rounded-full ${selected ? "bg-white/80" : c}`}
            />
          ))}
          {deadlines > 0 && (
            <span
              title={`${deadlines} due`}
              className={`h-2 w-2 rounded-full ring-2 ${
                selected ? "bg-white ring-white/40" : "bg-red-500 ring-red-500/25"
              }`}
            />
          )}
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
    </motion.button>
  );
}

function DayDetail({ day, now, dueTodos }: { day: Date; now: Date; dueTodos: Task[] }) {
  const settings = useSettings();
  const items = useDayItems(day);
  const isViewingToday = isSameDay(day, now);
  const isPast = isBefore(day, startOfDay(now));

  const dayWindow = useMemo(() => windowForDay(settings, day), [settings, day]);
  const shape = useMemo(
    () => buildDayShape(items, dayWindow, day, now, settings.defaultDurationMinutes),
    [items, dayWindow, day, now, settings.defaultDurationMinutes],
  );

  const countLabel =
    items.length === 0 ? null : `${items.length} thing${items.length === 1 ? "" : "s"}`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
    >
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

      {dueTodos.length > 0 && <DeadlineList todos={dueTodos} />}

      {items.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-paper-edge bg-paper-deep/30 px-4 py-6 text-center text-sm text-muted">
          Nothing scheduled on this day.
        </p>
      ) : (
        <>
          <Timeline shape={shape} now={now} isToday={isViewingToday} />
          <DayAgenda items={items} />
        </>
      )}

      {/* Add to this specific day — but not into the past. A timed task or a
          to-do due on this day (the due date is pre-filled but still editable). */}
      {isPast ? (
        <p className="mt-4 text-xs text-muted-soft">This day has passed — nothing new to add here.</p>
      ) : (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="primary" onClick={() => openCapture({ day })}>
            <PlusIcon className="h-4 w-4" /> Schedule a task
          </Button>
          <Button variant="outline" onClick={() => openCapture({ inbox: true, dueDate: day })}>
            <PlusIcon className="h-4 w-4 text-accent" /> Add a to-do
          </Button>
        </div>
      )}
    </motion.div>
  );
}

/** To-dos whose deadline falls on the selected day — the "due here" list. */
function DeadlineList({ todos }: { todos: Task[] }) {
  return (
    <div className="mb-4">
      <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-red-600">
        <FlagIcon className="h-3.5 w-3.5" /> Due this day
      </p>
      <div className="space-y-1.5">
        {todos.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => openEdit(t.id)}
            className="flex w-full items-center gap-2.5 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-left text-sm transition-colors hover:border-red-500/50"
          >
            <span className="h-2 w-2 shrink-0 rounded-full bg-red-500" />
            <span className="min-w-0 flex-1 truncate font-medium text-ink">{t.title}</span>
            <span className="shrink-0 text-xs text-muted">{durationLabel(t.durationMinutes)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Every item on the selected day — timed tasks/events in time order plus any
 * all-day items — regardless of whether they're past, upcoming, or already
 * done. (Unlike the Today feed, this isn't relative to "now".)
 */
function DayAgenda({ items }: { items: TodayItem[] }) {
  const allDay = items.filter((i) => i.allDay);
  const timed = useMemo(
    () =>
      items
        .filter((i) => !i.allDay)
        .sort(
          (a, b) =>
            (a.start ? new Date(a.start).getTime() : 0) -
            (b.start ? new Date(b.start).getTime() : 0),
        ),
    [items],
  );

  return (
    <div>
      {allDay.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {allDay.map((item) => (
            <span
              key={item.id}
              className="inline-flex items-center gap-1.5 rounded-full bg-paper-edge/60 px-3 py-1 text-xs font-medium text-ink"
            >
              <CalendarIcon className="h-3.5 w-3.5 text-muted" />
              {item.title}
            </span>
          ))}
        </div>
      )}

      {timed.length > 0 && (
        <div className="space-y-2.5">
          <AnimatePresence initial={false}>
            {timed.map((item) => (
              <TaskRow key={item.id} item={item} />
            ))}
          </AnimatePresence>
        </div>
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
    <Button
      variant="outline"
      size="icon"
      onClick={onClick}
      aria-label={label}
      className="text-lg leading-none text-muted hover:text-ink"
    >
      {children}
    </Button>
  );
}
