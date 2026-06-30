/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        gold: {
          300: "#f0d070",
          400: "#e8b94a",
          500: "#C9A227",
          600: "#a88320",
          700: "#7a5f18",
        },
        sinan: {
          bg: "#0d0d0d",
          surface: "#1a1a1a",
          card: "#222222",
          border: "#2e2e2e",
          text: "#f0f0f0",
          muted: "#888888",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
