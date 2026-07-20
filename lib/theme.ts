/**
 * Theme preference, remembered per device (not per account). The Cue palette
 * lives as CSS variables in `globals.css`; switching themes just flips a
 * `data-theme` attribute on <html>, which re-points every `--…` token.
 *
 * Three choices:
 *   - "system" — follow the OS (default). Re-resolves live as the OS flips.
 *   - "light" / "dark" — a hard override, ignoring the OS.
 *
 * Kept dependency-free and framework-agnostic so the same `applyTheme` runs
 * both from React (the Settings toggle) and from the tiny inline script in
 * `layout.tsx` that sets the attribute *before* first paint (no flash).
 */

export type ThemePref = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

export const THEME_KEY = "lifeos-theme";
const THEME_EVENT = "lifeos:theme";

/** A stored value we don't recognise (or nothing) means: follow the system. */
export function isThemePref(v: unknown): v is ThemePref {
  return v === "system" || v === "light" || v === "dark";
}

/** The OS-level preference right now, safe to call on the server (defaults light). */
export function systemTheme(): ResolvedTheme {
  if (typeof window === "undefined" || !window.matchMedia) return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** What a preference actually renders as. */
export function resolveTheme(pref: ThemePref): ResolvedTheme {
  return pref === "system" ? systemTheme() : pref;
}

export function getStoredTheme(): ThemePref {
  if (typeof window === "undefined") return "system";
  const v = window.localStorage.getItem(THEME_KEY);
  return isThemePref(v) ? v : "system";
}

/** Paint the resolved theme onto <html> (attribute + native color-scheme). */
export function applyResolvedTheme(resolved: ResolvedTheme): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.dataset.theme = resolved;
  root.style.colorScheme = resolved;
}

/** Persist a choice, apply it, and let same-tab listeners (the toggle) re-render. */
export function setTheme(pref: ThemePref): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(THEME_KEY, pref);
  applyResolvedTheme(resolveTheme(pref));
  window.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: pref }));
}

export { THEME_EVENT };
