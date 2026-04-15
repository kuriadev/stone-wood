import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        cormorant: ["Cormorant Garamond", "Georgia", "serif"],
        jost: ["Jost", "system-ui", "sans-serif"],
      },
      colors: {
        gold: "#c9a84c",
        "gold-light": "#e8c56a",
        "gold-dark": "#a87c2a",
      },
      animation: {
        "hero-orb-1": "heroOrb1 14s ease-in-out infinite",
        "hero-orb-2": "heroOrb2 18s ease-in-out infinite",
        "hero-orb-3": "heroOrb3 22s ease-in-out infinite",
        "fade-up": "fadeUp .55s cubic-bezier(.22,1,.36,1) both",
        "fade-in": "fadeIn .45s ease both",
        "slide-in": "swIn .3s cubic-bezier(.22,1,.36,1)",
        "hero-tag": "heroTagIn .9s cubic-bezier(.22,1,.36,1) .2s both",
        "hero-title": "heroTitleIn 1s cubic-bezier(.22,1,.36,1) .4s both",
        "hero-sub": "heroSubIn .9s cubic-bezier(.22,1,.36,1) .65s both",
        "hero-card": "heroCardIn .85s cubic-bezier(.22,1,.36,1) .85s both",
        "hero-pills": "heroPillsIn .8s cubic-bezier(.22,1,.36,1) 1s both",
      },
      keyframes: {
        heroOrb1: {
          "0%,100%": { transform: "translate(0,0) scale(1)" },
          "40%": { transform: "translate(40px,-30px) scale(1.08)" },
          "70%": { transform: "translate(-20px,20px) scale(0.96)" },
        },
        heroOrb2: {
          "0%,100%": { transform: "translate(0,0) scale(1)" },
          "35%": { transform: "translate(-50px,25px) scale(1.05)" },
          "65%": { transform: "translate(30px,-15px) scale(0.97)" },
        },
        heroOrb3: {
          "0%,100%": { transform: "translate(0,0) scale(1)" },
          "50%": { transform: "translate(20px,40px) scale(1.06)" },
        },
        heroTitleIn: {
          from: { opacity: "0", transform: "translateY(32px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        heroTagIn: {
          from: { opacity: "0", letterSpacing: "10px" },
          to: { opacity: "1", letterSpacing: "5px" },
        },
        heroSubIn: {
          from: { opacity: "0", transform: "translateY(20px)" },
          to: { opacity: "0.88", transform: "translateY(0)" },
        },
        heroCardIn: {
          from: { opacity: "0", transform: "translateY(24px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        heroPillsIn: {
          from: { opacity: "0", transform: "translateY(16px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        fadeUp: {
          from: { opacity: "0", transform: "translateY(28px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        fadeIn: {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        swIn: {
          from: { opacity: "0", transform: "translateX(20px) scale(0.97)" },
          to: { opacity: "1", transform: "translateX(0) scale(1)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
