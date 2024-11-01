/* eslint-disable no-magic-numbers */
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{html,ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        hack: ['HackNerd']
      },
      fontSize: {
        xxs: ['0.7rem', '0.7rem']
      },
      spacing: {
        0.75: '0.1875rem'
      }
    }
  },
  plugins: []
};
