/** @type {import('tailwindcss').Config} */
const v = (name) => `rgb(var(${name}) / <alpha-value>)`

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Surfaces and neutrals are CSS variables so dark mode is a token swap, not a class hunt.
        surface: v('--surface'),
        brand: { 50: v('--brand-50'), 100: v('--brand-100'), 200: v('--brand-200'), 300: '#7fa6dd', 400: '#4f82cc', 500: '#2f64b4', 600: v('--brand-600'), 700: v('--brand-700'), 800: v('--brand-800'), 900: '#0f2340' },
        ink: { 50: v('--ink-50'), 100: v('--ink-100'), 200: v('--ink-200'), 300: v('--ink-300'), 400: v('--ink-400'), 500: v('--ink-500'), 600: v('--ink-600'), 700: v('--ink-700'), 800: v('--ink-800'), 900: v('--ink-900') },
      },
      fontFamily: { sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'] },
    },
  },
  plugins: [],
}
