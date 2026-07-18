"use client";
import { useEffect, useState, type ComponentType } from "react";
import useSWR from "swr";
import { useNow } from "../hooks/useNow";
import { useInboxTasks, useMissedTodos, usePastUndoneTasks } from "../hooks/useDb";
import { TodayView } from "../views/TodayView";
import { CalendarView } from "../views/CalendarView";
import { InboxView } from "../views/InboxView";
import { LooseEndsView } from "../views/LooseEndsView";
import { StatsView } from "../views/StatsView";
import { SettingsView } from "../views/SettingsView";
import { Capture, openCapture } from "./Capture";
import { ErrorBoundary } from "./ErrorBoundary";
import { RescheduleHost } from "./RescheduleModal";
import { BreakdownHost } from "./BreakdownModal";
import { CalendarIcon, InboxIcon, LooseEndsIcon, PlusIcon, SettingsIcon, StatsIcon, SunIcon } from "./icons";

type View = "today" | "calendar" | "inbox" | "loose" | "stats" | "settings";

type IconType = ComponentType<{ className?: string }>;

const NAV: { key: View; label: string; Icon: IconType }[] = [
  { key: "today", label: "Today", Icon: SunIcon },
  { key: "calendar", label: "Calendar", Icon: CalendarIcon },
  { key: "inbox", label: "To-do", Icon: InboxIcon },
  { key: "loose", label: "Loose ends", Icon: LooseEndsIcon },
  { key: "stats", label: "Stats", Icon: StatsIcon },
  { key: "settings", label: "Settings", Icon: SettingsIcon },
];

export default function Shell() {
  const now = useNow();
  const [view, setView] = useState<View>("today");

  // Missed to-dos count as loose ends (they render there, not in To-do), so
  // both tab badges match what their screens actually show.
  const inbox = useInboxTasks();
  const loose = usePastUndoneTasks(now);
  const missed = useMissedTodos(now);
  const badges: Partial<Record<View, number>> = {
    inbox: inbox.length - missed.length,
    loose: loose.length + missed.length,
  };

  // Register the service worker so the app is installable (and ready for push).
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);

  return (
    <div className="paper-grain relative min-h-screen">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-60 flex-col border-r border-paper-edge bg-paper-deep/40 px-4 py-6 md:flex">
        <div className="mb-6 flex items-center gap-2 px-2">
          <span className="font-display text-xl font-extrabold tracking-tight text-ink">
            Life OS
          </span>
          <span className="h-2.5 w-2.5 rotate-45 rounded-[2px] bg-accent" />
        </div>

        <button
          type="button"
          onClick={() => openCapture()}
          className="mb-5 flex items-center justify-between rounded-2xl border border-paper-edge bg-paper-card px-3.5 py-2.5 text-sm font-medium text-ink shadow-card transition-colors hover:border-accent/40"
        >
          <span className="flex items-center gap-2">
            <PlusIcon className="h-4 w-4 text-accent" /> Add a task
          </span>
          <kbd className="rounded bg-paper-edge px-1.5 py-0.5 text-[0.65rem] font-semibold text-muted">
            n
          </kbd>
        </button>

        <nav className="flex flex-col gap-1">
          {NAV.map((item) => (
            <NavItem
              key={item.key}
              active={view === item.key}
              label={item.label}
              badge={badges[item.key]}
              onClick={() => setView(item.key)}
              Icon={item.Icon}
            />
          ))}
        </nav>

        <div className="mt-auto px-2">
          <FooterStatus onOpenSettings={() => setView("settings")} />
        </div>
      </aside>

      {/* Main content */}
      <div className="relative z-10 md:pl-60">
        <main className="mx-auto max-w-2xl px-4 pb-28 pt-7 md:pb-16 md:pt-10">
          {/* Keyed by view so navigating away resets a tripped boundary. */}
          <ErrorBoundary key={view}>
            {view === "today" && <TodayView now={now} />}
            {view === "calendar" && <CalendarView now={now} />}
            {view === "inbox" && <InboxView now={now} />}
            {view === "loose" && <LooseEndsView now={now} />}
            {view === "stats" && <StatsView now={now} />}
            {view === "settings" && <SettingsView />}
          </ErrorBoundary>
        </main>
      </div>

      {/* Mobile bottom tab bar */}
      <nav className="fixed inset-x-0 bottom-0 z-20 flex border-t border-paper-edge bg-paper-card/95 backdrop-blur md:hidden">
        {NAV.map((item) => (
          <BottomTab
            key={item.key}
            active={view === item.key}
            label={item.label}
            badge={badges[item.key]}
            onClick={() => setView(item.key)}
            Icon={item.Icon}
          />
        ))}
      </nav>

      <Capture now={now} />
      <RescheduleHost now={now} />
      <BreakdownHost />
    </div>
  );
}

function NavItem({
  active,
  label,
  badge,
  onClick,
  Icon,
}: {
  active: boolean;
  label: string;
  badge?: number;
  onClick: () => void;
  Icon: IconType;
}) {
  return (
    <button
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={[
        "flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium transition-colors",
        active ? "bg-accent text-white shadow-accent" : "text-muted hover:bg-paper-edge/60 hover:text-ink",
      ].join(" ")}
    >
      <Icon className="h-[1.05rem] w-[1.05rem]" />
      <span className="flex-1 text-left">{label}</span>
      {badge ? (
        <span
          className={[
            "min-w-5 rounded-full px-1.5 py-0.5 text-center text-[0.7rem] font-semibold",
            active ? "bg-white/25 text-white" : "bg-gold text-ink",
          ].join(" ")}
        >
          {badge}
        </span>
      ) : null}
    </button>
  );
}

function BottomTab({
  active,
  label,
  badge,
  onClick,
  Icon,
}: {
  active: boolean;
  label: string;
  badge?: number;
  onClick: () => void;
  Icon: IconType;
}) {
  return (
    <button
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={[
        "relative flex flex-1 flex-col items-center gap-1 py-2.5 text-[0.65rem] font-medium transition-colors",
        active ? "text-accent" : "text-muted",
      ].join(" ")}
    >
      <span className="relative">
        <Icon className="h-5 w-5" />
        {badge ? (
          <span className="absolute -right-2 -top-1.5 min-w-4 rounded-full bg-gold px-1 text-center text-[0.6rem] font-semibold text-ink">
            {badge}
          </span>
        ) : null}
      </span>
      {label}
    </button>
  );
}

function FooterStatus({ onOpenSettings }: { onOpenSettings: () => void }) {
  const { data } = useSWR<{ connected: boolean; email: string | null }>(
    "/api/google/status",
    (url: string) => fetch(url).then((r) => r.json()),
  );
  const [pushOn, setPushOn] = useState(false);
  useEffect(() => {
    setPushOn(typeof Notification !== "undefined" && Notification.permission === "granted");
  }, []);

  return (
    <button
      onClick={onOpenSettings}
      className="flex w-full flex-col gap-1.5 rounded-xl py-1 text-left text-xs text-muted hover:text-ink"
    >
      <span className="flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${data?.connected ? "bg-sage" : "bg-muted-soft"}`} />
        {data?.connected ? "Google Calendar · synced" : "Connect Google Calendar"}
      </span>
      <span className="flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${pushOn ? "bg-accent" : "bg-muted-soft"}`} />
        {pushOn ? "Push reminders on" : "Push reminders off"}
      </span>
    </button>
  );
}
