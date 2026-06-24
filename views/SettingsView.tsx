"use client";
import { useSettings } from "../hooks/useDb";
import { saveSettings } from "../lib/tasks";
import { parseHHmm } from "../lib/dates";
import { defaultWeekdayWindows, type DayWindow, type Settings } from "../lib/types";
import { ConnectPanel } from "../components/ConnectPanel";

/** Display order: Monday-first, mapped to JS getDay() indices. */
const WEEK: { label: string; index: number }[] = [
  { label: "Monday", index: 1 },
  { label: "Tuesday", index: 2 },
  { label: "Wednesday", index: 3 },
  { label: "Thursday", index: 4 },
  { label: "Friday", index: 5 },
  { label: "Saturday", index: 6 },
  { label: "Sunday", index: 0 },
];

function getWindows(settings: Settings): DayWindow[] {
  return settings.weekdayWindows ?? defaultWeekdayWindows(settings);
}

export function SettingsView() {
  const settings = useSettings();
  const windows = getWindows(settings);

  function patchDay(index: number, patch: Partial<DayWindow>) {
    const next = windows.map((w, i) => (i === index ? { ...w, ...patch } : w));
    saveSettings({ weekdayWindows: next });
  }

  function copyToAll(index: number) {
    const src = windows[index];
    saveSettings({ weekdayWindows: windows.map(() => ({ ...src })) });
  }

  return (
    <section>
      <header className="mb-5">
        <h1 className="text-2xl font-bold tracking-tight text-ink">Settings</h1>
        <p className="mt-0.5 text-sm text-muted">The shape of your week drives every proposal.</p>
      </header>

      <div className="space-y-5">
        <Group
          title="Your week"
          hint="Set the schedulable hours and prime block for each day. Turn a day off to keep it free."
        >
          <div className="space-y-3">
            {WEEK.map(({ label, index }) => (
              <DayRow
                key={index}
                label={label}
                window={windows[index]}
                onPatch={(patch) => patchDay(index, patch)}
                onCopyToAll={() => copyToAll(index)}
              />
            ))}
          </div>
        </Group>

        <Group title="Default task length" hint="Used as the starting proposal at capture.">
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={5}
              max={240}
              step={5}
              value={settings.defaultDurationMinutes}
              onChange={(e) => {
                const n = parseInt(e.target.value, 10);
                if (!Number.isNaN(n))
                  saveSettings({ defaultDurationMinutes: Math.min(240, Math.max(5, n)) });
              }}
              className="field w-24"
            />
            <span className="text-sm text-muted">minutes</span>
          </div>
        </Group>

        <ConnectPanel />
      </div>
    </section>
  );
}

function DayRow({
  label,
  window,
  onPatch,
  onCopyToAll,
}: {
  label: string;
  window: DayWindow;
  onPatch: (patch: Partial<DayWindow>) => void;
  onCopyToAll: () => void;
}) {
  const windowBad = parseHHmm(window.dayWindowEnd) <= parseHHmm(window.dayWindowStart);
  const primeBad = parseHHmm(window.primeEnd) <= parseHHmm(window.primeStart);
  const primeOutside =
    parseHHmm(window.primeStart) < parseHHmm(window.dayWindowStart) ||
    parseHHmm(window.primeEnd) > parseHHmm(window.dayWindowEnd);

  return (
    <div className="rounded-xl border border-paper-edge bg-paper-card/60 p-3.5">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-semibold text-ink">{label}</span>
        <button
          type="button"
          role="switch"
          aria-checked={window.enabled}
          onClick={() => onPatch({ enabled: !window.enabled })}
          className="inline-flex items-center gap-2 text-xs font-medium text-muted"
        >
          <span
            className={`relative h-5 w-9 rounded-full transition-colors ${
              window.enabled ? "bg-accent" : "bg-paper-edge"
            }`}
          >
            <span
              className={`absolute top-0.5 h-4 w-4 rounded-full bg-paper-card shadow-sm transition-transform ${
                window.enabled ? "translate-x-4" : "translate-x-0.5"
              }`}
            />
          </span>
          {window.enabled ? "Scheduled" : "Day off"}
        </button>
      </div>

      {window.enabled && (
        <div className="mt-3 flex flex-wrap items-end gap-x-4 gap-y-3">
          <FieldPair
            heading="Day window"
            startValue={window.dayWindowStart}
            endValue={window.dayWindowEnd}
            onStart={(v) => onPatch({ dayWindowStart: v })}
            onEnd={(v) => onPatch({ dayWindowEnd: v })}
          />
          <FieldPair
            heading="Prime block"
            startValue={window.primeStart}
            endValue={window.primeEnd}
            onStart={(v) => onPatch({ primeStart: v })}
            onEnd={(v) => onPatch({ primeEnd: v })}
          />
          <button
            type="button"
            onClick={onCopyToAll}
            className="btn-ghost px-2.5 py-1.5 text-xs"
            title="Apply these hours to every day"
          >
            Copy to all days
          </button>
        </div>
      )}

      {window.enabled && windowBad && <Warn>End time should be after the start time.</Warn>}
      {window.enabled && !windowBad && primeBad && (
        <Warn>Prime end should be after its start.</Warn>
      )}
      {window.enabled && !windowBad && !primeBad && primeOutside && (
        <Warn>Keep the prime block inside the day window.</Warn>
      )}
    </div>
  );
}

function FieldPair({
  heading,
  startValue,
  endValue,
  onStart,
  onEnd,
}: {
  heading: string;
  startValue: string;
  endValue: string;
  onStart: (v: string) => void;
  onEnd: (v: string) => void;
}) {
  return (
    <div>
      <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted">
        {heading}
      </span>
      <div className="flex items-center gap-1.5">
        <InlineTime value={startValue} onChange={onStart} />
        <span className="text-muted">–</span>
        <InlineTime value={endValue} onChange={onEnd} />
      </div>
    </div>
  );
}

function InlineTime({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      type="time"
      value={value}
      onChange={(e) => e.target.value && onChange(e.target.value)}
      className="rounded-lg border border-paper-edge bg-paper-card px-2.5 py-1.5 text-sm font-medium tabular-nums text-ink outline-none focus:border-accent/40 [color-scheme:light]"
    />
  );
}

function Group({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="surface p-5">
      <h2 className="text-base font-semibold text-ink">{title}</h2>
      <p className="mb-3 mt-0.5 text-sm text-muted">{hint}</p>
      {children}
    </div>
  );
}

function Warn({ children }: { children: React.ReactNode }) {
  return <p className="mt-2 text-sm text-accent">{children}</p>;
}
