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
        // Warm cream paper — never stark white (brief §4).
        paper: {
          DEFAULT: "#FAF7F0",
          deep: "#F4EFE3",
          edge: "#EAE3D2",
          card: "#FBF9F3",
        },
        // Soft near-black for text — never #000.
        ink: {
          DEFAULT: "#2B2B30",
          soft: "#3A3A42",
        },
        // Warm rust-red accent, used sparingly.
        accent: {
          DEFAULT: "#B5462F",
          soft: "#C75E48",
          wash: "#F3E4DE",
        },
        // Muted grey-brown for secondary text.
        muted: {
          DEFAULT: "#8A8276",
          soft: "#A8A092",
        },
      },
      fontFamily: {
        // Clean, modern sans-serif only. No script/handwriting (brief §4).
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
      },
      borderRadius: {
        xl: "0.875rem",
        "2xl": "1.125rem",
      },
      boxShadow: {
        card: "0 1px 2px rgba(43,43,48,0.04), 0 6px 20px rgba(43,43,48,0.05)",
        spotlight: "0 2px 4px rgba(43,43,48,0.05), 0 10px 30px rgba(43,43,48,0.07)",
        lift: "0 8px 30px rgba(43,43,48,0.12)",
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
