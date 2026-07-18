import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useAllTasks, useDayItems, useSettings } from "../hooks/useDb";
import { ConflictError, createTask, dropTask, updateTask } from "../lib/tasks";
import type { Importance } from "../lib/types";
import { addDays, atTime, dayLabel, durationLabel, format, startOfDay, timeLabel } from "../lib/dates";
import { DayPickerButton, DurationPicker, ImportancePicker } from "./pickers";
import { DayPlacer, useFirstFit } from "./DayPlacer";
import { CloseIcon, PlusIcon, TrashIcon } from "./icons";
import { Button } from "./ui/button";

/** Default day for a fresh capture: tomorrow (the time comes from the placer's first fit). */
function defaultDay(now: Date): Date {
  return addDays(startOfDay(now), 1);
}

const CAPTURE_EVENT = "lifeos:capture";

/**
 * Open the capture sheet from anywhere (e.g. the sidebar "Add a task", the
 * Today page, or a calendar day). Optionally pre-fill it:
 *  - `inbox`   — start in To-do mode (no scheduled time).
 *  - `day`     — pre-select the day to schedule on (scheduled mode).
 *  - `dueDate` — pre-fill the To-do due date (implies inbox mode); still editable.
 *  - `editId`  — edit an existing Life OS task in place (prefills every field).
 */
export type CaptureOptions = { inbox?: boolean; day?: Date; dueDate?: Date; editId?: string };

export function openCapture(opts?: CaptureOptions) {
  window.dispatchEvent(new CustomEvent(CAPTURE_EVENT, { detail: opts ?? {} }));
}

/** Open the sheet in edit mode for one of your own tasks. */
export function openEdit(taskId: string) {
  openCapture({ editId: taskId });
}

