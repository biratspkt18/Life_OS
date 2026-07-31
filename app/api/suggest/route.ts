import { NextResponse } from "next/server";
import { z } from "zod";
import { config } from "@/lib/server/config";
import { geminiText } from "@/lib/server/gemini";
import { listTasks } from "@/lib/server/tasks";
import { requireUserId } from "@/lib/server/session";
import {
  buildSuggestPrompt,
  computeTagTimeStats,
  formatLocalHHmm,
  parseSuggestResponse,
  type SuggestContext,
} from "@/lib/gapSuggest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const isoDate = z.string().refine((s) => !Number.isNaN(Date.parse(s)), "invalid datetime");

/** The request body — validated at the boundary, so the handler works with a typed value. */
const SuggestBody = z
  .object({
    gapStart: isoDate,
    gapEnd: isoDate,
    candidateIds: z.array(z.string()).min(1).max(15),
    tzOffsetMinutes: z.number().finite(),
    // A bad battery value just drops the prompt line — never a 400.
    dayLoadPercent: z.number().finite().optional().catch(undefined),
  })
  .refine((b) => Date.parse(b.gapEnd) > Date.parse(b.gapStart), "gapEnd must be after gapStart");

/**
 * Rank the gap candidates with the LLM and get its one-sentence reason. The
 * client sends only the gap and candidate ids; the tasks themselves are
 * re-read from the DB so the prompt never trusts client-shaped data. Every
 * failure — no key, timeout, bad reply, pick outside the candidate list —
 * degrades to `{ llmUsed: false }`: the card already shows the deterministic
 * pick, so nothing here may block or break it.
 */
export async function POST(req: Request) {
  const userId = await requireUserId();

  const parsed = SuggestBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }
  const gapStart = new Date(parsed.data.gapStart);
  const gapEnd = new Date(parsed.data.gapEnd);
  const ids = parsed.data.candidateIds;
  const tzOffsetMinutes = parsed.data.tzOffsetMinutes;
  const dayLoadPercent =
    parsed.data.dayLoadPercent != null ? Math.max(0, Math.round(parsed.data.dayLoadPercent)) : undefined;

  const key = config.gemini.apiKey;
  const model = config.gemini.model;
  if (!key) return NextResponse.json({ llmUsed: false });

  const all = listTasks(userId);
  const candidates = ids
    .map((id) => all.find((t) => t.id === id))
    .filter((t): t is NonNullable<typeof t> => t != null && !t.completed);
  if (candidates.length === 0) return NextResponse.json({ llmUsed: false });

  const candidateTags = new Set(candidates.map((c) => c.tag).filter((t) => t != null));
  const ctx: SuggestContext = {
    now: formatLocalHHmm(new Date(), tzOffsetMinutes),
    gap: {
      start: formatLocalHHmm(gapStart, tzOffsetMinutes),
      end: formatLocalHHmm(gapEnd, tzOffsetMinutes),
      minutes: Math.round((gapEnd.getTime() - gapStart.getTime()) / 60_000),
    },
    ...(dayLoadPercent != null ? { dayLoadPercent } : {}),
    candidates: candidates.map((t) => ({
      id: t.id,
      title: t.title,
      tag: t.tag,
      energy: t.energy,
      minutes: t.durationMinutes,
      importance: t.importance,
      due: t.dueDate ? t.dueDate.slice(0, 10) : null,
      preferred: t.preferredDate ? t.preferredDate.slice(0, 10) : null,
      timesRescheduled: t.deferralCount,
    })),
    tagHistory: computeTagTimeStats(all, tzOffsetMinutes).filter((s) => candidateTags.has(s.tag)),
  };

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: { "x-goog-api-key": key, "content-type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: buildSuggestPrompt(ctx) }] }],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 512,
            responseMimeType: "application/json",
            // A tiny structured pick under a 3s deadline — no thinking budget.
            // If a custom GEMINI_MODEL rejects this, the catch degrades cleanly.
            thinkingConfig: { thinkingBudget: 0 },
          },
        }),
        signal: AbortSignal.timeout(3_000),
      },
    );
    if (!res.ok) {
      console.warn(`[suggest] Gemini responded ${res.status}`);
      return NextResponse.json({ llmUsed: false });
    }
    const pick = parseSuggestResponse(
      geminiText(await res.json()),
      candidates.map((c) => c.id),
    );
    if (!pick) return NextResponse.json({ llmUsed: false });
    return NextResponse.json({ llmUsed: true, ...pick });
  } catch (err) {
    console.warn("[suggest] Gemini call failed:", err);
    return NextResponse.json({ llmUsed: false });
  }
}
