import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "#2E4A87",
          foreground: "#FFFFFF",
        },
        accent: {
          DEFAULT: "#F39C12",
          foreground: "#1A1A1A",
        },
        success: "#2E8B57",
        danger: "#C0392B",
        background: "#FAFAFC",
        surface: "#FFFFFF",
        border: "#E5E7EB",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
      fontVariantNumeric: ["tabular-nums"],
    },
  },
  plugins: [],
};

export default config;
