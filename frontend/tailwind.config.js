/** @type {import('tailwindcss').Config} */
module.exports = {
  // "class" statt "media": der Nutzer entscheidet, nicht das Betriebssystem.
  darkMode: "class",
  content: ["./app/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      // Alle Farben laufen ueber CSS-Variablen (siehe globals.css). Dadurch
      // funktioniert der Dark Mode ohne dark:-Praefix an jeder Klasse und die
      // Akzentfarbe bleibt zur Laufzeit aus der .env steuerbar.
      colors: {
        canvas: "rgb(var(--c-canvas) / <alpha-value>)",
        surface: "rgb(var(--c-surface) / <alpha-value>)",
        raised: "rgb(var(--c-raised) / <alpha-value>)",
        ink: "rgb(var(--c-ink) / <alpha-value>)",
        muted: "rgb(var(--c-muted) / <alpha-value>)",
        line: "rgb(var(--c-line) / <alpha-value>)",
        accent: "var(--accent)",
        accent2: "var(--grad-to)",
        "accent-ink": "var(--accent-ink)",
        free: "rgb(var(--c-free) / <alpha-value>)",
        occupied: "rgb(var(--c-occupied) / <alpha-value>)",
        danger: "rgb(var(--c-danger) / <alpha-value>)",
      },
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
        mono: ["ui-monospace", "JetBrains Mono", "SFMono-Regular", "Menlo", "monospace"],
      },
      borderRadius: { xl2: "16px" },
      transitionTimingFunction: {
        smooth: "cubic-bezier(0.22, 1, 0.36, 1)",
      },
      keyframes: {
        ripple: {
          "0%": { transform: "scale(0)", opacity: "0.45" },
          "100%": { transform: "scale(4)", opacity: "0" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        "fade-in": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "scale-in": {
          from: { opacity: "0", transform: "scale(0.97)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
      },
      animation: {
        ripple: "ripple 600ms ease-out forwards",
        shimmer: "shimmer 1.6s linear infinite",
        "fade-in": "fade-in 180ms ease-out",
        "scale-in": "scale-in 160ms ease-out",
      },
    },
  },
  plugins: [],
};
