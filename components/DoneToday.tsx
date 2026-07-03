"use client";
import type { TodayItem } from "../lib/types";
import { dropTask, setCompleted } from "../lib/tasks";
import { timeLabel } from "../lib/dates";
import { Checkbox } from "./Checkbox";
import { openEdit } from "./Capture";
import { ActionMenu } from "./ActionMenu";
import { CalendarIcon, EditIcon, TrashIcon } from "./icons";

/**
 * "Done today" — a calm record at the bottom of Today: tasks you checked off,
 * plus Google Calendar events read from your calendar (which the app can't
 * check, so they count once they've passed).
 *
 * Your own tasks keep a ticked checkbox you can un-tick to undo the completion,
 * and the title is a link that opens the editor. Google events are read-only.
 */
export function DoneToday({ items, now }: { items: TodayItem[]; now: Date }) {
  const done = items
    .filter((i) => {
      if (i.source === "lifeos") return i.completed;
      // Google external event: count it once it has happened.
      if (i.allDay) return true;
      const start = i.start ? new Date(i.start) : null;
      const end =
        start && i.durationMinutes != null
          ? new Date(start.getTime() + i.durationMinutes * 60_000)
          : start;
      return end ? end <= now : false;
    })
    .sort(
      (a, b) =>
        (a.start ? new Date(a.start).getTime() : 0) - (b.start ? new Date(b.start).getTime() : 0),
    );

  if (done.length === 0) return null;

  return (
    <section className="mt-8 border-t border-paper-edge pt-6">
      <div className="mb-3 flex items-baseline gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Done today</h2>
        <span className="text-xs font-semibold text-sage">{done.length}</span>
      </div>
      <div className="space-y-1">
        {done.map((i) => {
          const time =
            i.start && !i.allDay ? (
              <span className="shrink-0 text-xs text-muted-soft">
                {timeLabel(new Date(i.start))}
              </span>
            ) : null;

          // Your own tasks: an undo-able checkbox + an editable title. Google
          // events stay a read-only row with a calendar glyph.
          if (i.source === "lifeos") {
            return (
              <div
                key={i.id}
                className="group -mx-2 flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-paper-edge/40"
              >
                <Checkbox
                  checked
                  onChange={() => setCompleted(i.id, false)}
                  label={`Mark “${i.title}” not done`}
                />
                <button
                  type="button"
                  onClick={() => openEdit(i.id)}
                  aria-label={`Edit “${i.title}”`}
                  className="min-w-0 flex-1 truncate text-left text-muted line-through decoration-muted/40 transition-colors hover:text-ink"
                >
                  {i.title}
                </button>
                {time}
                <div className="shrink-0">
                  <ActionMenu
                    actions={[
                      {
                        label: "Edit",
                        icon: <EditIcon className="h-4 w-4" />,
                        onClick: () => openEdit(i.id),
                      },
                      {
                        label: "Delete",
                        icon: <TrashIcon className="h-4 w-4" />,
                        danger: true,
                        onClick: () => dropTask(i.id),
                      },
                    ]}
                  />
                </div>
              </div>
            );
          }

          return (
            <div key={i.id} className="flex items-center gap-2.5 px-2 py-1.5 text-sm">
              <CalendarIcon className="h-4 w-4 shrink-0 text-gold-soft" />
              <span className="truncate text-muted line-through decoration-muted/40">{i.title}</span>
              {time}
              <span className="shrink-0 text-xs text-muted-soft">· calendar</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
