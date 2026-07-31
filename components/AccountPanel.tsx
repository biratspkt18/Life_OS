"use client";
import { useState } from "react";
import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface Me {
  email: string | null;
  name: string | null;
}

/**
 * Who you're signed in as, plus the way out. Logging out clears the session
 * and returns to the login screen — where "Continue with Google" now shows
 * Google's account picker, so you can come back as a *different* account (your
 * own tasks, not the previous account's).
 */
export function AccountPanel() {
  const { data } = useSWR<Me>("/api/me", fetcher);
  const [busy, setBusy] = useState(false);

  async function logout() {
    setBusy(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      // Full navigation so the (server-rendered, auth-gated) login page reloads.
      window.location.href = "/login";
    }
  }

  return (
    <div className="surface p-5">
      <h2 className="text-base font-semibold text-ink">Account</h2>
      <p className="mb-3 mt-0.5 text-sm text-muted">
        Everything in Life OS is private to your account.
      </p>
      <div className="flex items-center justify-between gap-3 rounded-xl border border-paper-edge bg-paper-card/60 px-3.5 py-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink">Signed in</p>
          <p className="truncate text-xs text-muted">
            {data?.email ?? "…"}
          </p>
        </div>
        <button onClick={logout} disabled={busy} className="btn-ghost px-3 py-1.5 text-sm">
          {busy ? "Logging out…" : "Log out"}
        </button>
      </div>
      <p className="mt-2 text-xs text-muted-soft">
        Log out to switch to a different Google account.
      </p>
    </div>
  );
}
