"use client";
import { useMemo } from "react";
import { motion } from "motion/react";
import { useAllTasks } from "../hooks/useDb";
import { computeStats, computeTagStats, RECENT_DAYS, type DayCount, type TagStat } from "../lib/stats";
import { compactDuration } from "../lib/dayShape";
import { format } from "../lib/dates";
import { StatsIcon } from "../components/icons";

/**
 * Stats — a calm read on how the work is actually going: days you've worked,
 * tasks done, deadlines met and missed, streaks, and a 2-week activity strip.
 * Everything is derived client-side from the full task list; no new endpoint.
 */
export function StatsView({ now }: { now: Date }) {
  const tasks = useAllTasks();
  const s = useMemo(() => computeStats(tasks, now), [tasks, now]);
  const tagStats = useMemo(() => computeTagStats(tasks), [tasks]);

  if (s.totalTasks === 0) {
    return (
      <section>
        <StatsHeader />
        <div className="rounded-2xl border border-dashed border-paper-edge bg-paper-deep/30 px-4 py-10 text-center">
          <StatsIcon className="mx-auto mb-3 h-8 w-8 text-muted-soft" />
          <p className="text-sm text-muted">
            No history yet. Complete a few tasks and your stats will fill in here.
          </p>
        </div>
      </section>
    );
  }

  const rate = Math.round(s.completionRate * 100);

  return (
    <section>
      <StatsHeader />

      {/* Headline numbers. */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard
          tone="accent"
          value={s.daysWorked}
          label={s.daysWorked === 1 ? "day worked" : "days worked"}
          hint="days you completed a task"
        />
        <StatCard
          tone="sage"
          value={s.completed}
          label={s.completed === 1 ? "task done" : "tasks done"}
          hint={`of ${s.totalTasks} captured`}
        />
        <StatCard
          tone={s.missedDeadlines > 0 ? "danger" : "neutral"}
          value={s.missedDeadlines}
          label="missed deadlines"
          hint={s.missedDeadlines > 0 ? "past due, still open" : "nothing overdue"}
        />
        <StatCard
          tone="gold"
          value={s.currentStreak}
          label="day streak"
          hint={s.longestStreak > 0 ? `best: ${s.longestStreak} day${s.longestStreak === 1 ? "" : "s"}` : "—"}
        />
      </div>

      {/* Completion rate. */}
      <div className="mt-3 rounded-2xl border border-paper-edge bg-paper-card p-4 shadow-card">
        <div className="mb-2 flex items-baseline justify-between">
          <p className="text-sm font-medium text-ink">Completion rate</p>
          <p className="font-display text-lg font-bold tabular-nums text-accent">{rate}%</p>
        </div>
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-paper-edge">
          <motion.div
            className="h-full rounded-full bg-accent"
            initial={{ width: 0 }}
            animate={{ width: `${rate}%` }}
            transition={{ type: "spring", stiffness: 120, damping: 20 }}
          />
        </div>
        <p className="mt-2 text-xs text-muted">
          {s.completed} of {s.totalTasks} tasks checked off
        </p>
      </div>

      {/* Recent activity. */}
      <ActivityStrip recent={s.recent} />

      {/* Per-tag breakdown. */}
      {tagStats.length > 0 && <TagBreakdown tags={tagStats} />}

      {/* Everything else. */}
      <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        <Tile value={s.completedThisWeek} label="done this week" />
        <Tile value={s.completedThisMonth} label="done this month" />
        <Tile value={s.longestStreak} label="longest streak" />
        <Tile value={s.onTime} label="on-time finishes" />
        <Tile value={s.late} label="finished late" />
        <Tile value={compactDuration(s.minutesInvested)} label="time invested" />
      </div>
    </section>
  );
}

function StatsHeader() {
  return (
    <header className="mb-5">
      <h1 className="text-3xl font-bold tracking-tight text-ink">Stats</h1>
      <p className="mt-1 text-[0.95rem] leading-relaxed text-muted">
        How the work is going — days worked, deadlines met, and the streak you’re on.
      </p>
    </header>
  );
}

type Tone = "accent" | "sage" | "gold" | "danger" | "neutral";

const TONE: Record<Tone, { card: string; value: string }> = {
  accent: { card: "border-accent/25 bg-accent-wash", value: "text-accent-soft" },
  sage: { card: "border-sage/30 bg-sage-wash", value: "text-sage-soft" },
  gold: { card: "border-gold/35 bg-gold-wash", value: "text-gold-soft" },
  danger: { card: "border-danger/30 bg-danger-wash", value: "text-danger-soft" },
  neutral: { card: "border-paper-edge bg-paper-card", value: "text-ink" },
};

function StatCard({
  tone,
  value,
  label,
  hint,
}: {
  tone: Tone;
  value: number | string;
  label: string;
  hint?: string;
}) {
  const t = TONE[tone];
  return (
    <div className={`rounded-2xl border p-4 shadow-card ${t.card}`}>
      <p className={`font-display text-4xl font-bold leading-none tabular-nums ${t.value}`}>{value}</p>
      <p className="mt-2 text-sm font-medium text-ink">{label}</p>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
    </div>
  );
}

function Tile({ value, label }: { value: number | string; label: string }) {
  return (
    <div className="rounded-xl border border-paper-edge bg-paper-card px-3 py-3 shadow-card">
      <p className="font-display text-2xl font-bold tabular-nums text-ink">{value}</p>
      <p className="mt-0.5 text-xs text-muted">{label}</p>
    </div>
  );
}

/** How many tags to show before collapsing the rest into a count. */
const MAX_TAGS = 10;

function TagBreakdown({ tags }: { tags: TagStat[] }) {
  const shown = tags.slice(0, MAX_TAGS);
  const hidden = tags.length - shown.length;
  const maxTotal = Math.max(1, ...tags.map((t) => t.total));

  return (
    <div className="mt-3 rounded-2xl border border-paper-edge bg-paper-card p-4 shadow-card">
      <div className="mb-3 flex items-baseline justify-between">
        <p className="text-sm font-medium text-ink">By tag</p>
        <p className="text-xs text-muted">
          <span className="font-medium text-ink">{tags.length}</span>{" "}
          {tags.length === 1 ? "tag" : "tags"}
        </p>
      </div>

      <div className="space-y-3">
        {shown.map((t, i) => {
          const rate = Math.round(t.completionRate * 100);
          return (
            <div key={t.tag}>
              <div className="mb-1 flex items-baseline justify-between gap-2">
                <span className="truncate text-sm font-medium text-ink">{t.tag}</span>
                <span className="shrink-0 text-xs tabular-nums text-muted">
                  {t.completed}/{t.total} done
                  {t.minutesInvested > 0 && (
                    <>
                      <span className="mx-1 text-muted-soft">·</span>
                      {compactDuration(t.minutesInvested)}
                    </>
                  )}
                </span>
              </div>
              {/* Bar length = share of your busiest tag; fill = how much is done. */}
              <div
                className="h-2 overflow-hidden rounded-full bg-paper-edge"
                style={{ width: `${Math.max(12, (t.total / maxTotal) * 100)}%` }}
                title={`${rate}% complete`}
              >
                <motion.div
                  className="h-full rounded-full bg-accent"
                  initial={{ width: 0 }}
                  animate={{ width: `${rate}%` }}
                  transition={{ type: "spring", stiffness: 120, damping: 20, delay: i * 0.03 }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {hidden > 0 && (
        <p className="mt-3 text-xs text-muted-soft">+{hidden} more {hidden === 1 ? "tag" : "tags"}</p>
      )}
    </div>
  );
}

function ActivityStrip({ recent }: { recent: DayCount[] }) {
  const max = Math.max(1, ...recent.map((d) => d.count));
  const total = recent.reduce((sum, d) => sum + d.count, 0);
  return (
    <div className="mt-3 rounded-2xl border border-paper-edge bg-paper-card p-4 shadow-card">
      <div className="mb-3 flex items-baseline justify-between">
        <p className="text-sm font-medium text-ink">Last {RECENT_DAYS} days</p>
        <p className="text-xs text-muted">
          <span className="font-medium text-ink">{total}</span> completed
        </p>
      </div>
      <div className="flex h-24 items-end gap-1.5">
        {recent.map((d, i) => {
          const isToday = i === recent.length - 1;
          const active = d.count > 0;
          return (
            <div
              key={d.day.toISOString()}
              className="relative flex h-full flex-1 items-end"
              title={`${format(d.day, "EEE d MMM")} · ${d.count} done`}
            >
              <motion.div
                className={`w-full rounded-t-[3px] ${
                  active ? (isToday ? "bg-accent" : "bg-accent/55") : "bg-paper-edge"
                }`}
                initial={{ height: 2 }}
                animate={{ height: active ? `${Math.max(12, (d.count / max) * 100)}%` : 3 }}
                transition={{ type: "spring", stiffness: 260, damping: 26, delay: i * 0.015 }}
                style={{ minHeight: 3 }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-1.5 flex justify-between text-[0.65rem] font-medium uppercase tracking-wide text-muted-soft">
        <span>{format(recent[0].day, "d MMM")}</span>
        <span>Today</span>
      </div>
    </div>
  );
}
