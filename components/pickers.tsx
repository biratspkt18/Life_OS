import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { CalendarIcon } from "./icons";
import { IMPORTANCE_LABEL, type Importance } from "../lib/types";
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
  max,
  onSelect,
}: {
  value: Date;
  /** Earliest selectable day (inclusive); usually the start of today. */
  min: Date;
  /** Latest selectable day (inclusive), if any. */
  max?: Date;
  onSelect: (day: Date) => void;
}) {
  const minDay = startOfDay(min);
  const maxDay = max ? startOfDay(max) : null;
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
          const disabled =
            isBefore(day, minDay) || (maxDay != null && isBefore(maxDay, day));
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
  max,
  label,
  onSelect,
}: {
  value: Date;
  min: Date;
  max?: Date;
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
            max={max}
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

/** The two quick presets; everything else is set on the custom wheels. */
const DURATION_QUICK = [30, 60] as const;
const HOUR_OPTIONS = Array.from({ length: 9 }, (_, i) => i); // 0–8 hr
const MINUTE_OPTIONS = Array.from({ length: 12 }, (_, i) => i * 5); // 0–55, step 5

const nearest = (target: number, options: readonly number[]) =>
  options.reduce((best, o) => (Math.abs(o - target) < Math.abs(best - target) ? o : best), options[0]);

/**
 * Duration control: two quick chips (30 min, 1 hour) and a "Custom" chip that
 * reveals an Apple-Clock-style hour + minute wheel. The wheels snap, fade at the
 * edges, and you can either spin them or tap a number to centre it.
 */
export function DurationPicker({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  const isQuick = (DURATION_QUICK as readonly number[]).includes(value);
  const [custom, setCustom] = useState(!isQuick);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        {DURATION_QUICK.map((d) => {
          const active = !custom && value === d;
          return (
            <motion.button
              key={d}
              type="button"
              whileTap={{ scale: 0.95 }}
              onClick={() => {
                setCustom(false);
                onChange(d);
              }}
              className={`chip ${active ? "chip-active" : ""}`}
            >
              {durationLabel(d)}
            </motion.button>
          );
        })}
        <motion.button
          type="button"
          whileTap={{ scale: 0.95 }}
          onClick={() => setCustom(true)}
          className={`chip ${custom ? "chip-active" : ""}`}
          aria-expanded={custom}
        >
          Custom
        </motion.button>
      </div>

      <AnimatePresence initial={false}>
        {custom && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <DurationWheel value={value} onChange={onChange} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Two snap-scrolling columns (hours + minutes) with a centred selection band. */
function DurationWheel({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const hours = Math.min(8, Math.floor(value / 60));
  const minutes = nearest(value % 60, MINUTE_OPTIONS);

  const set = (h: number, m: number) => onChange(Math.min(480, Math.max(5, h * 60 + m)));

  // paper-card, used to fade the wheel edges into the panel.
  const fade =
    "linear-gradient(to bottom, #FDFBF5 0%, rgba(253,251,245,0) 34%, rgba(253,251,245,0) 66%, #FDFBF5 100%)";

  return (
    <div className="mt-3 rounded-2xl border border-paper-edge bg-[#FDFBF5] px-2 py-1">
      <div className="relative flex items-center justify-center">
        {/* Centred selection band */}
        <div className="pointer-events-none absolute inset-x-4 top-1/2 z-0 h-10 -translate-y-1/2 rounded-xl bg-accent-wash" />
        {/* Edge fade */}
        <div
          className="pointer-events-none absolute inset-0 z-20"
          style={{ backgroundImage: fade }}
        />
        <div className="relative z-10 flex items-center gap-1">
          <WheelColumn options={HOUR_OPTIONS} value={hours} onChange={(h) => set(h, minutes)} ariaLabel="Hours" />
          <span className="w-8 text-sm font-medium text-muted">hr</span>
          <WheelColumn options={MINUTE_OPTIONS} value={minutes} onChange={(m) => set(hours, m)} ariaLabel="Minutes" pad2 />
          <span className="w-10 text-sm font-medium text-muted">min</span>
        </div>
      </div>
      <p className="pb-1 text-center text-[0.7rem] text-muted-soft">
        scroll, click, or focus and use ↑ ↓
      </p>
    </div>
  );
}

const WHEEL_ITEM = 40; // px per row
const WHEEL_PAD = 60; // spacer so first/last rows can centre (height 160 → pad 60)

function WheelColumn({
  options,
  value,
  onChange,
  ariaLabel,
  pad2 = false,
}: {
  options: number[];
  value: number;
  onChange: (n: number) => void;
  ariaLabel: string;
  pad2?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idx = Math.max(0, options.indexOf(value));

  // Keep the scroll position aligned to the selected value.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const target = idx * WHEEL_ITEM;
    if (Math.abs(el.scrollTop - target) > 1) el.scrollTo({ top: target, behavior: "smooth" });
  }, [idx]);

  function onScroll() {
    const el = ref.current;
    if (!el) return;
    if (settle.current) clearTimeout(settle.current);
    settle.current = setTimeout(() => {
      const i = Math.min(options.length - 1, Math.max(0, Math.round(el.scrollTop / WHEEL_ITEM)));
      if (options[i] !== value) onChange(options[i]);
    }, 90);
  }

  // Keyboard support (laptop-friendly): the column is focusable and arrow keys
  // move through the values; the numbers themselves aren't tab stops.
  function onKeyDown(e: React.KeyboardEvent) {
    const i = Math.max(0, options.indexOf(value));
    let next = i;
    if (e.key === "ArrowDown" || e.key === "ArrowRight") next = Math.min(options.length - 1, i + 1);
    else if (e.key === "ArrowUp" || e.key === "ArrowLeft") next = Math.max(0, i - 1);
    else if (e.key === "PageDown") next = Math.min(options.length - 1, i + 3);
    else if (e.key === "PageUp") next = Math.max(0, i - 3);
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = options.length - 1;
    else return;
    e.preventDefault();
    if (options[next] !== value) onChange(options[next]);
  }

  return (
    <div
      ref={ref}
      onScroll={onScroll}
      onKeyDown={onKeyDown}
      tabIndex={0}
      role="listbox"
      aria-label={ariaLabel}
      className="h-40 w-14 snap-y snap-mandatory overflow-y-scroll rounded-xl outline-none ring-accent/40 [scrollbar-width:none] focus-visible:ring-2 [&::-webkit-scrollbar]:hidden"
    >
      <div style={{ height: WHEEL_PAD }} />
      {options.map((o) => {
        const selected = o === value;
        return (
          <button
            key={o}
            type="button"
            role="option"
            tabIndex={-1}
            aria-selected={selected}
            onClick={() => onChange(o)}
            className={[
              "flex h-10 w-full snap-center items-center justify-center text-xl tabular-nums outline-none transition-all duration-150",
              selected ? "font-semibold text-ink" : "text-muted-soft/80 hover:text-muted",
            ].join(" ")}
          >
            {pad2 ? String(o).padStart(2, "0") : o}
          </button>
        );
      })}
      <div style={{ height: WHEEL_PAD }} />
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
