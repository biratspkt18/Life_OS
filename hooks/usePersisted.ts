"use client";
import { useEffect, useState } from "react";

/**
 * The shared body of the per-device settings hooks (energy lane, window
 * exception, and the like): render a hydration-safe fallback, then after mount
 * read the real value and re-read whenever it changes — via the module's own
 * same-tab `CustomEvent`, another tab's `storage` event, or a change in
 * `revalidateOn` (e.g. the day rolling over for a date-stamped value).
 *
 * `read` must be SSR-safe (return the fallback when `window` is undefined).
 */
export function usePersisted<T>(
  opts: { fallback: T; read: () => T; event: string },
  revalidateOn?: unknown,
): T {
  const [value, setValue] = useState<T>(opts.fallback);

  useEffect(() => {
    setValue(opts.read());
    const onChange = () => setValue(opts.read());
    window.addEventListener(opts.event, onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener(opts.event, onChange);
      window.removeEventListener("storage", onChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revalidateOn]);

  return value;
}
