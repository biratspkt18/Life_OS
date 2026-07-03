"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "../lib/utils";
import { DotsIcon } from "./icons";

export interface MenuAction {
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  /** Render in the destructive (terracotta) style. */
  danger?: boolean;
}

/**
 * A compact overflow menu — a "⋯" button that opens a small popover of actions.
 * Keeps rows uncluttered by tucking edit / reschedule / delete behind one control.
 *
 * The popover is rendered in a portal and positioned with fixed coordinates, so
 * it's never clipped by a row's `overflow-hidden` (which the animated rows use).
 * Closes on outside-click, Escape, or scroll-away.
 */
export function ActionMenu({
  actions,
  label = "More actions",
  onOpenChange,
}: {
  actions: MenuAction[];
  label?: string;
  /** Notified whenever the menu opens or closes (e.g. to pin a hover popover). */
  onOpenChange?: (open: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const [mounted, setMounted] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    onOpenChange?.(open);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const place = () => {
      const r = btnRef.current?.getBoundingClientRect();
      if (r) setPos({ top: r.bottom + 6, right: Math.max(8, window.innerWidth - r.right) });
    };
    place();
    const onDown = (e: MouseEvent) => {
      if (
        !btnRef.current?.contains(e.target as Node) &&
        !menuRef.current?.contains(e.target as Node)
      )
        setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "rounded-lg p-1.5 text-muted-soft transition-colors hover:bg-paper-edge/60 hover:text-ink",
          open && "bg-paper-edge/60 text-ink",
        )}
      >
        <DotsIcon className="h-4 w-4" />
      </button>

      {mounted &&
        createPortal(
          <AnimatePresence>
            {open && pos && (
              <motion.div
                ref={menuRef}
                role="menu"
                initial={{ opacity: 0, scale: 0.96, y: -4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: -4 }}
                transition={{ duration: 0.14, ease: "easeOut" }}
                style={{ position: "fixed", top: pos.top, right: pos.right }}
                className="z-[60] min-w-[10.5rem] origin-top overflow-hidden rounded-xl border border-paper-edge bg-paper-card p-1 shadow-lift"
              >
                {actions.map((a, i) => (
                  <button
                    key={i}
                    role="menuitem"
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      a.onClick();
                    }}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm font-medium transition-colors",
                      a.danger
                        ? "text-danger hover:bg-danger-wash"
                        : "text-ink hover:bg-paper-edge/60",
                    )}
                  >
                    {a.icon && <span className="shrink-0">{a.icon}</span>}
                    {a.label}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </>
  );
}
