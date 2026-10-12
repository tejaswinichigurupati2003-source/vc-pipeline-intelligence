import type { Config } from "tailwindcss";

/**
 * Design tokens: "architectural" cherry-brown. Flat planes, 1px crisp borders, zero radius, hard-offset hover shadow.
 * `slate` and `indigo` are remapped on purpose so every existing utility class picks up the palette:
 *   slate  -> warm brown-greys ("paper" to "ink")
 *   indigo -> the cherry-brown brand scale
 */
export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    borderRadius: { none: "0", sm: "0", DEFAULT: "0", md: "0", lg: "0", xl: "0", "2xl": "0", "3xl": "0", full: "0" },
    extend: {
      fontFamily: {
        display: ["Panchang", "General Sans", "ui-sans-serif", "system-ui", "sans-serif"],
        sans: ["General Sans", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      colors: {
        slate: {
          50: "#faf7f4", 100: "#f3eeea", 200: "#ddd2ca", 300: "#c7b9af", 400: "#a09189",
          500: "#76675f", 600: "#5a4c46", 700: "#433734", 800: "#2d2422", 900: "#1d1514", 950: "#120d0c",
        },
        indigo: {
          50: "#fbf2f0", 100: "#f4e2df", 200: "#e7c4bf", 300: "#d69a94", 400: "#be6b67",
          500: "#a04247", 600: "#7e2c34", 700: "#62222b", 800: "#481a21", 900: "#321217",
        },
      },
      borderColor: { DEFAULT: "#c7b9af" },
      boxShadow: {
        card: "none",
        lift: "4px 4px 0 0 #1d1514",
        ring: "none",
      },
      keyframes: { rise: { from: { opacity: "0", transform: "translateY(4px)" }, to: { opacity: "1", transform: "none" } } },
      animation: { rise: "rise .3s ease-out both" },
    },
  },
  plugins: [],
} satisfies Config;
