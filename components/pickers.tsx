import { useEffect, useRef, useState } from "react";
import { CalendarIcon } from "./icons";
import {
  DURATION_PRESETS,
  IMPORTANCE_LABEL,
  type Importance,
} from "../lib/types";
import {
  addMonths,
  durationLabel,
  format,
  isBefore,
  isSameDay,
  isSameMonth,
  monthGrid,
  startOfDay,
  startOfMonth,
} from "../lib/dates";

const IMPORTANCE_ORDER: Importance[] = ["high", "normal", "low"];

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

/**
 * A calendar month grid for picking a day. Past days (before `min`) are
 * disabled — Life OS never schedules into the past. Today and the selected
 * day are highlighted.
 */
export function DayCalendar({
  value,
  min,
  onSelect,
}: {
  value: Date;
  /** Earliest selectable day (inclusive); usually the start of today. */
  min: Date;
  onSelect: (day: Date) => void;
}) {
  const minDay = startOfDay(min);
  const [month, setMonth] = useState(() => startOfMonth(value));
  const weeks = monthGrid(month);

  return (
    <div className="w-[17rem] select-none">
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setMonth((m) => addMonths(m, -1))}
          disabled={isSameMonth(month, minDay) || isBefore(month, minDay)}
          className="btn-ghost h-8 w-8 rounded-lg p-0 text-base disabled:opacity-30"
          aria-label="Previous month"
        >
          ‹
        </button>
        <span className="text-sm font-semibold text-ink">{format(month, "MMMM yyyy")}</span>
        <button
          type="button"
          onClick={() => setMonth((m) => addMonths(m, 1))}
          className="btn-ghost h-8 w-8 rounded-lg p-0 text-base"
          aria-label="Next month"
        >
          ›
        </button>
      </div>

      <div className="mb-1 grid grid-cols-7 text-center text-[0.65rem] font-medium uppercase tracking-wide text-muted-soft">
        {WEEKDAYS.map((d, i) => (
          <span key={i} className="py-1">
            {d}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-0.5">
        {weeks.flat().map((day) => {
          const disabled = isBefore(day, minDay);
          const selected = isSameDay(day, value);
          const inMonth = isSameMonth(day, month);
          const today = isSameDay(day, minDay);
          return (
            <button
              key={day.toISOString()}
              type="button"
              disabled={disabled}
              onClick={() => onSelect(startOfDay(day))}
              className={[
                "flex h-9 items-center justify-center rounded-lg text-sm transition-colors",
                selected
                  ? "bg-accent font-semibold text-paper"
                  : disabled
                    ? "cursor-not-allowed text-muted-soft/50"
                    : inMonth
                      ? "text-ink hover:bg-accent-wash"
                      : "text-muted-soft hover:bg-paper-edge/50",
                today && !selected ? "font-semibold text-accent ring-1 ring-inset ring-accent/40" : "",
              ].join(" ")}
              aria-label={format(day, "EEEE d MMMM yyyy")}
              aria-current={today ? "date" : undefined}
            >
              {day.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** A button that opens a `DayCalendar` in a popover, closing on outside click. */
export function DayPickerButton({
  value,
  min,
  label,
  onSelect,
}: {
  value: Date;
  min: Date;
  label: string;
  onSelect: (day: Date) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
      }
    }
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`inline-flex items-center gap-2 rounded-xl border bg-paper-card px-3 py-2 text-base font-medium text-ink transition-colors hover:border-muted-soft ${
          open ? "border-accent/40" : "border-paper-edge"
        }`}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <CalendarIcon className="h-4 w-4 shrink-0 text-muted" />
        {label}
      </button>
      {open && (
        <div className="surface absolute bottom-full left-0 z-50 mb-2 animate-scale-in p-3 shadow-lift">
          <DayCalendar
            value={value}
            min={min}
            onSelect={(d) => {
              onSelect(d);
              setOpen(false);
            }}
          />
        </div>
      )}
    </div>
  );
}

export function ImportancePicker({
  value,
  onChange,
}: {
  value: Importance;
  onChange: (v: Importance) => void;
}) {
  return (
    <div className="flex gap-2">
      {IMPORTANCE_ORDER.map((imp) => (
        <button
          key={imp}
          type="button"
          onClick={() => onChange(imp)}
          className={`chip ${value === imp ? "chip-active" : ""}`}
        >
          {imp === "high" && (
            <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-accent align-middle" />
          )}
          {IMPORTANCE_LABEL[imp]}
        </button>
      ))}
    </div>
  );
}

export function DurationPicker({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  const presets = DURATION_PRESETS as readonly number[];
  const isPreset = presets.includes(value);
  return (
    <div className="flex flex-wrap items-center gap-2">
      {presets.map((d) => (
        <button
          key={d}
          type="button"
          onClick={() => onChange(d)}
          className={`chip ${value === d ? "chip-active" : ""}`}
        >
          {durationLabel(d)}
        </button>
      ))}
      <label className={`chip flex items-center gap-1.5 ${!isPreset ? "chip-active" : ""}`}>
        <input
          type="number"
          min={5}
          max={480}
          step={5}
          value={value}
          onChange={(e) => {
            const n = parseInt(e.target.value, 10);
            if (!Number.isNaN(n)) onChange(Math.min(480, Math.max(5, n)));
          }}
          className="w-12 bg-transparent text-center outline-none"
          aria-label="Custom duration in minutes"
        />
        min
      </label>
    </div>
  );
}

/** A subtle importance mark for a row — accent dot for high, faint for low. */
export function ImportanceMark({ importance }: { importance: Importance }) {
  if (importance === "high") {
    return (
      <span
        title="Important"
        className="inline-block h-2 w-2 shrink-0 rounded-full bg-accent"
      />
    );
  }
  if (importance === "low") {
    return (
      <span
        title="Light"
        className="inline-block h-2 w-2 shrink-0 rounded-full border border-muted-soft"
      />
    );
  }
  return <span className="inline-block h-2 w-2 shrink-0" />;
}
