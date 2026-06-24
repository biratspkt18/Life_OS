import type { TodayItem } from "../lib/types";
import { setCompleted } from "../lib/tasks";
import { durationLabel, timeLabel } from "../lib/dates";
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
        </div>
      </div>
    </div>
  );
}