export function Capture({ now }: { now: Date }) {
  const settings = useSettings();
  const allTasks = useAllTasks();

  const [open, setOpen] = useState(false);
  // Set to a task id when editing an existing task; null when creating.
  const [editId, setEditId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [duration, setDuration] = useState(settings.defaultDurationMinutes);
  const [importance, setImportance] = useState<Importance>("normal");
  const [day, setDay] = useState<Date>(() => defaultDay(now));
  // "HH:mm" once the user has placed the block (drag / chip / exact time);
  // null = let the placer seat it at the day's first free fit.
  const [pickedTime, setPickedTime] = useState<string | null>(null);
  // When true, capture goes to the To-do list with no scheduled time yet.
  const [noTime, setNoTime] = useState(false);
  // To-do dates (only used when noTime). null = not set.
  const [dueDate, setDueDate] = useState<Date | null>(null);
  const [preferredDate, setPreferredDate] = useState<Date | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  function openSheet(opts: CaptureOptions = {}) {
    setServerError(null);

    // Edit mode: prefill every field from the existing task.
    const editTask = opts.editId ? allTasks.find((t) => t.id === opts.editId) : undefined;
    if (opts.editId && editTask) {
      const scheduled = editTask.scheduledStart ? new Date(editTask.scheduledStart) : null;
      setEditId(editTask.id);
      setTitle(editTask.title);
      setDuration(editTask.durationMinutes);
      setImportance(editTask.importance);
      setNoTime(!scheduled);
      setDay(scheduled ? startOfDay(scheduled) : defaultDay(now));
      setPickedTime(scheduled ? format(scheduled, "HH:mm") : null);
      setDueDate(editTask.dueDate ? startOfDay(new Date(editTask.dueDate)) : null);
      setPreferredDate(editTask.preferredDate ? startOfDay(new Date(editTask.preferredDate)) : null);
      setOpen(true);
      requestAnimationFrame(() => inputRef.current?.focus());
      return;
    }

    // A pre-filled due date means we're capturing a to-do for a specific day.
    const inbox = !!opts.inbox || !!opts.dueDate;
    setEditId(null);
    setTitle("");
    setDuration(settings.defaultDurationMinutes);
    setImportance("normal");
    setDay(opts.day ? startOfDay(opts.day) : defaultDay(now));
    setPickedTime(null);
    setNoTime(inbox);
    setDueDate(opts.dueDate ? startOfDay(opts.dueDate) : null);
    setPreferredDate(null);
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

  // External trigger (sidebar / Today / calendar day / Inbox "jot another thought").
  useEffect(() => {
    function onOpen(e: Event) {
      const detail = (e as CustomEvent<CaptureOptions>).detail ?? {};
      openSheet(detail);
    }
    window.addEventListener(CAPTURE_EVENT, onOpen);
    return () => window.removeEventListener(CAPTURE_EVENT, onOpen);
  });

  function close() {
    setOpen(false);
  }

  const today = useMemo(() => startOfDay(now), [now]);
  const tomorrow = useMemo(() => addDays(today, 1), [today]);
  // Where the block sits: the user's placement, or the day's first free fit.
  // Null when nothing fits that day (or it's a day off).
  const firstFit = useFirstFit(day, duration, now, editId ?? undefined);
  const start = useMemo(
    () => (pickedTime ? atTime(day, pickedTime) : firstFit),
    [day, pickedTime, firstFit],
  );

  // The chosen day's existing items (Life OS tasks + Google events).
  const dayItems = useDayItems(day);
  const [serverError, setServerError] = useState<string | null>(null);

  // Backstop for the Schedule button: nothing may overlap — a clash can appear
  // after a day/duration change moves a kept time onto something else. When
  // editing, the task doesn't clash with itself.
  const conflict = useMemo(() => {
    if (noTime || !start) return null;
    const end = start.getTime() + duration * 60_000;
    return (
      dayItems.find((it) => {
        if (it.id === editId || it.allDay || !it.start) return false;
        const s = new Date(it.start).getTime();
        const e = s + (it.durationMinutes ?? 30) * 60_000;
        return s < end && start.getTime() < e;
      }) ?? null
    );
  }, [dayItems, start, duration, noTime, editId]);

  async function remove() {
    if (!editId) return;
    await dropTask(editId);
    close();
  }

  // A preferred date only counts when the deadline leaves room for it (matches
  // the field being shown), so it's never saved once the due date is imminent.
  const preferredAllowed = !dueDate || dueDate.getTime() > tomorrow.getTime();
  const effectivePreferred = noTime && preferredAllowed ? preferredDate : null;

  // A kept time can land in the past after switching the day to today. Block
  // it — except when editing a done task, where logging a past time is the point.
  const editingCompleted = editId
    ? allTasks.find((t) => t.id === editId)?.completed ?? false
    : false;
  const startInPast =
    !noTime && !!start && start.getTime() < now.getTime() && !editingCompleted;

  async function confirm() {
    const title_ = title.trim();
    // These guards live here (not only on the button): Enter in the title
    // input also submits.
    if (!title_ || conflict || startInPast || (!noTime && !start)) return;
    setServerError(null);
    try {
      if (editId) {
        // Edit in place. `completed`/`completedAt` are left untouched, so a
        // finished task stays finished after an edit.
        await updateTask(editId, {
          title: title_,
          durationMinutes: duration,
          importance,
          scheduledStart: noTime || !start ? null : start.toISOString(),
          dueDate: noTime ? (dueDate ? dueDate.toISOString() : null) : null,
          preferredDate: effectivePreferred ? effectivePreferred.toISOString() : null,
        });
      } else {
        await createTask({
          title: title_,
          durationMinutes: duration,
          importance,
          scheduledStart: noTime || !start ? null : start,
          dueDate: noTime ? dueDate : null,
          preferredDate: effectivePreferred,
        });
      }
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
      {/* Mobile capture button (desktop uses the sidebar "Add a task"). */}
      {!open && (
        <motion.button
          type="button"
          onClick={() => openSheet()}
          aria-label="Add a task (n)"
          whileTap={{ scale: 0.9 }}
          className="fixed bottom-24 right-5 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-white shadow-lift hover:bg-accent-soft md:hidden"
        >
          <PlusIcon className="h-6 w-6" />
        </motion.button>
      )}

      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-40 flex items-end justify-center sm:items-center">
            <motion.div
              className="absolute inset-0 bg-ink/25 backdrop-blur-[2px]"
              onClick={close}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
            />
            <motion.div
              className="surface relative z-10 m-0 w-full max-w-lg rounded-b-none rounded-t-2xl p-5 sm:m-4 sm:rounded-2xl"
              initial={{ y: 24, opacity: 0, scale: 0.98 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 24, opacity: 0, scale: 0.98 }}
              transition={{ type: "spring", stiffness: 380, damping: 32 }}
            >
              <div className="mb-4 flex items-start justify-between">
                <div>
                  <h2 className="font-display text-lg font-bold tracking-tight text-ink">
                    {editId ? "Edit task" : "Add a task"}
                  </h2>
                  <p className="mt-0.5 text-xs text-muted">
                    {editId
                      ? "Update the details — changes save right away."
                      : "Jot it down — schedule it now or save it for later."}
                  </p>
                </div>
                <button
                  onClick={close}
                  className="-mr-1.5 -mt-1 rounded-lg p-1.5 text-muted-soft transition-colors hover:bg-paper-edge/60 hover:text-ink"
                  aria-label="Close"
                >
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
                placeholder="What do you need to do?"
                className="field text-[1.05rem]"
              />

              {/* Mode: schedule onto a day now, or park it on the To-do list. */}
              <div className="relative mt-4 grid grid-cols-2 gap-1 rounded-xl bg-paper-deep/70 p-1">
                <SegButton active={!noTime} onClick={() => setNoTime(false)}>
                  Schedule
                </SegButton>
                <SegButton active={noTime} onClick={() => setNoTime(true)}>
                  To-do list
                </SegButton>
              </div>

              <div className="mt-4">
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={noTime ? "todo" : "scheduled"}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.18, ease: "easeOut" }}
                  >
                    {noTime ? (
                      /* To-do: optional due date + preferred date; schedule it later.
                         A preferred date only makes sense when the deadline leaves
                         room for it — so it's hidden once the due date is today or
                         tomorrow, and can never be later than the due date. */
                      <div className="space-y-3">
                        <p className="rounded-xl bg-accent-wash px-3.5 py-2.5 text-sm text-ink">
                          Saved to your To-do list — schedule it onto a day whenever you’re ready.
                        </p>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                          <OptionalDate
                            heading="Due by"
                            value={dueDate}
                            min={today}
                            onSelect={(d) => {
                              setDueDate(d);
                              // No room for a preferred date once it's due by tomorrow.
                              if (d && d.getTime() <= tomorrow.getTime()) setPreferredDate(null);
                              // Keep preferred on or before the new due date.
                              else if (d && preferredDate && preferredDate.getTime() > d.getTime())
                                setPreferredDate(d);
                            }}
                          />
                          {(!dueDate || dueDate.getTime() > tomorrow.getTime()) && (
                            <OptionalDate
                              heading="Prefer to do"
                              value={preferredDate}
                              min={today}
                              max={dueDate ?? undefined}
                              onSelect={setPreferredDate}
                            />
                          )}
                        </div>
                      </div>
                    ) : (
                      /* Pick a day, then drag the block onto a free time —
                         it dodges other tasks + calendar events. */
                      <div className="space-y-3">
                        <DayPickerButton
                          value={day}
                          min={today}
                          label={dayLabel(day)}
                          onSelect={(d) => setDay(startOfDay(d))}
                        />
                        <DayPlacer
                          day={day}
                          durationMinutes={duration}
                          now={now}
                          value={start}
                          onChange={(s) => setPickedTime(format(s, "HH:mm"))}
                          excludeId={editId ?? undefined}
                          ariaLabel="Start time"
                        />
                      </div>
                    )}
                  </motion.div>
                </AnimatePresence>
                {conflict && (
                  <p className="mt-2 text-xs font-medium text-accent">
                    That overlaps “{conflict.title}” — pick another time.
                  </p>
                )}
                {startInPast && !conflict && (
                  <p className="mt-2 text-xs font-medium text-accent">
                    That time has already passed today — drag the block to a fresh spot.
                  </p>
                )}
                {serverError && !conflict && (
                  <p className="mt-2 text-xs font-medium text-accent">{serverError}</p>
                )}
              </div>

              <div className="mt-5 space-y-4">
                <div>
                  <FieldLabel>How long?</FieldLabel>
                  <DurationPicker value={duration} onChange={setDuration} />
                </div>

                <div>
                  <FieldLabel>How important?</FieldLabel>
                  <ImportancePicker value={importance} onChange={setImportance} />
                </div>
              </div>

              <div className="mt-5 flex items-center justify-between gap-3 border-t border-paper-edge pt-4">
                {editId ? (
                  <Button
                    variant="ghost"
                    onClick={remove}
                    className="px-2.5 text-danger hover:bg-danger-wash hover:text-danger-soft"
                  >
                    <TrashIcon className="h-4 w-4" /> Delete
                  </Button>
                ) : (
                  <p className="text-sm font-medium text-muted">
                    {durationLabel(duration)}
                    {!noTime && (
                      <span className="text-muted-soft">
                        {" "}
                        · {dayLabel(day)}
                        {start ? ` · ${timeLabel(start)}` : ""}
                      </span>
                    )}
                  </p>
                )}
                <div className="flex gap-2">
                  <Button variant="ghost" onClick={close}>
                    Cancel
                  </Button>
                  <Button
                    onClick={confirm}
                    disabled={!title.trim() || !!conflict || startInPast || (!noTime && !start)}
                  >
                    {editId ? "Save changes" : noTime ? "Add to To-do" : "Schedule it"}
                  </Button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">{children}</p>;
}

/** One half of the Schedule / To-do segmented control, with a sliding pill. */
function SegButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="relative rounded-lg py-1.5 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
    >
      {active && (
        <motion.span
          layoutId="capture-mode"
          aria-hidden
          className="absolute inset-0 rounded-lg bg-paper-card shadow-card"
          transition={{ type: "spring", stiffness: 480, damping: 34 }}
        />
      )}
      <span className={`relative z-10 ${active ? "text-ink" : "text-muted hover:text-ink"}`}>
        {children}
      </span>
    </button>
  );
}

/** A labeled, clearable date picker for the optional to-do dates. */
function OptionalDate({
  heading,
  value,
  min,
  max,
  onSelect,
}: {
  heading: string;
  value: Date | null;
  min: Date;
  max?: Date;
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
          max={max}
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
