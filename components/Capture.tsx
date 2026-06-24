import { useEffect, useMemo, useRef, useState } from "react";
import { useSettings } from "../hooks/useDb";
import { createTask } from "../lib/tasks";
import type { Importance } from "../lib/types";
import { addDays, atTime, dayLabel, durationLabel, startOfDay } from "../lib/dates";
import { DayPickerButton, DurationPicker, ImportancePicker } from "./pickers";
import { CloseIcon, PlusIcon } from "./icons";

/** Default slot for a fresh capture: tomorrow at 2:00 PM (editable). */
const DEFAULT_TIME = "14:00";
function defaultDay(now: Date): Date {
  return addDays(startOfDay(now), 1);
}

export function Capture({ now }: { now: Date }) {
  const settings = useSettings();

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [duration, setDuration] = useState(settings.defaultDurationMinutes);
  const [importance, setImportance] = useState<Importance>("normal");
  const [day, setDay] = useState<Date>(() => defaultDay(now));
  const [time, setTime] = useState<string>(DEFAULT_TIME);

  const inputRef = useRef<HTMLInputElement>(null);

  // Keyboard shortcut: "n" opens capture from anywhere (brief §5A).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = document.activeElement;
      const typing =
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        (el as HTMLElement)?.isContentEditable;
      if (!open && !typing && (e.key === "n" || e.key === "N")) {
        e.preventDefault();
        openSheet();
      }
      if (open && e.key === "Escape") close();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function openSheet() {
    setTitle("");
    setDuration(settings.defaultDurationMinutes);
    setImportance("normal");
    setDay(defaultDay(now));
    setTime(DEFAULT_TIME);
    setOpen(true);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function close() {
    setOpen(false);
  }

  const today = useMemo(() => startOfDay(now), [now]);
  const start = useMemo(() => atTime(day, time), [day, time]);

  async function confirm() {
    const title_ = title.trim();
    if (!title_) return;
    await createTask({
      title: title_,
      durationMinutes: duration,
      importance,
      scheduledStart: start,
    });
    close();
  }

  return (
    <>
      {/* Always-available capture button, fixed within reach (brief §5A). */}
      {!open && (
        <button
          type="button"
          onClick={openSheet}
          aria-label="Jot a thought (n)"
          className="fixed bottom-6 right-5 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-paper shadow-lift transition-transform duration-150 hover:bg-accent-soft active:scale-95"
        >
          <PlusIcon className="h-6 w-6" />
        </button>
      )}

      {open && (
        <div className="fixed inset-0 z-40 flex items-end justify-center sm:items-center">
          <div
            className="absolute inset-0 bg-ink/20 backdrop-blur-[2px] animate-fade-in"
            onClick={close}
          />
          <div className="surface relative z-10 m-0 w-full max-w-lg animate-scale-in rounded-b-none rounded-t-2xl p-5 sm:m-4 sm:rounded-2xl">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold text-ink">Jot a thought</h2>
              <button onClick={close} className="btn-ghost -mr-2 px-2 py-1.5" aria-label="Close">
                <CloseIcon className="h-5 w-5" />
              </button>
            </div>

            <input
              ref={inputRef}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && title.trim()) confirm();
              }}
              placeholder="What's on your mind?"
              className="field text-[1.05rem]"
            />

            <div className="mt-4 space-y-4">
              <div>
                <FieldLabel>How long?</FieldLabel>
                <DurationPicker value={duration} onChange={setDuration} />
              </div>

              <div>
                <FieldLabel>How important?</FieldLabel>
                <ImportancePicker value={importance} onChange={setImportance} />
              </div>

              <div>
                <FieldLabel>When?</FieldLabel>
                {/* Date first, then time. Defaults to tomorrow at 2:00 PM. */}
                <div className="flex flex-wrap items-center gap-2">
                  <DayPickerButton
                    value={day}
                    min={today}
                    label={dayLabel(day)}
                    onSelect={(d) => setDay(startOfDay(d))}
                  />
                  <input
                    type="time"
                    value={time}
                    onChange={(e) => setTime(e.target.value || DEFAULT_TIME)}
                    className="rounded-xl border border-paper-edge bg-paper-card px-3 py-2 text-base font-medium tabular-nums text-ink outline-none focus:border-accent/40 [color-scheme:light]"
                    aria-label="Time"
                  />
                </div>
              </div>
            </div>

            <div className="mt-5 flex items-center justify-between gap-3">
              <p className="text-xs text-muted">{duration ? durationLabel(duration) : ""}</p>
              <div className="flex gap-2">
                <button onClick={close} className="btn-ghost">
                  Cancel
                </button>
                <button onClick={confirm} disabled={!title.trim()} className="btn-primary">
                  Schedule it
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">{children}</p>;
}
