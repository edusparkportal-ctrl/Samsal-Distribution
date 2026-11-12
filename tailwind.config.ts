import type { Config } from "tailwindcss";

/**
 * SAMSAL design tokens.
 *
 * Contrast notes (WCAG 2.1):
 *  - navy on white 14.4:1, charcoal on white 12.6:1, navy on amber 6.8:1  -> safe for all text
 *  - brand teal #0B8F87 on white is 4.0:1 -> use for icons, large graphics and fills only
 *  - teal-dark #086F69 on white is 6.0:1 -> use for teal TEXT on light backgrounds
 *  - teal-light #6FD0C8 on navy is 7.3:1 -> use for teal TEXT on navy backgrounds
 */
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: { DEFAULT: "#142D4E", 800: "#1B3A63", 900: "#0E2038" },
        teal: { DEFAULT: "#0B8F87", dark: "#086F69", light: "#6FD0C8", tint: "#E3F4F3" },
        amber: { DEFAULT: "#F2A541", dark: "#D98E27" },
        grey: { DEFAULT: "#F4F6F8", 200: "#E3E8ED", 300: "#CBD3DB", 500: "#6B7885" },
        charcoal: "#263238",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      borderRadius: {
        DEFAULT: "4px",
        md: "6px",
        lg: "8px",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.6s ease-out both",
      },
    },
  },
  plugins: [],
};

export default config;
