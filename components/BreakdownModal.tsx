"use client";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useAllTasks, useSettings } from "../hooks/useDb";
import {
  acceptBreakdown,
  generateBreakdown,
  logClientEvent,
  type BreakdownResult,
} from "../lib/tasks";
import { breakdownThreshold, type Task } from "../lib/types";
import { MAX_STEPS } from "../lib/breakdown";
import { CloseIcon, PlusIcon, TrashIcon } from "./icons";
import { Button } from "./ui/button";

const EVENT = "lifeos:breakdown";

/** Open the breakdown sheet for a task, from anywhere. */
export function openBreakdown(taskId: string) {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { taskId } }));
}

/**
 * A calm one-liner shown under a task that has moved past the threshold:
 * a neutral fact and an offer, never a badge or a wash of colour. The app
 * proposes; the user decides. Shared by the To-do and Loose-ends rows.
 */
const promptShown = new Set<string>();

export function DeferralNote({ task }: { task: Task }) {
  const settings = useSettings();
  const show = !task.completed && task.deferralCount >= breakdownThreshold(settings);

  useEffect(() => {
    if (show && !promptShown.has(task.id)) {
      promptShown.add(task.id);
      logClientEvent("breakdown_prompt_shown", task.id, {
        deferralCount: task.deferralCount,
      });
    }
  }, [show, task.id, task.deferralCount]);

  if (!show) return null;
  return (
    <p className="mt-1 text-xs text-muted">
      Moved {task.deferralCount} times ·{" "}
      <button
        type="button"
        onClick={() => openBreakdown(task.id)}
        className="font-medium text-accent underline-offset-2 hover:underline"
      >
        break it into smaller steps?
      </button>
    </p>
  );
}

/**
 * The breakdown sheet: proposes 3–6 tiny first actions for a stuck task
 * (LLM-drafted when configured, hand-written otherwise), every step editable,
 * and on accept the steps replace the task as unscheduled to-dos the user
 * schedules whenever they like. Rendered once, in the Shell.
 */
export function BreakdownHost() {
  const [taskId, setTaskId] = useState<string | null>(null);
  const tasks = useAllTasks();
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    function onOpen(e: Event) {
      setTaskId((e as CustomEvent<{ taskId: string }>).detail.taskId);
    }
    window.addEventListener(EVENT, onOpen);
    return () => window.removeEventListener(EVENT, onOpen);
  }, []);

  if (!taskId) return null;
  const task = tasks.find((t) => t.id === taskId);
  if (!task) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div
        className="absolute inset-0 animate-fade-in bg-ink/25 backdrop-blur-[2px]"
        onClick={() => setTaskId(null)}
      />
      <motion.div
        className="surface relative z-10 flex max-h-[min(85dvh,38rem)] w-full max-w-md flex-col overflow-hidden rounded-b-none rounded-t-2xl sm:m-4 sm:rounded-2xl"
        initial={reduceMotion ? { opacity: 0 } : { y: 24, opacity: 0, scale: 0.98 }}
        animate={reduceMotion ? { opacity: 1 } : { y: 0, opacity: 1, scale: 1 }}
        transition={{ type: "spring", stiffness: 380, damping: 32 }}
      >
        {/* Keyed by task id so a fresh open starts a fresh draft. */}
        <BreakdownSheet key={task.id} task={task} onClose={() => setTaskId(null)} />
      </motion.div>
    </div>
  );
}

/** Editor rows need stable keys (index keys break exit animations on remove). */
interface StepDraft {
  id: number;
  text: string;
}
let nextStepId = 1;
const mkStep = (text: string): StepDraft => ({ id: nextStepId++, text });

