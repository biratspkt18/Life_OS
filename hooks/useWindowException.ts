"use client";
import {
  getWindowException,
  setWindowException,
  WINDOW_EXCEPTION_EVENT,
  type WindowException,
} from "../lib/effectiveWindow";
import { usePersisted } from "./usePersisted";

/**
 * React access to today's one-day window exception. Hydration-safe (null on
 * the server and first client render); synced across components and tabs.
 * Date-stamped values from other days parse to null, so expiry needs no timer.
 */
export function useWindowException(): {
  exception: WindowException | null;
  setException: (e: WindowException | null) => void;
} {
  const exception = usePersisted<WindowException | null>({
    fallback: null,
    read: getWindowException,
    event: WINDOW_EXCEPTION_EVENT,
  });
  return { exception, setException: setWindowException };
}
