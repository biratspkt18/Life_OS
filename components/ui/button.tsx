"use client";
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { motion, type HTMLMotionProps } from "motion/react";
import { cn } from "../../lib/utils";

/**
 * A shadcn-style Button, themed to the Cue palette (warm paper, indigo accent)
 * rather than shadcn's default neutral. It's a `motion.button` so every variant
 * gets a quiet spring on press — the tactile "give" that makes taps feel alive.
 */
const buttonVariants = cva(
  "relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-medium outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-accent/45 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary: "bg-accent text-white shadow-accent hover:bg-accent-soft",
        secondary: "bg-accent-wash text-accent hover:bg-accent/15",
        outline:
          "border border-paper-edge bg-paper-card text-ink hover:border-accent/40 hover:bg-paper-edge/40",
        ghost: "text-ink hover:bg-paper-edge/60",
        soft: "bg-sage/15 text-sage-soft hover:bg-sage/25",
        dashed:
          "w-full border border-dashed border-paper-edge text-accent hover:border-accent/50 hover:bg-accent-wash/40",
      },
      size: {
        sm: "h-8 px-3 text-[0.8rem]",
        default: "h-10 px-4 py-2",
        lg: "h-12 px-5 text-[0.95rem]",
        pill: "rounded-full px-3.5 py-1.5",
        icon: "h-8 w-8 rounded-full",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends Omit<HTMLMotionProps<"button">, "ref">,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <motion.button
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        whileTap={{ scale: 0.96 }}
        transition={{ type: "spring", stiffness: 520, damping: 30, mass: 0.6 }}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { buttonVariants };
