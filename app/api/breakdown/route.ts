import { NextResponse } from "next/server";
import { config } from "@/lib/server/config";
import { geminiText } from "@/lib/server/gemini";
import { logEvent } from "@/lib/server/events";
import { getTask } from "@/lib/server/tasks";
import { requireUserId } from "@/lib/server/session";
import { buildBreakdownPrompt, parseStepsResponse } from "@/lib/breakdown";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Ask the LLM for 3–6 first-action steps for a stuck task. Every failure —
 * no key, rate limit, timeout, unparseable reply — degrades to
 * `{ llmUsed: false, steps: [] }` so the sheet falls back to its manual
 * editor; a raw provider error never reaches the user.
 */
export async function POST(req: Request) {
  const userId = await requireUserId();
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (typeof b.taskId !== "string" || !b.taskId) {
    return NextResponse.json({ error: "taskId required" }, { status: 400 });
  }
  const task = getTask(userId, b.taskId);
  if (!task) return NextResponse.json({ error: "not found" }, { status: 404 });

  const key = config.gemini.apiKey;
  const model = config.gemini.model;

  const done = (result: { llmUsed: boolean; steps: string[]; unavailable?: boolean }) => {
    logEvent(userId, {
      taskId: task.id,
      type: "breakdown_generated",
      tag: task.tag,
      energy: task.energy,
      payload: {
        ok: result.llmUsed,
        llmUsed: result.llmUsed,
        stepCount: result.steps.length,
        model,
        deferralCount: task.deferralCount,
      },
    });
    return NextResponse.json(result);
  };

  if (!key) return done({ llmUsed: false, steps: [] });

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: { "x-goog-api-key": key, "content-type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: buildBreakdownPrompt({
                    title: task.title,
                    tag: task.tag,
                    deferralCount: task.deferralCount,
                  }),
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.4,
            maxOutputTokens: 1024,
            responseMimeType: "application/json",
          },
        }),
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (!res.ok) {
      console.warn(`[breakdown] Gemini responded ${res.status}`);
      return done({ llmUsed: false, steps: [], unavailable: true });
    }
    const steps = parseStepsResponse(geminiText(await res.json()));
    if (!steps) return done({ llmUsed: false, steps: [], unavailable: true });
    return done({ llmUsed: true, steps });
  } catch (err) {
    console.warn("[breakdown] Gemini call failed:", err);
    return done({ llmUsed: false, steps: [], unavailable: true });
  }
}
