import type { TodayItem } from "../lib/types";
import { setCompleted } from "../lib/tasks";
import { durationLabel, minutesBetween, timeLabel } from "../lib/dates";
import { Checkbox } from "./Checkbox";
import { CalendarIcon } from "./icons";

/**
 * The "now / next" spotlight (brief §5C): the current or next upcoming block,
 * large and friendly. Big, calm, answers "what now?". Works for a Daybook task
 * (checkable) or a read-only Google Calendar event.
 */
export function Spotlight({ item, now }: { item: TodayItem; now: Date }) {
  const start = item.start ? new Date(item.start) : null;
  const end =
    start && item.durationMinutes != null
      ? new Date(start.getTime() + item.durationMinutes * 60_000)
      : null;
  const isNow = !!(start && end && start <= now && now < end);
  const isGoogle = item.source === "google";

  // Live progress for the block in progress: elapsed fraction + minutes left.
  const total = start && end ? minutesBetween(start, end) : 0;
  const minsLeft = isNow && end ? Math.max(0, minutesBetween(now, end)) : 0;
  const progressPct = isNow && total > 0 ? Math.min(100, Math.max(0, ((total - minsLeft) / total) * 100)) : 0;

  return (
    <div className="surface mb-6 animate-fade-up border-l-[3px] border-l-accent bg-paper-card p-5 shadow-spotlight">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-accent">
        {isNow ? "Now" : "Next up"}
      </p>
      <div className="flex items-start gap-4">
        <div className="pt-1">
          {isGoogle ? (
            <span
              className="flex h-6 w-6 items-center justify-center text-muted"
              title="From Google Calendar"
            >
              <CalendarIcon className="h-5 w-5" />
            </span>
          ) : (
            <Checkbox
              checked={item.completed}
              onChange={(c) => setCompleted(item.id, c)}
              label={`Mark “${item.title}” done`}
            />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h2
            className={[
              "text-xl font-semibold leading-snug text-ink",
              item.completed ? "text-muted line-through" : "",
            ].join(" ")}
          >
            {item.title}
          </h2>
          <p className="mt-1.5 text-sm text-muted">
            {item.allDay ? (
              <span className="font-medium text-ink">All day</span>
            ) : (
              start && <span className="font-medium text-ink">{timeLabel(start)}</span>
            )}
            {item.durationMinutes != null && (
              <>
                <span className="mx-1.5 text-muted-soft">·</span>
                {durationLabel(item.durationMinutes)}
              </>
            )}
            {isGoogle && (
              <>
                <span className="mx-1.5 text-muted-soft">·</span>
                Google Calendar
              </>
            )}
          </p>

          {isNow && end && (
            <div className="mt-3.5">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-paper-edge">
                <div
                  className="h-full rounded-full bg-accent transition-all duration-500"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <p className="mt-1.5 text-xs text-muted">
                about <span className="font-medium text-ink">{minsLeft} min left</span>
                <span className="mx-1.5 text-muted-soft">—</span>
                ends {timeLabel(end)}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
