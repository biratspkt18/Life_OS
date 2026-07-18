/**
 * Task-breakdown prompt + response parsing. Pure (no DB, no fetch) so the
 * fussy part — coaxing a clean string[] out of an LLM reply — is unit-tested.
 */

/** Hard ceiling on steps in the editor and the accept route. */
export const MAX_STEPS = 8;
/** Matches the server's task-title limit. */
export const MAX_STEP_CHARS = 300;
/** How many LLM-proposed steps we keep (the prompt asks for 3–6). */
const MAX_LLM_STEPS = 6;

export function buildBreakdownPrompt(v: {
  title: string;
  tag: string | null;
  deferralCount: number;
}): string {
  return `You help a neurodivergent user break a stuck task into small, concrete
first actions.

Task: ${v.title}
Category: ${v.tag ?? "none"}
Times rescheduled: ${v.deferralCount}

Rules:
- Return 3–6 steps, each a single physical action the user can start
  without thinking.
- Start each step with a verb. No vague nouns ("sort out", "deal with").
- The first step must be almost trivially easy — the goal is starting.
- If rescheduled many times, the task is likely too big. Make steps smaller.
- Return ONLY a JSON array of strings. No preamble.`;
}

/**
 * Harden an LLM reply into a usable step list. Tolerates code fences,
 * preamble/trailing prose, and junk items; returns null when nothing usable
 * survives (callers then fall back to the manual editor).
 */
export function parseStepsResponse(raw: string): string[] | null {
  let text = raw.replace(/```(?:json)?/gi, "");
  const first = text.indexOf("[");
  const last = text.lastIndexOf("]");
  if (first === -1 || last === -1 || last <= first) return null;
  text = text.slice(first, last + 1);

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;

  const steps = parsed
    .filter((s): s is string => typeof s === "string")
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((s) => (s.length > MAX_STEP_CHARS ? s.slice(0, MAX_STEP_CHARS) : s))
    .slice(0, MAX_LLM_STEPS);

  return steps.length > 0 ? steps : null;
}
