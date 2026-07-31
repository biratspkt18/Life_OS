"use client";
import { CloseIcon, SearchIcon } from "./icons";

/**
 * A small, controlled search box shared by the To-do and Loose-ends screens.
 * Filtering itself lives in each view (they filter different shapes); this is
 * just the input, with a clear button that appears once there's a query.
 */
export function SearchField({
  value,
  onChange,
  placeholder = "Search…",
  className = "mb-4",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  /** Layout overrides (margins / flex sizing) when composed into a row. */
  className?: string;
}) {
  return (
    <div className={`relative ${className}`}>
      <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-soft" />
      <input
        type="search"
        inputMode="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="field pl-9 pr-9 [&::-webkit-search-cancel-button]:appearance-none"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Clear search"
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1 text-muted-soft transition-colors hover:text-ink"
        >
          <CloseIcon className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

/** Case/whitespace-insensitive match against a task's title and tag. */
export function matchesQuery(query: string, title: string, tag: string | null): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return title.toLowerCase().includes(q) || (tag?.toLowerCase().includes(q) ?? false);
}
