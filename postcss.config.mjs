// Tailwind v4 runs as a PostCSS plugin. It was removed from this project
// once before; it is back because the UI is being rebuilt on shadcn/ui,
// which is Tailwind classes by construction.
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};

export default config;
