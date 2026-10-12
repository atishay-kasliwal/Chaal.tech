/** @type {import('tailwindcss').Config} */
const tokens = require('../../packages/design-tokens/src/index.ts');

export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}"
  ],
  theme: {
    extend: {
      colors: tokens.colors,
      spacing: tokens.spacing,
      borderRadius: tokens.radius
    }
  },
  plugins: [],
};