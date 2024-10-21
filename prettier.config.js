/** @type {import('prettier').Config & import('prettier-plugin-tailwindcss').PluginOptions} */
const config = {
  plugins: ['prettier-plugin-tailwindcss'],
  arrowParens: 'always',
  bracketSpacing: true,
  endOfLine: 'auto',
  jsxSingleQuote: false,
  semi: true,
  singleQuote: true,
  // eslint-disable-next-line no-magic-numbers
  printWidth: 110,
  trailingComma: 'none',
  quoteProps: 'consistent'
};

module.exports = config;
