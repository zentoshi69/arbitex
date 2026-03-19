/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        red: {
          DEFAULT: "#E84142",
          dim: "rgba(232,65,66,0.12)",
          glow: "rgba(232,65,66,0.06)",
        },
        dim: "#888880",
        border: {
          DEFAULT: "#1A1A18",
          hi: "#242420",
        },
        bg: {
          DEFAULT: "#080808",
          panel: "#0D0D0B",
          card: "#111110",
          hover: "#161614",
        },
        input: "#242420",
        ring: "#444440",
        background: "#080808",
        foreground: "#F5F5F5",
        primary: {
          DEFAULT: "#E84142",
          foreground: "#FFFFFF",
        },
        muted: {
          DEFAULT: "#444440",
          foreground: "#888880",
        },
        accent: {
          DEFAULT: "#1A1A18",
          foreground: "#E8E8E2",
        },
        destructive: {
          DEFAULT: "#E84142",
          foreground: "#FFFFFF",
        },
        // Override Tailwind "slate" palette to neutral greys so existing UI
        // classes like bg-slate-800 / text-slate-400 don't introduce blue hues.
        slate: {
          50: "#F3F3F3",
          100: "#E6E6E6",
          200: "#CCCCCC",
          300: "#B3B3B3",
          400: "#999999",
          500: "#7A7A7A",
          600: "#5F5F5F",
          700: "#454545",
          800: "#2E2E2E",
          900: "#1A1A1A",
          950: "#0A0A08",
        },
      },
      borderRadius: {
        DEFAULT: "2px",
        lg: "2px",
        md: "2px",
        sm: "2px",
      },
      fontFamily: {
        styrene: ["StyreneB", "Helvetica Neue", "sans-serif"],
        sans: ["StyreneB", "Helvetica Neue", "sans-serif"],
        mono: ["JetBrains Mono", "Fira Code", "monospace"],
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
      },
    },
  },
  plugins: [],
};
