"use client";
import { useEffect, useState } from "react";
import useSWR from "swr";
import { disablePush, enablePush, pushState, type PushState } from "../lib/client/push";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface GoogleStatus {
  connected: boolean;
  email: string | null;
}

export function ConnectPanel() {
  return (
    <div className="surface p-5">
      <h2 className="text-base font-semibold text-ink">Connect &amp; notify</h2>
      <p className="mb-3 mt-0.5 text-sm text-muted">
        Mirror tasks to your calendar and get reminders.
      </p>
      <div className="space-y-3">
        <GoogleRow />
        <NotifyRow />
      </div>
    </div>
  );
}

function GoogleRow() {
  const { data, mutate } = useSWR<GoogleStatus>("/api/google/status", fetcher);
  const connected = data?.connected;

  async function disconnect() {
    await fetch("/api/google/disconnect", { method: "POST" });
    mutate();
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-paper-edge bg-paper-card/60 px-3.5 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-ink">Google Calendar</p>
        <p className="truncate text-xs text-muted">
          {connected
            ? `Connected${data?.email ? ` · ${data.email}` : ""}`
            : "New tasks become real calendar events."}
        </p>
      </div>
      {connected ? (
        <button onClick={disconnect} className="btn-ghost px-3 py-1.5 text-sm">
          Disconnect
        </button>
      ) : (
        // Full navigation (not fetch) so Google's consent page loads.
        <a href="/api/google/connect" className="btn-primary px-3 py-1.5 text-sm">
          Connect
        </a>
      )}
    </div>
  );
}

function NotifyRow() {
  const [state, setState] = useState<PushState>("disabled");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    pushState().then(setState);
  }, []);

  async function toggle() {
    setBusy(true);
    setError(null);
    try {
      if (state === "enabled") {
        await disablePush();
      } else {
        const res = await enablePush();
        if (!res.ok) setError(res.reason ?? "Couldn't enable notifications.");
      }
      setState(await pushState());
    } finally {
      setBusy(false);
    }
  }

  const unsupported = state === "unsupported";
  const denied = state === "denied";

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-paper-edge bg-paper-card/60 px-3.5 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-ink">Reminders</p>
        <p className="truncate text-xs text-muted">
          {unsupported
            ? "This browser doesn't support push."
            : denied
              ? "Blocked — enable notifications in browser settings."
              : error
                ? error
                : "Per-task ping + a morning summary."}
        </p>
      </div>
      <button
        onClick={toggle}
        disabled={busy || unsupported || denied}
        className={state === "enabled" ? "btn-ghost px-3 py-1.5 text-sm" : "btn-primary px-3 py-1.5 text-sm"}
      >
        {state === "enabled" ? "Turn off" : "Enable"}
      </button>
    </div>
  );
}
