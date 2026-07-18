/**
 * Tag normalization, shared by the capture UI and server validation so both
 * sides agree on what counts as the same tag. Pure — no DB, no Node.
 *
 * Tags are born from use: there is no tags table, the list is just the
 * distinct values on the user's tasks. Case is preserved as typed; dedup at
 * selection time is case-insensitive via `findTagMatch`.
 */

export const MAX_TAG_CHARS = 40;

/** Trim, collapse inner whitespace, cap length. Empty/invalid → null. */
export function normalizeTag(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim().replace(/\s+/g, " ");
  if (t.length === 0 || t.length > MAX_TAG_CHARS) return null;
  return t;
}

/** Case-insensitive lookup so typing "Uni" selects an existing "uni". */
export function findTagMatch(existing: string[], candidate: string): string | null {
  const needle = candidate.trim().toLowerCase();
  if (!needle) return null;
  return existing.find((t) => t.toLowerCase() === needle) ?? null;
}
