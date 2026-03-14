/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        online:  '#22c55e',
        offline: '#6b7280',
        irr:     '#3b82f6',
      },
    },
  },
  plugins: [],
}
