"use client";
import { useEffect, useState } from "react";
import useSWR from "swr";
import { CalendarIcon, CloseIcon } from "./icons";

interface GoogleStatus {
  connected: boolean;
  email: string | null;
  configured: boolean;
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());
const DISMISS_KEY = "daybook:google-prompt-dismissed";

/**
 * Proactively asks the user to connect Google Calendar so new tasks mirror to
 * real calendar events. Shows once until dismissed (or until connected). Lives
 * on the main screen rather than buried in Settings.
 */
export function ConnectPrompt() {
  const { data, mutate } = useSWR<GoogleStatus>("/api/google/status", fetcher);
  const [dismissed, setDismissed] = useState(true); // assume hidden until we read localStorage

  // Read the persisted dismissal on mount (client only).
  useEffect(() => {
    setDismissed(localStorage.getItem(DISMISS_KEY) === "1");
  }, []);

  // After the OAuth round-trip the callback redirects to /?google=connected|error.
  // Revalidate status and clean the URL so the param doesn't stick around.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const result = params.get("google");
    if (!result) return;
    if (result === "connected") {
      mutate();
      // A fresh connection clears any prior dismissal so the confirmation shows.
      localStorage.removeItem(DISMISS_KEY);
      setDismissed(false);
    }
    params.delete("google");
    const qs = params.toString();
    window.history.replaceState(
      {},
      "",
      window.location.pathname + (qs ? `?${qs}` : ""),
    );
  }, [mutate]);

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, "1");
    setDismissed(true);
  }

  // Wait for status to load; once connected there's nothing to ask.
  if (!data || data.connected) return null;
  if (dismissed) return null;

  const configured = data.configured;

  return (
    <div className="surface mb-5 flex items-start gap-3.5 border-l-[3px] border-l-accent bg-paper-card p-4">
      <div className="mt-0.5 shrink-0 rounded-full bg-accent/10 p-2 text-accent">
        <CalendarIcon className="h-5 w-5" />
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ink">Connect Google Calendar</p>
        <p className="mt-0.5 text-sm text-muted">
          {configured
            ? "Mirror your scheduled tasks to your calendar and keep them in sync everywhere."
            : "Google sign-in isn't set up yet. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to your .env, then restart."}
        </p>

        <div className="mt-3 flex items-center gap-2">
          {configured ? (
            // Full navigation (not fetch) so Google's consent page loads.
            <a href="/api/google/connect" className="btn-primary px-3 py-1.5 text-sm">
              Connect
            </a>
          ) : (
            <a
              href="https://console.cloud.google.com/apis/credentials"
              target="_blank"
              rel="noreferrer"
              className="btn-primary px-3 py-1.5 text-sm"
            >
              Set up Google
            </a>
          )}
          <button onClick={dismiss} className="btn-ghost px-3 py-1.5 text-sm">
            Not now
          </button>
        </div>
      </div>

      <button
        onClick={dismiss}
        className="btn-ghost -mr-1 -mt-1 shrink-0 px-2 py-1.5"
        aria-label="Dismiss"
      >
        <CloseIcon className="h-4 w-4" />
      </button>
    </div>
  );
}
