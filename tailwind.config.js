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
        // Warm paper — Cue palette. Never stark white.
        paper: {
          DEFAULT: "#F7F5EE",
          deep: "#F2EFE6",
          edge: "#E6E1D4",
          card: "#FFFDF8",
        },
        // Soft near-black for text — never #000.
        ink: {
          DEFAULT: "#26262B",
          soft: "#4A4A50",
        },
        // Cue indigo accent.
        accent: {
          DEFAULT: "#4A5491",
          soft: "#3A4180",
          wash: "#ECEAF4",
        },
        // Gold — calendar / locked / "from elsewhere" items.
        gold: {
          DEFAULT: "#D9B36A",
          soft: "#B07D28",
          wash: "#F7F0DC",
        },
        // Green — done / synced.
        sage: {
          DEFAULT: "#6F8F73",
          soft: "#557A5A",
          wash: "#EAF1E6",
        },
        // Muted grey for secondary text.
        muted: {
          DEFAULT: "#6B6962",
          soft: "#9A978F",
        },
        // Warm terracotta — destructive actions (delete). Never a stark red.
        danger: {
          DEFAULT: "#B4553F",
          soft: "#8F3F2D",
          wash: "#F6E7E1",
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
