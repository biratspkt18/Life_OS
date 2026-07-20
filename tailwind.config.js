/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./views/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Cue palette, driven by CSS variables in globals.css so the whole
        // palette flips light↔dark from one place. Channel form
        // (`rgb(var(--x) / <alpha-value>)`) keeps Tailwind's `/opacity`
        // modifiers (e.g. `bg-accent/60`) working.
        paper: {
          DEFAULT: "rgb(var(--paper) / <alpha-value>)",
          deep: "rgb(var(--paper-deep) / <alpha-value>)",
          edge: "rgb(var(--paper-edge) / <alpha-value>)",
          card: "rgb(var(--paper-card) / <alpha-value>)",
        },
        ink: {
          DEFAULT: "rgb(var(--ink) / <alpha-value>)",
          soft: "rgb(var(--ink-soft) / <alpha-value>)",
        },
        accent: {
          DEFAULT: "rgb(var(--accent) / <alpha-value>)",
          soft: "rgb(var(--accent-soft) / <alpha-value>)",
          wash: "rgb(var(--accent-wash) / <alpha-value>)",
        },
        gold: {
          DEFAULT: "rgb(var(--gold) / <alpha-value>)",
          soft: "rgb(var(--gold-soft) / <alpha-value>)",
          wash: "rgb(var(--gold-wash) / <alpha-value>)",
        },
        sage: {
          DEFAULT: "rgb(var(--sage) / <alpha-value>)",
          soft: "rgb(var(--sage-soft) / <alpha-value>)",
          wash: "rgb(var(--sage-wash) / <alpha-value>)",
        },
        muted: {
          DEFAULT: "rgb(var(--muted) / <alpha-value>)",
          soft: "rgb(var(--muted-soft) / <alpha-value>)",
        },
        danger: {
          DEFAULT: "rgb(var(--danger) / <alpha-value>)",
          soft: "rgb(var(--danger-soft) / <alpha-value>)",
          wash: "rgb(var(--danger-wash) / <alpha-value>)",
        },
      },
      fontFamily: {
        // Body — Hanken Grotesk.
        sans: [
          "Hanken Grotesk",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
        // Headings / display — Bricolage Grotesque.
        display: [
          "Bricolage Grotesque",
          "Hanken Grotesk",
          "ui-sans-serif",
          "system-ui",
          "sans-serif",
        ],
      },
      borderRadius: {
        xl: "0.875rem",
        "2xl": "1.125rem",
      },
      boxShadow: {
        card: "0 1px 3px rgba(38,38,43,0.05), 0 4px 16px rgba(38,38,43,0.045)",
        spotlight: "0 1px 4px rgba(38,38,43,0.06), 0 8px 26px rgba(74,84,145,0.10)",
        lift: "0 8px 24px rgba(38,38,43,0.18)",
        accent: "0 3px 8px rgba(74,84,145,0.30)",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "scale-in": {
          "0%": { opacity: "0", transform: "scale(0.97) translateY(8px)" },
          "100%": { opacity: "1", transform: "scale(1) translateY(0)" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.28s ease-out both",
        "fade-in": "fade-in 0.2s ease-out both",
        "scale-in": "scale-in 0.24s cubic-bezier(0.16,1,0.3,1) both",
      },
    },
  },
  plugins: [],
};
