"use client";
import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useSettings } from "../hooks/useDb";
import { useTheme } from "../hooks/useTheme";
import { saveSettings } from "../lib/tasks";
import { parseHHmm } from "../lib/dates";
import { defaultWeekdayWindows, type DayWindow, type Settings } from "../lib/types";
import { type ThemePref } from "../lib/theme";
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

type Page = { kind: "root" } | { kind: "week" } | { kind: "day"; index: number };

function getWindows(settings: Settings): DayWindow[] {
  return settings.weekdayWindows ?? defaultWeekdayWindows(settings);
}

/** First problem with a day's hours, or null when they're coherent. */
function dayIssue(w: DayWindow): string | null {
  if (!w.enabled) return null;
  if (parseHHmm(w.dayWindowEnd) <= parseHHmm(w.dayWindowStart))
    return "End time should be after the start time.";
  if (parseHHmm(w.primeEnd) <= parseHHmm(w.primeStart))
    return "Prime end should be after its start.";
  if (
    parseHHmm(w.primeStart) < parseHHmm(w.dayWindowStart) ||
    parseHHmm(w.primeEnd) > parseHHmm(w.dayWindowEnd)
  )
    return "Keep the prime block inside the day window.";
  return null;
}

const slide = {
  enter: (dir: number) => ({ opacity: 0, x: 28 * dir }),
  center: { opacity: 1, x: 0 },
  exit: (dir: number) => ({ opacity: 0, x: -28 * dir }),
};

export function SettingsView() {
  const settings = useSettings();
  const windows = getWindows(settings);
  const reduceMotion = useReducedMotion();

  const [page, setPage] = useState<Page>({ kind: "root" });
  // 1 = drilling in (new page slides from the right), -1 = backing out.
  const [dir, setDir] = useState<1 | -1>(1);

  function go(next: Page, direction: 1 | -1) {
    setDir(direction);
    setPage(next);
  }

  function patchDay(index: number, patch: Partial<DayWindow>) {
    const next = windows.map((w, i) => (i === index ? { ...w, ...patch } : w));
    saveSettings({ weekdayWindows: next });
  }

  function copyToAll(index: number) {
    const src = windows[index];
    saveSettings({ weekdayWindows: windows.map(() => ({ ...src })) });
  }

  const pageKey = page.kind === "day" ? `day-${page.index}` : page.kind;

  return (
    <section className="overflow-x-clip">
      <AnimatePresence mode="wait" initial={false} custom={dir}>
        <motion.div
          key={pageKey}
          custom={dir}
          variants={reduceMotion ? undefined : slide}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{ duration: 0.16, ease: "easeOut" }}
        >
          {page.kind === "root" && (
            <RootPage
              settings={settings}
              windows={windows}
              onOpenWeek={() => go({ kind: "week" }, 1)}
            />
          )}
          {page.kind === "week" && (
            <WeekPage
              windows={windows}
              onBack={() => go({ kind: "root" }, -1)}
              onOpenDay={(index) => go({ kind: "day", index }, 1)}
            />
          )}
          {page.kind === "day" && (
            <DayPage
              label={WEEK.find((d) => d.index === page.index)?.label ?? ""}
              window={windows[page.index]}
              onBack={() => go({ kind: "week" }, -1)}
              onPatch={(patch) => patchDay(page.index, patch)}
              onCopyToAll={() => copyToAll(page.index)}
            />
          )}
        </motion.div>
      </AnimatePresence>
    </section>
  );
}

/* ---------- Root: the settings menu ---------- */

