"use client";
import { dayLabel, timeLabel } from "../lib/dates";

/**
 * Lets the user pick a concrete free time for a task from the openings the app
 * found (grouped by day). The app proposes the slots; the user decides which.
 */
export function SlotPicker({
  slots,
  onPick,
  onCancel,
}: {
  slots: Date[];
  onPick: (start: Date) => void;
  onCancel?: () => void;
}) {
  if (slots.length === 0) {
    return (
      <div className="text-xs text-muted">
        No free time in the next week — try a shorter block or free something up.
        {onCancel && (
          <button onClick={onCancel} className="ml-2 font-medium text-accent hover:text-accent-soft">
            back
          </button>
        )}
      </div>
    );
  }

  // Group consecutive slots by day.
  const groups: { key: string; day: Date; slots: Date[] }[] = [];
  for (const s of slots) {
    const key = s.toDateString();
    let g = groups.find((x) => x.key === key);
    if (!g) {
      g = { key, day: s, slots: [] };
      groups.push(g);
    }
    g.slots.push(s);
  }

  return (
    <div className="space-y-2">
      {groups.map((g) => (
        <div key={g.key}>
          <p className="mb-1 text-[0.7rem] font-semibold uppercase tracking-wide text-muted-soft">
            {dayLabel(g.day)}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {g.slots.map((s) => (
              <button
                key={s.toISOString()}
                onClick={() => onPick(s)}
                className="rounded-lg border border-paper-edge bg-paper-card px-2.5 py-1 text-xs font-medium tabular-nums text-ink transition-colors hover:border-accent/50 hover:bg-accent-wash"
              >
                {timeLabel(s)}
              </button>
            ))}
          </div>
        </div>
      ))}
      {onCancel && (
        <button onClick={onCancel} className="text-xs text-muted-soft hover:text-ink">
          cancel
        </button>
      )}
    </div>
  );
}
