"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useInboxTasks, usePastUndoneTasks, useSettings } from "./useDb";
import {
  buildCandidates,
  findCurrentGap,
  gapKey,
  type Gap,
  type SuggestPick,
} from "../lib/gapSuggest";
import { generateGapSuggestion, rescheduleTask } from "../lib/tasks";
import { isSameDay } from "../lib/dates";
import { windowForDay, type DayWindow, type Task, type TodayItem } from "../lib/types";
import type { EnergyLane } from "../lib/energyLane";

/**
 * The state behind the "Got a little room?" card.
 *
 * Deterministic code finds the current gap and ranks the fitting candidates —
 * that pick renders instantly. The AI is asked once per *structural* gap
 * (busy-edge to busy-edge, so its identity ignores the moving clock) to
 * re-rank and explain; its answer swaps in when it lands. Results — including
 * failures — are cached per gap in sessionStorage, so the same gap shows the
 * same suggestion all day, across the 30s SWR refresh and reloads alike. The
 * cache only turns over when the gap's boundaries change (a block added,
 * moved, or completed... which is exactly when re-asking makes sense).
 */

interface CacheEntry {
  status: "pending" | "done";
  ai: SuggestPick | null;
  /** How many times "Something else" advanced past the top pick. */
  offset: number;
  /** When "Not now" was tapped (ms epoch) — the card snoozes, not dies. */
  dismissedAt: number | null;
}

/** How long "Not now" keeps the card away. It's a snooze, not a goodbye. */
const DISMISS_SNOOZE_MS = 60 * 60_000;

// v2: entry shape changed (dismissed → dismissedAt) — old-key entries are ignored.
const CACHE_STORAGE_KEY = "lifeos-suggest-cache-v2";

let cache: Map<string, CacheEntry> | null = null;

function loadCache(): Map<string, CacheEntry> {
  if (cache) return cache;
  cache = new Map();
  if (typeof window === "undefined") return cache;
  try {
    const raw = window.sessionStorage.getItem(CACHE_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, CacheEntry>;
      const now = Date.now();
      for (const [key, entry] of Object.entries(parsed)) {
        // A gap whose end is behind us can never show again — drop it.
        const end = new Date(key.split("|")[1] ?? "");
        if (Number.isNaN(end.getTime()) || end.getTime() < now) continue;
        // An in-flight request didn't survive the reload.
        if (entry.status === "pending") entry.status = "done";
        cache.set(key, entry);
      }
    }
  } catch {
    // Corrupt storage → start fresh.
  }
  return cache;
}

function persistCache(): void {
  if (typeof window === "undefined" || !cache) return;
  try {
    window.sessionStorage.setItem(
      CACHE_STORAGE_KEY,
      JSON.stringify(Object.fromEntries(cache)),
    );
  } catch {
    // Storage full/blocked — the in-memory copy still holds for this session.
  }
}

function ensureEntry(key: string): CacheEntry {
  const c = loadCache();
  let entry = c.get(key);
  if (!entry) {
    entry = { status: "done", ai: null, offset: 0, dismissedAt: null };
    c.set(key, entry);
  }
  return entry;
}

export interface GapSuggestion {
  gap: Gap | null;
  /** What the card shows, or null (no gap, nothing fits, or dismissed). */
  pick: { task: Task; reason: string | null; aiUsed: boolean } | null;
  /** True when something fits this gap, dismissed or not (gates "day done"). */
  hasCandidates: boolean;
  /** More than one option → "Something else" makes sense. */
  hasAlternatives: boolean;
  /** Schedule the pick at the gap's usable start. Throws ConflictError on 409. */
  placeIt: () => Promise<void>;
  somethingElse: () => void;
  notNow: () => void;
}

