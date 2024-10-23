/* eslint-disable no-magic-numbers */
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{html,ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        hack: ['HackNerd']
      },
      spacing: {
        0.75: '0.1875rem'
      }
    }
  },
  plugins: []
};
