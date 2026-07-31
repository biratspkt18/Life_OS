import { z } from "zod";

/**
 * The shape of a Gemini `generateContent` response, validated at the boundary
 * with zod instead of hand-walked with `as` casts + optional chaining (which
 * was duplicated in the suggest and breakdown routes). Anything that doesn't
 * fit yields "" — the callers already treat empty text as "LLM unavailable".
 */
const GeminiResponse = z.object({
  candidates: z
    .array(
      z.object({
        content: z
          .object({
            parts: z.array(z.object({ text: z.string().optional() })).optional(),
          })
          .optional(),
      }),
    )
    .optional(),
});

/** The concatenated text of a Gemini response, or "" if the shape is unexpected. */
export function geminiText(json: unknown): string {
  const parsed = GeminiResponse.safeParse(json);
  if (!parsed.success) return "";
  return parsed.data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
}
