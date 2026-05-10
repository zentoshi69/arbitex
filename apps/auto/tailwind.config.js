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
        bg: {
          DEFAULT: "#05030a",
          panel: "#0a0814",
          card: "#0e0b1c",
          hover: "#15102a",
        },
        sol: {
          purple: "#9945FF",
          green: "#14F195",
          cyan: "#22d3ee",
          pink: "#ff2bd6",
          magenta: "#f038ff",
        },
        terminal: {
          green: "#00ff9f",
          amber: "#ffb000",
          red: "#ff3860",
          dim: "#5b5577",
        },
      },
      fontFamily: {
        mono: ["JetBrains Mono", "Fira Code", "ui-monospace", "monospace"],
        display: ["Orbitron", "Rajdhani", "Inter", "sans-serif"],
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      boxShadow: {
        "neon-purple": "0 0 24px rgba(153,69,255,0.45), 0 0 64px rgba(153,69,255,0.15)",
        "neon-green": "0 0 24px rgba(20,241,149,0.45), 0 0 64px rgba(20,241,149,0.15)",
        "neon-pink": "0 0 24px rgba(255,43,214,0.45), 0 0 64px rgba(255,43,214,0.15)",
        "neon-cyan": "0 0 24px rgba(34,211,238,0.45), 0 0 64px rgba(34,211,238,0.15)",
        "inset-grid": "inset 0 0 0 1px rgba(153,69,255,0.18)",
      },
      backgroundImage: {
        "auto-grad": "linear-gradient(135deg, #14F195 0%, #22d3ee 35%, #9945FF 70%, #ff2bd6 100%)",
        "scan-lines":
          "repeating-linear-gradient(0deg, rgba(255,255,255,0.025) 0px, rgba(255,255,255,0.025) 1px, transparent 1px, transparent 3px)",
        "grid-faint":
          "linear-gradient(rgba(153,69,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(153,69,255,0.08) 1px, transparent 1px)",
      },
      backgroundSize: {
        grid: "40px 40px",
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "scan": "scan 6s linear infinite",
        "marquee": "marquee 40s linear infinite",
        "blink": "blink 1.05s steps(1) infinite",
        "boot": "boot 0.8s ease-out forwards",
        "glow-pulse": "glowPulse 2.6s ease-in-out infinite",
        "float-slow": "float 9s ease-in-out infinite",
      },
      keyframes: {
        scan: {
          "0%": { transform: "translateY(-100%)" },
          "100%": { transform: "translateY(100%)" },
        },
        marquee: {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
        blink: {
          "0%, 50%": { opacity: "1" },
          "51%, 100%": { opacity: "0" },
        },
        boot: {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        glowPulse: {
          "0%, 100%": { filter: "drop-shadow(0 0 8px rgba(153,69,255,0.55))" },
          "50%": { filter: "drop-shadow(0 0 24px rgba(20,241,149,0.65))" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-10px)" },
        },
      },
      borderRadius: {
        DEFAULT: "4px",
      },
    },
  },
  plugins: [],
};
