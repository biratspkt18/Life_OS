"use client";
import { useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useTags } from "../hooks/useDb";
import { findTagMatch, normalizeTag } from "../lib/tags";
import { PlusIcon } from "./icons";

/**
 * Single optional tag for a task. Existing tags (born from use — the list is
 * empty until the first tagged task) render as chips; "New tag" reveals a
 * small input. A typed name that matches an existing tag case-insensitively
 * selects that spelling, so "Uni" never creates a twin of "uni". New names
 * only persist when the task itself saves — a typo never pollutes the list.
 */
export function TagField({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (tag: string | null) => void;
}) {
  const tags = useTags();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // A just-typed tag isn't in the fetched list yet — show it as a chip too.
  const options = value && !tags.some((t) => t === value) ? [value, ...tags] : tags;

  function commitDraft() {
    const normalized = normalizeTag(draft);
    if (normalized) onChange(findTagMatch(tags, normalized) ?? normalized);
    setDraft("");
    setAdding(false);
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        {options.map((tag) => {
          const active = value === tag;
          return (
            <button
              key={tag}
              type="button"
              onClick={() => onChange(active ? null : tag)}
              aria-pressed={active}
              className={`chip ${active ? "chip-active" : ""}`}
            >
              {tag}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => {
            setAdding((a) => !a);
            requestAnimationFrame(() => inputRef.current?.focus());
          }}
          aria-expanded={adding}
          className={`chip ${adding ? "chip-active" : ""}`}
        >
          <PlusIcon className="mr-1 inline h-3 w-3 align-[-1px]" />
          New tag
        </button>
      </div>

      <AnimatePresence initial={false}>
        {adding && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <input
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commitDraft}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault(); // don't submit the capture sheet
                  commitDraft();
                }
                if (e.key === "Escape") {
                  setDraft("");
                  setAdding(false);
                }
              }}
              placeholder={tags.length === 0 ? "e.g. uni, personal, football…" : "Name the tag"}
              maxLength={40}
              className="field mt-2 text-sm"
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
