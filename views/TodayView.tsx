import { useMemo } from "react";
import { useTodayItems } from "../hooks/useDb";
import type { TodayItem } from "../lib/types";
import { format } from "../lib/dates";
import { Spotlight } from "../components/Spotlight";
import { TaskRow } from "../components/TaskRow";

/** Pick the now/next spotlight: a current block, else the next upcoming one. */
function pickSpotlight(items: TodayItem[], now: Date): TodayItem | null {
  const live = items.filter((t) => !t.completed && t.start && !t.allDay);
  const current = live.find((t) => {
    const s = new Date(t.start!);
    const end =
      t.durationMinutes != null ? new Date(s.getTime() + t.durationMinutes * 60_000) : null;
    return end ? s <= now && now < end : false;
  });
  if (current) return current;
  const upcoming = live
    .filter((t) => new Date(t.start!) >= now)
    .sort((a, b) => new Date(a.start!).getTime() - new Date(b.start!).getTime());
  return upcoming[0] ?? null;
}

export function TodayView({ now }: { now: Date }) {
  const items = useTodayItems(now);
  const spotlight = useMemo(() => pickSpotlight(items, now), [items, now]);
  const rest = useMemo(
    () => items.filter((t) => t.id !== spotlight?.id),
    [items, spotlight],
  );

  // "Things ahead" counts open Daybook tasks (Google events aren't completable).
  const remaining = items.filter((t) => t.source === "daybook" && !t.completed).length;

  return (
    <section>
      <header className="mb-5">
        <h1 className="text-2xl font-bold tracking-tight text-ink">Today</h1>
        <p className="mt-0.5 text-sm text-muted">
          {format(now, "EEEE, d MMMM")}
          {items.length > 0 && (
            <>
              <span className="mx-1.5 text-muted-soft">·</span>
              {remaining === 0
                ? "all done"
                : `${remaining} thing${remaining === 1 ? "" : "s"} ahead`}
            </>
          )}
        </p>
      </header>

      {spotlight && <Spotlight item={spotlight} now={now} />}

      {rest.length > 0 && (
        <div className="space-y-2.5">
          {rest.map((t) => (
            <TaskRow key={t.id} item={t} />
          ))}
        </div>
      )}

      {items.length === 0 && (
        <div className="surface mt-2 px-6 py-12 text-center">
          <p className="text-lg font-medium text-ink">Nothing scheduled</p>
          <p className="mt-1 text-sm text-muted">
            Jot something down — tap the&nbsp;+&nbsp;or press&nbsp;
            <kbd className="rounded bg-paper-edge px-1.5 py-0.5 text-xs font-semibold">n</kbd>.
          </p>
        </div>
      )}

      {items.length > 0 && remaining === 0 && (
        <div className="mt-5 text-center text-sm text-muted">
          That's everything for today. Nice.
        </div>
      )}
    </section>
  );
}