export function useGapSuggestion(
  now: Date,
  items: TodayItem[],
  day: Date,
  excludeId?: string,
  opts?: {
    /** Active energy lane — narrows the candidate pool ("how I'm feeling now"). */
    lane?: EnergyLane | null;
    /** Effective day window override (one-day exceptions applied by the caller). */
    window?: DayWindow;
    /** The Day Battery percent, so the AI can favour lighter picks on heavy days. */
    dayLoadPercent?: number;
  },
): GapSuggestion {
  const settings = useSettings();
  const todos = useInboxTasks();
  const looseEnds = usePastUndoneTasks(now);
  const lane = opts?.lane ?? null;
  const [, setVersion] = useState(0);
  const bump = useCallback(() => setVersion((v) => v + 1), []);

  const isToday = isSameDay(day, now);
  const minuteKey = Math.floor(now.getTime() / 60000);

  const window = opts?.window;
  const gap = useMemo(
    () =>
      isToday
        ? findCurrentGap(
            items,
            window ?? windowForDay(settings, day),
            day,
            now,
            settings.defaultDurationMinutes,
          )
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isToday, items, settings, window, day.getTime(), minuteKey],
  );

  const candidates = useMemo(
    () => (gap ? buildCandidates(gap, todos, looseEnds, excludeId, lane) : []),
    [gap, todos, looseEnds, excludeId, lane],
  );

  // Lane-independent existence check: this gates the "day done" celebration,
  // and an active lane must never fake an empty day.
  const hasCandidates = useMemo(
    () =>
      gap !== null &&
      (lane === null
        ? candidates.length > 0
        : buildCandidates(gap, todos, looseEnds, excludeId).length > 0),
    [gap, candidates, todos, looseEnds, excludeId, lane],
  );

  const taskById = useMemo(() => {
    const m = new Map<string, Task>();
    for (const t of looseEnds) m.set(t.id, t);
    for (const t of todos) if (!m.has(t.id)) m.set(t.id, t);
    return m;
  }, [todos, looseEnds]);

  // Lane is part of the cache identity: each lane gets its own AI ask, swap
  // offset, and snooze. (Pruning still parses split("|")[1] as the gap end.)
  const key = gap ? `${gapKey(gap)}|${lane ?? "all"}` : null;

  // Ask the AI exactly once per structural gap. The cache entry (written
  // before the request fires) is the in-flight guard; failed and empty
  // responses are cached too, so a down provider costs one attempt, not a
  // retry storm on every refresh.
  useEffect(() => {
    if (!key || candidates.length === 0) return;
    const c = loadCache();
    if (c.has(key)) return;
    const entry: CacheEntry = { status: "pending", ai: null, offset: 0, dismissedAt: null };
    c.set(key, entry);
    persistCache();
    const ids = candidates.map((cand) => cand.id);
    // The battery load is captured at first-run for this gap (it is NOT part of
    // the cache key — that would re-roll the suggestion on every edit).
    generateGapSuggestion({
      gapStart: gap!.start,
      gapEnd: gap!.end,
      candidateIds: ids,
      dayLoadPercent: opts?.dayLoadPercent,
    })
      .then((res) => {
        entry.ai =
          res.llmUsed && typeof res.pickId === "string" && typeof res.reason === "string"
            ? {
                pickId: res.pickId,
                reason: res.reason,
                runnerUpId: res.runnerUpId ?? null,
                runnerUpReason: res.runnerUpReason ?? null,
              }
            : null;
      })
      .catch(() => {
        entry.ai = null;
      })
      .finally(() => {
        entry.status = "done";
        persistCache();
        bump();
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, candidates.length === 0]);

  const entry = key ? loadCache().get(key) : undefined;
  const ai = entry?.ai ?? null;

  // The ordered option list: AI pick first, its runner-up second, then the
  // deterministic ranking. Ids are re-validated against the *current*
  // candidates every render, so a pick that stopped fitting (the gap shrank,
  // the task got done) silently falls out rather than going stale.
  // "Not now" is a snooze: the card stays away for an hour, then may return
  // for the same gap. (`now` ticks by the minute, so expiry shows up promptly.)
  const snoozed =
    entry?.dismissedAt != null && now.getTime() - entry.dismissedAt < DISMISS_SNOOZE_MS;

  const pick = useMemo(() => {
    if (!gap || candidates.length === 0 || snoozed) return null;
    const ids = candidates.map((c) => c.id);
    const front = ai ? [ai.pickId, ...(ai.runnerUpId ? [ai.runnerUpId] : [])] : [];
    const ordered = [
      ...front.filter((id) => ids.includes(id)),
      ...ids.filter((id) => !front.includes(id)),
    ];
    if (ordered.length === 0) return null;
    const shownId = ordered[(entry?.offset ?? 0) % ordered.length];
    const task = taskById.get(shownId);
    if (!task) return null;
    const reason =
      ai && shownId === ai.pickId
        ? ai.reason
        : ai && shownId === ai.runnerUpId
          ? ai.runnerUpReason
          : null;
    return { task, reason, aiUsed: ai !== null };
  }, [gap, candidates, taskById, ai, snoozed, entry?.offset]);

  const placeIt = useCallback(async () => {
    if (!gap || !pick) return;
    await rescheduleTask(pick.task.id, gap.usableStart, {
      chosenVia: "first_fit",
      proposedStart: gap.usableStart.toISOString(),
    });
  }, [gap, pick]);

  const somethingElse = useCallback(() => {
    if (!key) return;
    ensureEntry(key).offset += 1;
    persistCache();
    bump();
  }, [key, bump]);

  const notNow = useCallback(() => {
    if (!key) return;
    ensureEntry(key).dismissedAt = Date.now();
    persistCache();
    bump();
  }, [key, bump]);

  return {
    gap,
    pick,
    hasCandidates,
    hasAlternatives: candidates.length > 1,
    placeIt,
    somethingElse,
    notNow,
  };
}