function RootPage({
  settings,
  windows,
  onOpenWeek,
}: {
  settings: Settings;
  windows: DayWindow[];
  onOpenWeek: () => void;
}) {
  const enabled = windows.filter((w) => w.enabled);
  const uniform =
    enabled.length > 0 &&
    enabled.every(
      (w) =>
        w.dayWindowStart === enabled[0].dayWindowStart &&
        w.dayWindowEnd === enabled[0].dayWindowEnd,
    );
  const weekSummary =
    enabled.length === 0
      ? "No days scheduled"
      : uniform
        ? `${enabled.length} day${enabled.length === 1 ? "" : "s"} · ${clock(enabled[0].dayWindowStart)} – ${clock(enabled[0].dayWindowEnd)}`
        : `${enabled.length} day${enabled.length === 1 ? "" : "s"} · custom hours`;
  const weekNeedsAttention = windows.some((w) => dayIssue(w) !== null);

  return (
    <>
      <header className="mb-5">
        <h1 className="text-2xl font-bold tracking-tight text-ink">Settings</h1>
        <p className="mt-0.5 text-sm text-muted">The shape of your week drives every proposal.</p>
      </header>

      <div className="space-y-5">
        <Group title="Scheduling" hint="What the proposal engine works with.">
          <div className="divide-y divide-paper-edge overflow-hidden rounded-xl border border-paper-edge bg-paper-card/60">
            <button
              type="button"
              onClick={onOpenWeek}
              className="flex w-full items-center justify-between gap-3 px-3.5 py-3 text-left transition-colors hover:bg-paper-edge/30"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink">Your week</p>
                <p className="truncate text-xs text-muted">Schedulable hours, day by day.</p>
              </div>
              <span className="flex shrink-0 items-center gap-2 text-sm text-muted">
                {weekNeedsAttention && (
                  <span className="h-1.5 w-1.5 rounded-full bg-accent" title="Needs attention" />
                )}
                <span className="tabular-nums">{weekSummary}</span>
                <ChevronRight />
              </span>
            </button>

            <div className="flex items-center justify-between gap-3 px-3.5 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink">Default task length</p>
                <p className="truncate text-xs text-muted">Starting proposal at capture.</p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
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
                  className="field w-20 text-right"
                />
                <span className="text-sm text-muted">min</span>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 px-3.5 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink">Offer a breakdown after</p>
                <p className="truncate text-xs text-muted">
                  How many moves before suggesting smaller steps.
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <input
                  type="number"
                  min={2}
                  max={20}
                  step={1}
                  value={settings.deferralBreakdownThreshold}
                  onChange={(e) => {
                    const n = parseInt(e.target.value, 10);
                    if (!Number.isNaN(n))
                      saveSettings({ deferralBreakdownThreshold: Math.min(20, Math.max(2, n)) });
                  }}
                  className="field w-20 text-right"
                />
                <span className="text-sm text-muted">moves</span>
              </div>
            </div>
          </div>
        </Group>

        <Group title="Appearance" hint="How Life OS looks on this device.">
          <ThemeControl />
        </Group>

        <ConnectPanel />
      </div>
    </>
  );
}

/* ---------- Appearance: theme (per-device, localStorage) ---------- */

const THEME_OPTIONS: { value: ThemePref; label: string; Icon: () => React.ReactElement }[] = [
  { value: "system", label: "System", Icon: MonitorIcon },
  { value: "light", label: "Light", Icon: SunIcon },
  { value: "dark", label: "Dark", Icon: MoonIcon },
];

