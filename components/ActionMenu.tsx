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

// Estimated panel size for viewport-fit maths, measured before the panel
// exists: min-w-[10.5rem] + padding wide, ~38px per item + p-1 tall.
const MENU_W = 176;
const EDGE = 8; // minimum gap to the viewport edge
const menuHeight = (count: number) => count * 38 + 10;

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
  const [pos, setPos] = useState<{ top: number; right: number; up: boolean } | null>(null);
  const [mounted, setMounted] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);
  // Notify only on real open/close transitions — firing on mount would tell a
  // host "the menu just closed" the moment it renders (the Timeline popover
  // schedules its own dismissal off that signal).
  const prevOpen = useRef(open);
  useEffect(() => {
    if (prevOpen.current === open) return;
    prevOpen.current = open;
    onOpenChange?.(open);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const place = () => {
      const r = btnRef.current?.getBoundingClientRect();
      if (!r) return;
      // Open below the button, flipping above it when the panel wouldn't fit;
      // clamp horizontally so the right-aligned panel never leaves the screen.
      const h = menuHeight(actions.length);
      const up = r.bottom + 6 + h > window.innerHeight - EDGE;
      const top = up ? Math.max(EDGE, r.top - 6 - h) : r.bottom + 6;
      const right = Math.min(
        Math.max(EDGE, window.innerWidth - r.right),
        window.innerWidth - MENU_W - EDGE,
      );
      setPos({ top, right, up });
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
                initial={{ opacity: 0, scale: 0.96, y: pos.up ? 4 : -4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: pos.up ? 4 : -4 }}
                transition={{ duration: 0.14, ease: "easeOut" }}
                style={{ position: "fixed", top: pos.top, right: pos.right }}
                className={cn(
                  "z-[60] min-w-[10.5rem] overflow-hidden rounded-xl border border-paper-edge bg-paper-card p-1 shadow-lift",
                  pos.up ? "origin-bottom" : "origin-top",
                )}
              >
                <MenuItems
                  actions={actions}
                  onPick={(a) => {
                    setOpen(false);
                    a.onClick();
                  }}
                />
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </>
  );
}

/** The action buttons themselves, shared by the ⋯ popover and the context menu. */
function MenuItems({
  actions,
  onPick,
}: {
  actions: MenuAction[];
  onPick: (a: MenuAction) => void;
}) {
  return (
    <>
      {actions.map((a, i) => (
        <button
          key={i}
          role="menuitem"
          type="button"
          onClick={() => onPick(a)}
          className={cn(
            "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm font-medium transition-colors",
            a.danger ? "text-danger hover:bg-danger-wash" : "text-ink hover:bg-paper-edge/60",
          )}
        >
          {a.icon && <span className="shrink-0">{a.icon}</span>}
          {a.label}
        </button>
      ))}
    </>
  );
}

/**
 * The same action list, opened at an arbitrary screen point (a right-click)
 * instead of from a ⋯ button. Portaled + fixed like ActionMenu so no ancestor
 * clipping applies. Closes on outside press, Escape, scroll, or resize.
 */
export function ContextMenu({
  actions,
  position,
  onClose,
}: {
  actions: MenuAction[];
  position: { x: number; y: number };
  onClose: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onClose);
    window.addEventListener("scroll", onClose, true);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onClose);
      window.removeEventListener("scroll", onClose, true);
    };
  }, [onClose]);

  if (!mounted) return null;

  // Keep the menu on-screen: open right/below the cursor by default, flipping
  // to the left of / above it when it wouldn't fit that side.
  const menuH = menuHeight(actions.length);
  const flipX = position.x + MENU_W > window.innerWidth - EDGE;
  const flipY = position.y + menuH > window.innerHeight - EDGE;
  const left = Math.max(EDGE, flipX ? position.x - MENU_W : position.x);
  const top = Math.max(EDGE, flipY ? position.y - menuH : position.y);

  return createPortal(
    <motion.div
      ref={menuRef}
      role="menu"
      initial={{ opacity: 0, scale: 0.96, y: flipY ? 4 : -4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.14, ease: "easeOut" }}
      style={{ position: "fixed", top, left }}
      className={cn(
        "z-[60] min-w-[10.5rem] overflow-hidden rounded-xl border border-paper-edge bg-paper-card p-1 shadow-lift",
        flipY ? (flipX ? "origin-bottom-right" : "origin-bottom-left") : flipX ? "origin-top-right" : "origin-top-left",
      )}
    >
      <MenuItems
        actions={actions}
        onPick={(a) => {
          onClose();
          a.onClick();
        }}
      />
    </motion.div>,
    document.body,
  );
}