function BreakdownSheet({ task, onClose }: { task: Task; onClose: () => void }) {
  const [loading, setLoading] = useState(true);
  const [steps, setSteps] = useState<StepDraft[]>([]);
  const [llmUsed, setLlmUsed] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // The LLM's original proposal, for the `edited` flag in the event log.
  const originalRef = useRef<string[]>([]);
  const acceptedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    generateBreakdown(task.id)
      .then((r: BreakdownResult) => {
        if (cancelled) return;
        originalRef.current = r.steps;
        // Manual mode starts with one empty field so typing can begin at once.
        setSteps(r.steps.length > 0 ? r.steps.map(mkStep) : [mkStep("")]);
        setLlmUsed(r.llmUsed);
        setUnavailable(r.unavailable ?? false);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setSteps([mkStep("")]);
        setUnavailable(true);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task.id]);

  // Escape closes; closing without accepting is a dismissal worth remembering.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => {
      if (!acceptedRef.current) {
        logClientEvent("breakdown_dismissed", task.id, {
          llmUsed,
          stepCount: steps.filter((s) => s.text.trim()).length,
        });
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cleanSteps = steps.map((s) => s.text.trim()).filter((s) => s.length > 0);
  const edited =
    originalRef.current.length !== cleanSteps.length ||
    originalRef.current.some((s, i) => s !== cleanSteps[i]);

  async function accept() {
    if (saving || cleanSteps.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      await acceptBreakdown(task.id, cleanSteps, { llmUsed, edited });
      acceptedRef.current = true;
      onClose();
    } catch {
      setSaving(false);
      setError("Couldn't save the steps — try again.");
    }
  }

  return (
    <>
      <div className="shrink-0 px-5 pt-5">
        <div className="mb-1 flex items-start justify-between">
          <h2 className="font-display text-lg font-bold tracking-tight text-ink">
            Break it into steps
          </h2>
          <button
            onClick={onClose}
            className="-mr-1.5 -mt-1 rounded-lg p-1.5 text-muted-soft transition-colors hover:bg-paper-edge/60 hover:text-ink"
            aria-label="Close"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>
        <p className="text-sm font-medium text-ink">{task.title}</p>
        <p className="mb-3 mt-0.5 text-xs text-muted">
          These will replace it as separate to-dos — schedule them whenever you like.
        </p>
      </div>

      {loading ? (
        <motion.p
          className="px-5 pb-8 pt-2 text-sm text-muted"
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
        >
          Sketching a few first steps…
        </motion.p>
      ) : (
        <>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5">
            {unavailable && (
              <p className="mb-2 text-xs text-muted">
                Couldn't fetch suggestions right now — write your own below.
              </p>
            )}
            {!unavailable && !llmUsed && (
              <p className="mb-2 text-xs text-muted">
                Write the first tiny actions yourself — the first one should be almost
                silly-small.
              </p>
            )}
            <div className="space-y-2">
              <AnimatePresence initial={false}>
                {steps.map((step, i) => (
                  <motion.div
                    key={step.id}
                    layout
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, height: 0, transition: { duration: 0.2 } }}
                    transition={{ type: "spring", stiffness: 460, damping: 34 }}
                    className="flex items-center gap-2 overflow-hidden"
                  >
                    <input
                      value={step.text}
                      onChange={(e) =>
                        setSteps((prev) =>
                          prev.map((s) => (s.id === step.id ? { ...s, text: e.target.value } : s)),
                        )
                      }
                      placeholder={i === 0 ? "The almost-silly-small first move" : "Then…"}
                      maxLength={300}
                      className="field flex-1 text-sm"
                      aria-label={`Step ${i + 1}`}
                    />
                    <button
                      type="button"
                      onClick={() => setSteps((prev) => prev.filter((s) => s.id !== step.id))}
                      disabled={steps.length <= 1}
                      className="rounded-lg p-1.5 text-muted-soft transition-colors hover:text-ink disabled:opacity-40"
                      aria-label={`Remove step ${i + 1}`}
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
            {steps.length < MAX_STEPS && (
              <button
                type="button"
                onClick={() => setSteps((prev) => [...prev, mkStep("")])}
                className="mt-2 flex items-center gap-1.5 rounded-lg px-1.5 py-1 text-sm font-medium text-accent transition-colors hover:text-accent-soft"
              >
                <PlusIcon className="h-4 w-4" /> Add a step
              </button>
            )}
          </div>

          <div className="shrink-0 space-y-2.5 border-t border-paper-edge px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3 sm:pb-5">
            {error && <p className="text-xs font-medium text-accent">{error}</p>}
            <div className="flex gap-2">
              <Button variant="ghost" onClick={onClose} className="flex-none">
                Cancel
              </Button>
              <Button onClick={accept} disabled={cleanSteps.length === 0 || saving} className="flex-1">
                {saving
                  ? "Saving…"
                  : `Replace with ${cleanSteps.length || "these"} step${cleanSteps.length === 1 ? "" : "s"}`}
              </Button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
