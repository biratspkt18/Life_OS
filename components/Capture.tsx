import { useEffect, useMemo, useRef, useState } from "react";
import { useDayItems, useSettings } from "../hooks/useDb";
import { ConflictError, createTask } from "../lib/tasks";
import type { Importance } from "../lib/types";
import { addDays, atTime, dayLabel, durationLabel, startOfDay } from "../lib/dates";
import { DayPickerButton, DurationPicker, ImportancePicker } from "./pickers";
import { CloseIcon, PlusIcon } from "./icons";

/** Default slot for a fresh capture: tomorrow at 2:00 PM (editable). */
const DEFAULT_TIME = "14:00";
function defaultDay(now: Date): Date {
  return addDays(startOfDay(now), 1);
}

const CAPTURE_EVENT = "lifeos:capture";

/** Open the capture sheet from anywhere (e.g. the sidebar "Jot a thought"). */
export function openCapture(opts?: { inbox?: boolean }) {
  window.dispatchEvent(new CustomEvent(CAPTURE_EVENT, { detail: opts ?? {} }));
}

export function Capture({ now }: { now: Date }) {
  const settings = useSettings();

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [duration, setDuration] = useState(settings.defaultDurationMinutes);
  const [importance, setImportance] = useState<Importance>("normal");
  const [day, setDay] = useState<Date>(() => defaultDay(now));
  const [time, setTime] = useState<string>(DEFAULT_TIME);
  // When true, capture goes to the To-do list with no scheduled time yet.
  const [noTime, setNoTime] = useState(false);
  // To-do dates (only used when noTime). null = not set.
  const [dueDate, setDueDate] = useState<Date | null>(null);
  const [preferredDate, setPreferredDate] = useState<Date | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  function openSheet(inbox = false) {
    setTitle("");
    setDuration(settings.defaultDurationMinutes);
    setImportance("normal");
    setDay(defaultDay(now));
    setTime(DEFAULT_TIME);
    setNoTime(inbox);
    setDueDate(null);
    setPreferredDate(null);
    setServerError(null);
    setOpen(true);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

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

  // External trigger (sidebar / Inbox "jot another thought").
  useEffect(() => {
    function onOpen(e: Event) {
      const inbox = !!(e as CustomEvent<{ inbox?: boolean }>).detail?.inbox;
      openSheet(inbox);
    }
    window.addEventListener(CAPTURE_EVENT, onOpen);
    return () => window.removeEventListener(CAPTURE_EVENT, onOpen);
  });

  function close() {
    setOpen(false);
  }

  const today = useMemo(() => startOfDay(now), [now]);
  const start = useMemo(() => atTime(day, time), [day, time]);

  // The chosen day's existing items (Life OS tasks + Google events).
  const dayItems = useDayItems(day);
  const [serverError, setServerError] = useState<string | null>(null);

  // Nothing may overlap — flag a clash with an existing task OR calendar event.
  const conflict = useMemo(() => {
    if (noTime) return null;
    const end = start.getTime() + duration * 60_000;
    return (
      dayItems.find((it) => {
        if (it.allDay || !it.start) return false;
        const s = new Date(it.start).getTime();
        const e = s + (it.durationMinutes ?? 30) * 60_000;
        return s < end && start.getTime() < e;
      }) ?? null
    );
  }, [dayItems, start, duration, noTime]);

  async function confirm() {
    const title_ = title.trim();
    if (!title_ || conflict) return;
    setServerError(null);
    try {
      await createTask({
        title: title_,
        durationMinutes: duration,
        importance,
        scheduledStart: noTime ? null : start,
        dueDate: noTime ? dueDate : null,
        preferredDate: noTime ? preferredDate : null,
      });
      close();
    } catch (err) {
      setServerError(
        err instanceof ConflictError
          ? `That overlaps “${err.conflict.title}” — pick another time.`
          : "Couldn't save — please try again.",
      );
    }
  }

  return (
    <>
      {/* Mobile capture button (desktop uses the sidebar "Jot a thought"). */}
      {!open && (
        <button
          type="button"
          onClick={() => openSheet()}
          aria-label="Jot a thought (n)"
          className="fixed bottom-24 right-5 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-white shadow-lift transition-transform duration-150 hover:bg-accent-soft active:scale-95 md:hidden"
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
                <div className="mb-2 flex items-center justify-between">
                  <FieldLabel>When?</FieldLabel>
                  <button
                    type="button"
                    onClick={() => setNoTime((v) => !v)}
                    className="text-xs font-medium text-accent hover:text-accent-soft"
                  >
                    {noTime ? "Schedule a time instead" : "No time yet — add to To-do"}
                  </button>
                </div>
                {noTime ? (
                  /* To-do: optional due date + preferred date; schedule it later. */
                  <div className="space-y-3">
                    <p className="rounded-xl bg-accent-wash px-3.5 py-2.5 text-sm text-ink">
                      Added to your To-do list — schedule it onto a day whenever you’re ready.
                    </p>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                      <OptionalDate
                        heading="Due by"
                        value={dueDate}
                        min={today}
                        onSelect={setDueDate}
                      />
                      <OptionalDate
                        heading="Prefer to do"
                        value={preferredDate}
                        min={today}
                        onSelect={setPreferredDate}
                      />
                    </div>
                  </div>
                ) : (
                  /* Date first, then time. Defaults to tomorrow at 2:00 PM. */
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
                )}
                {conflict && (
                  <p className="mt-2 text-xs font-medium text-accent">
                    That overlaps “{conflict.title}” — pick another time.
                  </p>
                )}
                {serverError && !conflict && (
                  <p className="mt-2 text-xs font-medium text-accent">{serverError}</p>
                )}
              </div>
            </div>

            <div className="mt-5 flex items-center justify-between gap-3">
              <p className="text-xs text-muted">{duration ? durationLabel(duration) : ""}</p>
              <div className="flex gap-2">
                <button onClick={close} className="btn-ghost">
                  Cancel
                </button>
                <button
                  onClick={confirm}
                  disabled={!title.trim() || !!conflict}
                  className="btn-primary"
                >
                  {noTime ? "Add to Inbox" : "Schedule it"}
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

/** A labeled, clearable date picker for the optional to-do dates. */
function OptionalDate({
  heading,
  value,
  min,
  onSelect,
}: {
  heading: string;
  value: Date | null;
  min: Date;
  onSelect: (d: Date | null) => void;
}) {
  return (
    <div>
      <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted">
        {heading}
      </span>
      <div className="flex items-center gap-1.5">
        <DayPickerButton
          value={value ?? min}
          min={min}
          label={value ? dayLabel(value) : "Pick a date"}
          onSelect={(d) => onSelect(startOfDay(d))}
        />
        {value && (
          <button
            type="button"
            onClick={() => onSelect(null)}
            aria-label={`Clear ${heading}`}
            className="rounded-lg p-1.5 text-muted-soft transition-colors hover:text-ink"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}