function ThemeControl() {
  const { pref, resolved, setTheme } = useTheme();
  return (
    <div>
      <div className="grid grid-cols-3 gap-1.5 rounded-xl border border-paper-edge bg-paper-card/60 p-1.5">
        {THEME_OPTIONS.map(({ value, label, Icon }) => {
          const on = pref === value;
          return (
            <button
              key={value}
              type="button"
              aria-pressed={on}
              onClick={() => setTheme(value)}
              className={`flex flex-col items-center gap-1.5 rounded-lg px-2 py-2.5 text-xs font-medium transition-colors ${
                on
                  ? "bg-accent text-white shadow-accent"
                  : "text-muted hover:bg-paper-edge/40 hover:text-ink"
              }`}
            >
              <Icon />
              {label}
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-muted">
        {pref === "system"
          ? `Following your system — currently ${resolved}.`
          : `Always ${pref}. Remembered on this device only.`}
      </p>
    </div>
  );
}

function MonitorIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
  );
}

/* ---------- Level 2: the week ---------- */

function WeekPage({
  windows,
  onBack,
  onOpenDay,
}: {
  windows: DayWindow[];
  onBack: () => void;
  onOpenDay: (index: number) => void;
}) {
  return (
    <>
      <SubHeader
        backLabel="Settings"
        onBack={onBack}
        title="Your week"
        hint="Tap a day to set its hours. Days you turn off stay free."
      />

      <div className="divide-y divide-paper-edge overflow-hidden rounded-xl border border-paper-edge bg-paper-card/60">
        {WEEK.map(({ label, index }) => {
          const w = windows[index];
          return (
            <button
              key={index}
              type="button"
              onClick={() => onOpenDay(index)}
              className="flex w-full items-center justify-between gap-3 px-3.5 py-3 text-left transition-colors hover:bg-paper-edge/30"
            >
              <span className="text-sm font-medium text-ink">{label}</span>
              <span className="flex items-center gap-2 text-sm">
                {dayIssue(w) !== null && (
                  <span className="h-1.5 w-1.5 rounded-full bg-accent" title="Needs attention" />
                )}
                <span className={w.enabled ? "tabular-nums text-muted" : "text-muted-soft"}>
                  {w.enabled ? `${clock(w.dayWindowStart)} – ${clock(w.dayWindowEnd)}` : "Day off"}
                </span>
                <ChevronRight />
              </span>
            </button>
          );
        })}
      </div>
    </>
  );
}

/* ---------- Level 3: one day ---------- */

function DayPage({
  label,
  window,
  onBack,
  onPatch,
  onCopyToAll,
}: {
  label: string;
  window: DayWindow;
  onBack: () => void;
  onPatch: (patch: Partial<DayWindow>) => void;
  onCopyToAll: () => void;
}) {
  const issue = dayIssue(window);

  return (
    <>
      <SubHeader
        backLabel="Your week"
        onBack={onBack}
        title={label}
        hint={`These hours shape what gets proposed on ${label}s.`}
      />

      <div className="surface p-5">
        <button
          type="button"
          role="switch"
          aria-checked={window.enabled}
          onClick={() => onPatch({ enabled: !window.enabled })}
          className="inline-flex items-center gap-2 text-sm font-medium text-muted"
        >
          <span
            className={`relative h-5 w-9 rounded-full transition-colors ${
              window.enabled ? "bg-accent" : "bg-paper-edge"
            }`}
          >
            <span
              className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-paper-card shadow-sm transition-transform ${
                window.enabled ? "translate-x-4" : ""
              }`}
            />
          </span>
          {window.enabled ? "Scheduled" : "Day off"}
        </button>

        {window.enabled && (
          <div className="mt-4 space-y-4">
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
          </div>
        )}

        {issue && <Warn>{issue}</Warn>}

        {window.enabled && (
          <div className="mt-4 border-t border-paper-edge pt-3.5">
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
      </div>
    </>
  );
}

/* ---------- Shared pieces ---------- */

function SubHeader({
  backLabel,
  onBack,
  title,
  hint,
}: {
  backLabel: string;
  onBack: () => void;
  title: string;
  hint: string;
}) {
  return (
    <header className="mb-5">
      <button
        type="button"
        onClick={onBack}
        className="-ml-1.5 mb-1.5 flex items-center gap-0.5 rounded-lg px-1.5 py-1 text-sm font-medium text-muted transition-colors hover:text-ink"
      >
        <ChevronLeft />
        {backLabel}
      </button>
      <h1 className="text-2xl font-bold tracking-tight text-ink">{title}</h1>
      <p className="mt-0.5 text-sm text-muted">{hint}</p>
    </header>
  );
}

/** "08:00" → "8:00 AM" for row summaries. */
function clock(hhmm: string): string {
  const mins = parseHHmm(hhmm);
  let h = Math.floor(mins / 60);
  const m = mins % 60;
  const ap = h < 12 ? "AM" : "PM";
  h = h % 12 || 12;
  return `${h}:${String(m).padStart(2, "0")} ${ap}`;
}

function ChevronRight() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4 text-muted-soft"
      aria-hidden="true"
    >
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

function ChevronLeft() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <path d="M15 6l-6 6 6 6" />
    </svg>
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
  return <p className="mt-3 text-sm text-accent">{children}</p>;
}
