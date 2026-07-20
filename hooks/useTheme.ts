"use client";
import { useEffect, useState } from "react";
import {
  applyResolvedTheme,
  getStoredTheme,
  resolveTheme,
  setTheme as persistTheme,
  systemTheme,
  THEME_EVENT,
  type ResolvedTheme,
  type ThemePref,
} from "../lib/theme";

/**
 * React access to the device theme. `pref` is the user's choice
 * (system/light/dark); `resolved` is what's actually showing. Stays in sync
 * with: the Settings toggle (same-tab custom event), other tabs (storage
 * event), and — while on "system" — the OS flipping light/dark.
 */
export function useTheme(): {
  pref: ThemePref;
  resolved: ResolvedTheme;
  setTheme: (p: ThemePref) => void;
} {
  const [pref, setPref] = useState<ThemePref>("system");
  const [resolved, setResolved] = useState<ResolvedTheme>("light");

  // Hydration-safe: read storage only after mount, matching the inline script.
  useEffect(() => {
    const p = getStoredTheme();
    setPref(p);
    setResolved(resolveTheme(p));

    const onPref = () => {
      const next = getStoredTheme();
      setPref(next);
      setResolved(resolveTheme(next));
    };
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onSystem = () => {
      // Only the "system" choice tracks the OS; a hard override ignores it.
      if (getStoredTheme() === "system") {
        const r = systemTheme();
        setResolved(r);
        applyResolvedTheme(r);
      }
    };

    window.addEventListener(THEME_EVENT, onPref);
    window.addEventListener("storage", onPref);
    mq.addEventListener("change", onSystem);
    return () => {
      window.removeEventListener(THEME_EVENT, onPref);
      window.removeEventListener("storage", onPref);
      mq.removeEventListener("change", onSystem);
    };
  }, []);

  return { pref, resolved, setTheme: persistTheme };
}
