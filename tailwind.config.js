/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: { 50: '#eef4fb', 100: '#d6e3f5', 200: '#aec7eb', 300: '#7fa6dd', 400: '#4f82cc', 500: '#2f64b4', 600: '#234f93', 700: '#1c3f76', 800: '#16325d', 900: '#0f2340' },
        ink: { 50: '#f7f8fa', 100: '#eceff3', 200: '#d9dee6', 300: '#b8c1cf', 400: '#8e9bb0', 500: '#67748c', 600: '#4e5a70', 700: '#3b4558', 800: '#262d3b', 900: '#161a23' },
      },
      fontFamily: { sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'] },
    },
  },
  plugins: [],
}
