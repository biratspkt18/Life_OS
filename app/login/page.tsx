"use client";
import { useState } from "react";

export default function LoginPage() {
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ passcode }),
    });
    setBusy(false);
    if (res.ok) {
      window.location.href = "/";
    } else {
      setError("That passcode didn't work.");
    }
  }

  return (
    <div className="paper-grain relative flex min-h-screen items-center justify-center px-4">
      <form
        onSubmit={submit}
        className="surface relative z-10 w-full max-w-sm animate-scale-in p-6"
      >
        <h1 className="text-xl font-bold tracking-tight text-ink">Life OS</h1>
        <p className="mb-4 mt-0.5 text-sm text-muted">Enter your passcode to continue.</p>
        <input
          type="password"
          autoFocus
          value={passcode}
          onChange={(e) => setPasscode(e.target.value)}
          placeholder="Passcode"
          className="field"
          aria-label="Passcode"
        />
        {error && <p className="mt-2 text-sm text-accent">{error}</p>}
        <button type="submit" disabled={busy || !passcode} className="btn-primary mt-4 w-full">
          {busy ? "Checking…" : "Unlock"}
        </button>
      </form>
    </div>
  );
}
