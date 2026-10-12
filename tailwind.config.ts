import type { Config } from "tailwindcss";

/**
 * Design tokens. `slate` and `indigo` are remapped on purpose so every existing utility class picks up the new
 * palette: slate -> a cooler, slightly blue-grey "ink" scale; indigo -> the brand violet.
 */
export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: { sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"] },
      colors: {
        slate: {
          50: "#f7f8fb", 100: "#eff1f6", 200: "#e3e6ee", 300: "#cdd2de", 400: "#99a1b4",
          500: "#6a7287", 600: "#4f566a", 700: "#383e50", 800: "#222735", 900: "#121622", 950: "#0b0e18",
        },
        indigo: {
          50: "#f3f1ff", 100: "#e8e4ff", 200: "#d2cbff", 300: "#b3a8ff", 400: "#8f80f8",
          500: "#7260ee", 600: "#5f4bdf", 700: "#4e3cc2", 800: "#3f319c", 900: "#2a2169",
        },
      },
      borderRadius: { lg: "0.875rem", xl: "1.125rem", "2xl": "1.5rem" },
      boxShadow: {
        card: "0 1px 2px rgba(18,22,34,.04), 0 1px 1px rgba(18,22,34,.03)",
        lift: "0 8px 24px -6px rgba(18,22,34,.14), 0 2px 6px rgba(18,22,34,.06)",
        ring: "0 0 0 4px rgba(114,96,238,.16)",
      },
      keyframes: { rise: { from: { opacity: "0", transform: "translateY(6px)" }, to: { opacity: "1", transform: "none" } } },
      animation: { rise: "rise .35s ease-out both" },
    },
  },
  plugins: [],
} satisfies Config;
