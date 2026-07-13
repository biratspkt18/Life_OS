"use client";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "../lib/utils";

/**
 * The "you're clear" card — day finished, no loose ends, empty to-do list.
 * One component, two temperatures: `pop` fires a one-shot burst of paper-
 * palette specks for real achievements (checking off the last block of the
 * day); calm states leave it off so the card is still pleasant on the
 * hundredth visit. `big` is the rare everything-is-done-everywhere moment.
 * Reduced motion collapses all of it to a plain fade.
 */

const SPECK_COLORS = ["#4A5491", "#D9B36A", "#6F8F73", "#B4553F"];

interface Speck {
  x: number;
  y: number;
  rotate: number;
  delay: number;
  color: string;
  tall: boolean;
}

// A deterministic fan of specks rising away from the badge — stable across
// renders (Math.random would reshuffle mid-animation) but varied enough that
// the burst doesn't read as a grid.
function makeSpecks(count: number): Speck[] {
  const specks: Speck[] = [];
  for (let i = 0; i < count; i++) {
    const angle = Math.PI * (0.12 + (0.76 * i) / (count - 1)); // fan across the upper half
    const dist = 64 + ((i * 37) % 56);
    specks.push({
      x: Math.round(Math.cos(angle) * dist),
      y: -Math.round(Math.sin(angle) * dist) - 14,
      rotate: ((i * 97) % 240) - 120,
      delay: (i % 5) * 0.035,
      color: SPECK_COLORS[i % SPECK_COLORS.length],
      tall: i % 3 === 0,
    });
  }
  return specks;
}

const SPECKS_SMALL = makeSpecks(10);
const SPECKS_BIG = makeSpecks(16);

export function Celebration({
  title,
  sub,
  icon = "check",
  pop = false,
  big = false,
  className,
}: {
  title: string;
  sub: string;
  /** check = something got finished; spark = simply nothing here. */
  icon?: "check" | "spark";
  /** One-shot speck burst on mount — reserve for genuine achievements. */
  pop?: boolean;
  /** The everything-clear tier: larger badge, wider burst, soft glow. */
  big?: boolean;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const specks = big ? SPECKS_BIG : SPECKS_SMALL;
  const check = icon === "check";

  return (
    <motion.div
      initial={{ opacity: 0, y: reduce ? 0 : 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 380, damping: 32 }}
      className={cn(
        "surface relative overflow-hidden px-6 text-center",
        big ? "py-12" : "py-10",
        className,
      )}
    >
      {big && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_28%,rgba(111,143,115,0.14),transparent_62%)]"
        />
      )}

      {pop &&
        !reduce &&
        specks.map((s, i) => (
          <motion.span
            key={i}
            aria-hidden
            className={cn(
              "pointer-events-none absolute left-1/2 rounded-full",
              big ? "top-[30%]" : "top-[34%]",
              s.tall ? "h-2.5 w-1" : "h-1.5 w-1.5",
            )}
            style={{ backgroundColor: s.color }}
            initial={{ x: 0, y: 0, opacity: 0, scale: 0.4, rotate: 0 }}
            animate={{
              x: s.x,
              y: [0, s.y * 0.82, s.y],
              opacity: [0, 1, 1, 0],
              scale: 1,
              rotate: s.rotate,
            }}
            transition={{
              duration: 0.85,
              delay: 0.22 + s.delay,
              ease: [0.16, 1, 0.3, 1],
              opacity: { duration: 0.85, delay: 0.22 + s.delay, times: [0, 0.15, 0.6, 1] },
            }}
          />
        ))}

      <span className="relative mx-auto block w-fit">
        {pop && !reduce && (
          <motion.span
            aria-hidden
            className="absolute inset-0 rounded-full border-2 border-sage/40"
            initial={{ scale: 1, opacity: 0.9 }}
            animate={{ scale: 1.9, opacity: 0 }}
            transition={{ duration: 0.7, delay: 0.24, ease: "easeOut" }}
          />
        )}
        <motion.span
          className={cn(
            "flex items-center justify-center rounded-full border",
            big ? "h-14 w-14" : "h-12 w-12",
            check ? "border-sage/30 bg-sage-wash" : "border-gold/30 bg-gold-wash",
          )}
          initial={reduce ? { opacity: 0 } : { scale: 0.4, opacity: 0 }}
          animate={reduce ? { opacity: 1 } : { scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 420, damping: 22, delay: 0.05 }}
        >
          {check ? (
            <svg
              viewBox="0 0 24 24"
              className={cn("text-sage-soft", big ? "h-7 w-7" : "h-6 w-6")}
              fill="none"
              stroke="currentColor"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <motion.path
                d="M4.5 12.5l5 5 10-11"
                initial={{ pathLength: reduce ? 1 : 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.35, delay: 0.2, ease: "easeOut" }}
              />
            </svg>
          ) : (
            <svg
              viewBox="0 0 24 24"
              className={cn("text-gold-soft", big ? "h-7 w-7" : "h-6 w-6")}
              fill="currentColor"
            >
              <path d="M12 2.5l2.3 7.2 7.2 2.3-7.2 2.3L12 21.5l-2.3-7.2-7.2-2.3 7.2-2.3L12 2.5z" />
            </svg>
          )}
        </motion.span>
      </span>

      <p className={cn("relative mt-3 font-display font-bold tracking-tight text-ink", big ? "text-xl" : "text-lg")}>
        {title}
      </p>
      <p className="relative mx-auto mt-1 max-w-xs text-sm leading-relaxed text-muted">{sub}</p>
    </motion.div>
  );
}
