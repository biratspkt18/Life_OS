"use client";
import { useEffect, useState } from "react";
import { useNow } from "../hooks/useNow";
import { usePastUndoneTasks, useSettings } from "../hooks/useDb";
import { TodayView } from "../views/TodayView";
import { SettingsView } from "../views/SettingsView";
import { Capture } from "./Capture";
import { RescheduleLoop } from "./RescheduleLoop";
import { ConnectPrompt } from "./ConnectPrompt";
import { CalendarIcon, SettingsIcon } from "./icons";

type View = "today" | "settings";

export default function Shell() {
  const now = useNow();
  const settings = useSettings();
  const [view, setView] = useState<View>("today");
  const [loopDismissed, setLoopDismissed] = useState(false);

  const pastUndone = usePastUndoneTasks(now);
  const showLoop = !loopDismissed && pastUndone.length > 0;

  // Register the service worker so the app is installable (and ready for push).
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <div className="paper-grain relative min-h-screen">
      {showLoop && (
        <RescheduleLoop
          tasks={pastUndone}
          settings={settings}
          now={now}
          onDismiss={() => setLoopDismissed(true)}
        />
      )}

      <div className="relative z-10 mx-auto max-w-2xl px-4 pb-32 pt-6 sm:pt-8">
        <nav className="mb-6 flex items-center justify-between">
          <span className="text-lg font-bold tracking-tight text-ink">Daybook</span>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 rounded-full border border-paper-edge bg-paper-card p-1">
              <NavTab active={view === "today"} onClick={() => setView("today")} label="Today">
                <CalendarIcon className="h-4 w-4" />
              </NavTab>
              <NavTab
                active={view === "settings"}
                onClick={() => setView("settings")}
                label="Settings"
              >
                <SettingsIcon className="h-4 w-4" />
              </NavTab>
            </div>
            <button
              onClick={logout}
              className="rounded-full px-3 py-1.5 text-sm font-medium text-muted hover:text-ink"
            >
              Sign out
            </button>
          </div>
        </nav>

        <main>
          {view === "today" && (
            <>
              <ConnectPrompt />
              <TodayView now={now} />
            </>
          )}
          {view === "settings" && <SettingsView />}
        </main>
      </div>

      <Capture now={now} />
    </div>
  );
}

function NavTab({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={[
        "flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors duration-150",
        active ? "bg-accent text-paper" : "text-muted hover:text-ink",
      ].join(" ")}
    >
      {children}
      <span>{label}</span>
    </button>
  );
}
