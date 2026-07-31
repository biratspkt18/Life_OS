"use client";
import { useState } from "react";
import { useSettings } from "../hooks/useDb";
import { saveSettings } from "../lib/tasks";
import { atTime, format, timeLabel } from "../lib/dates";
import {
  dayKeyOf,
  getWindowException,
  proposedEdgeTime,
  setWindowException,
  type EdgeSide,
} from "../lib/effectiveWindow";
import { Button } from "./ui/button";
import { Dialog } from "./ui/dialog";

/**
 * The gentle two-step prompt after a task lands outside the working window.
 * Step 1: "Start your day earlier / end it later — just for today?" Yes moves
 * today's effective window (a device-local, self-expiring exception). Step 2:
 * offer to make the new edge that weekday's usual time in Settings. Declining
 * either step leaves the task exactly where the user put it — outside-hours
 * placement is always allowed; this only offers to move the fence.
 */
export function DayEdgePrompt({
  side,
  taskStart,
  taskEnd,
  day,
  onClose,
}: {
  side: EdgeSide;
  taskStart: Date;
  taskEnd: Date;
  day: Date;
  onClose: () => void;
}) {
  const settings = useSettings();
  const [step, setStep] = useState<"today" | "usual">("today");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hhmm = proposedEdgeTime(side, taskStart, taskEnd);
  const timeText = timeLabel(atTime(day, hhmm));
  const weekday = format(day, "EEEE");

  function acceptToday() {
    // Merge with any same-day exception so a start change never clobbers an
    // earlier end change (or vice versa).
    const existing = getWindowException();
    const base = existing?.day === dayKeyOf(day) ? existing : { day: dayKeyOf(day) };
    setWindowException({ ...base, [side]: hhmm });
    setStep("usual");
  }

  async function acceptUsual() {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const patched = settings.weekdayWindows.map((w, i) =>
        i === day.getDay()
          ? { ...w, [side === "start" ? "dayWindowStart" : "dayWindowEnd"]: hhmm }
          : w,
      );
      await saveSettings({ weekdayWindows: patched });
      onClose();
    } catch {
      setSaving(false);
      setError("Couldn't save to your settings — today's change still holds.");
    }
  }

  const title =
    step === "today"
      ? side === "start"
        ? "Start your day earlier today?"
        : "End your day later today?"
      : "Make it the usual?";

  return (
    <Dialog title={title} onClose={onClose}>
      {step === "today" ? (
          <>
            <p className="mb-4 text-sm text-muted">
              That lands {side === "start" ? "before your day usually starts" : "after your day usually ends"}.
              Want today's {side === "start" ? "start" : "end"} to move to{" "}
              <span className="font-semibold text-ink">{timeText}</span>? The task stays put
              either way.
            </p>
            <div className="flex gap-2">
              <Button className="flex-1" onClick={acceptToday}>
                Yes, just for today
              </Button>
              <Button className="flex-1" variant="outline" onClick={onClose}>
                No, leave it
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="mb-4 text-sm text-muted">
              Done — today runs {side === "start" ? "from" : "until"}{" "}
              <span className="font-semibold text-ink">{timeText}</span>. Make that your usual{" "}
              {side} for <span className="font-semibold text-ink">{weekday}s</span>?
            </p>
            <div className="flex gap-2">
              <Button className="flex-1" disabled={saving} onClick={acceptUsual}>
                {saving ? "Saving…" : `Every ${weekday}`}
              </Button>
              <Button className="flex-1" variant="outline" disabled={saving} onClick={onClose}>
                Just today
              </Button>
            </div>
          </>
        )}

      {error && <p className="mt-3 text-xs font-medium text-accent">{error}</p>}
    </Dialog>
  );
}
