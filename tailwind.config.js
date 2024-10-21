/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{html,ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        hack: ['HackNerd']
      },
      borderWidth: {
        1: '1px'
      }
    }
  },
  plugins: []
};
