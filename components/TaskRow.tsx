import type { TodayItem } from "../lib/types";
import { setCompleted } from "../lib/tasks";
import { durationLabel, timeLabel } from "../lib/dates";
import { Checkbox } from "./Checkbox";
import { ImportanceMark } from "./pickers";
import { CalendarIcon } from "./icons";

/**
 * One row in the day list. A Daybook task gets a checkbox (checking = the only
 * way to complete) and importance mark; an event pulled from Google Calendar is
 * read-only, marked with a small calendar glyph.
 */
export function TaskRow({ item }: { item: TodayItem }) {
  const start = item.start ? new Date(item.start) : null;
  const isGoogle = item.source === "google";

  return (
    <div
      className={[
        "surface flex items-center gap-3.5 px-4 py-3.5 transition-all duration-300",
        item.completed ? "opacity-55" : "",
        item.importance === "high" && !item.completed
          ? "border-l-[3px] border-l-accent"
          : "",
      ].join(" ")}
    >
      {isGoogle ? (
        <span
          className="flex h-5 w-5 shrink-0 items-center justify-center text-muted"
          title="From Google Calendar"
        >
          <CalendarIcon className="h-4 w-4" />
        </span>
      ) : (
        <Checkbox
          checked={item.completed}
          onChange={(c) => setCompleted(item.id, c)}
          label={`Mark “${item.title}” ${item.completed ? "not done" : "done"}`}
        />
      )}

      <div className="min-w-0 flex-1">
        <p
          className={[
            "truncate text-[0.98rem] text-ink transition-all duration-300",
            item.completed ? "text-muted line-through decoration-muted/60" : "",
          ].join(" ")}
        >
          {item.title}
        </p>
        <p className="mt-0.5 flex items-center gap-2 text-xs text-muted">
          {item.allDay ? <span>All day</span> : start && <span>{timeLabel(start)}</span>}
          {item.durationMinutes != null && (
            <>
              <span className="text-muted-soft">·</span>
              <span>{durationLabel(item.durationMinutes)}</span>
            </>
          )}
          {isGoogle && (
            <>
              <span className="text-muted-soft">·</span>
              <span>Google Calendar</span>
            </>
          )}
        </p>
      </div>

      {!isGoogle && item.importance && <ImportanceMark importance={item.importance} />}
    </div>
  );
}
