"use client";
import { useEffect, type ReactNode } from "react";
import { motion } from "motion/react";
import { CloseIcon } from "../icons";

/**
 * The shared modal recipe — the fixed scrim, the spring-in sheet, Escape and
 * backdrop-click to close, and the titled header with a close button — that was
 * hand-rolled in every small dialog (NewDateModal, DayEdgePrompt, …). One place
 * to fix accessibility (role/aria-modal) and motion, instead of six.
 *
 * Bottom-sheet on mobile, centred card on desktop. Provide the body as
 * children; keep any action buttons inside them.
 */
export function Dialog({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div
        className="absolute inset-0 bg-ink/25 backdrop-blur-[2px] animate-fade-in"
        onClick={onClose}
      />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="surface relative z-10 w-full max-w-sm rounded-b-none rounded-t-2xl p-5 sm:m-4 sm:rounded-2xl"
        initial={{ y: 24, opacity: 0, scale: 0.98 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        transition={{ type: "spring", stiffness: 380, damping: 32 }}
      >
        <div className="mb-1 flex items-start justify-between">
          <h2 className="font-display text-lg font-bold tracking-tight text-ink">{title}</h2>
          <button
            onClick={onClose}
            className="-mr-1.5 -mt-1 rounded-lg p-1.5 text-muted-soft transition-colors hover:bg-paper-edge/60 hover:text-ink"
            aria-label="Close"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>
        {children}
      </motion.div>
    </div>
  );
}
