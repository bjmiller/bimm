const js = require('@eslint/js');
const fix = require('@eslint/compat').fixupPluginRules;
const tseslint = require('typescript-eslint');
/** @type {import('eslint').ESLint.Plugin} */
// @ts-ignore
const react = require('eslint-plugin-react');
// @ts-ignore
// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
const hooks = fix(require('eslint-plugin-react-hooks'));
const prettier = require('eslint-plugin-prettier/recommended');
const globals = require('globals');

const config = tseslint.config(
  {
    ignores: ['dist/*']
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      globals: {
        ...globals.es2025,
        ...globals.browser,
        ...globals.node,
        ...globals.jest
      },
      parserOptions: {
        ecmaFeatures: {
          jsx: true
        },
        projectService: true
      }
    },
    plugins: {
      react,
      'react-hooks': hooks
    },
    rules: {
      'prettier/prettier': 'error',
      'curly': ['error', 'all'],
      'default-case': ['error'],
      'dot-notation': ['error'],
      'eqeqeq': [
        'error',
        'always',
        {
          null: 'ignore'
        }
      ],
      'global-require': ['error'],
      'guard-for-in': ['warn'],
      'max-len': [
        'error',
        {
          // eslint-disable-next-line no-magic-numbers
          code: 120,
          ignoreTrailingComments: true,
          ignoreUrls: true,
          ignoreTemplateLiterals: true
        }
      ],
      'new-parens': ['error'],
      'no-await-in-loop': ['error'],
      'no-buffer-constructor': ['error'],
      'no-confusing-arrow': [
        'error',
        {
          allowParens: true
        }
      ],
      'no-console': ['warn'],
      'no-duplicate-imports': ['error'],
      'no-eval': ['error'],
      'no-extra-bind': ['warn'],
      'no-extra-parens': [
        'warn',
        'all',
        {
          ignoreJSX: 'all'
        }
      ],
      'no-floating-decimal': ['warn'],
      'no-implicit-coercion': ['error'],
      'no-implicit-globals': ['error'],
      'no-implied-eval': ['error'],
      'no-lonely-if': ['error'],
      'no-loop-func': ['error'],
      'no-magic-numbers': [
        'error',
        {
          ignore: [-1, 0, 1],
          ignoreArrayIndexes: true,
          detectObjects: true
        }
      ],
      'no-misleading-character-class': ['error'],
      'no-new': ['error'],
      'no-new-object': ['error'],
      'no-new-require': ['error'],
      'no-new-wrappers': ['error'],
      'no-param-reassign': [
        'error',
        {
          props: false
        }
      ],
      'no-return-assign': ['error'],
      'no-shadow': [
        'error',
        {
          builtinGlobals: true,
          allow: ['name', 'length', 'Request', 'Response']
        }
      ],
      'no-shadow-restricted-names': ['error'],
      'no-template-curly-in-string': ['warn'],
      'no-throw-literal': ['error'],
      'no-unmodified-loop-condition': ['error'],
      'no-useless-computed-key': ['warn'],
      'no-var': ['warn'],
      'prefer-const': ['error'],
      'prefer-template': ['warn'],
      'radix': ['error'],
      'require-await': ['error'],
      'yoda': [
        'error',
        'never',
        {
          exceptRange: true
        }
      ],
      'no-unused-vars': 'off',
      'react/button-has-type': ['error'],
      'react/no-array-index-key': ['error'],
      'react/no-access-state-in-setstate': ['error'],
      'react/no-did-update-set-state': ['error'],
      'react/no-typos': ['error'],
      'react/no-will-update-set-state': ['error'],
      'react/self-closing-comp': [
        'warn',
        {
          component: true,
          html: true
        }
      ],
      'react/prop-types': 'off',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_'
        }
      ],
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/array-type': 'off',
      '@typescript-eslint/consistent-type-definitions': 'off',
      '@typescript-eslint/consistent-type-imports': [
        'warn',
        {
          prefer: 'type-imports',
          fixStyle: 'inline-type-imports'
        }
      ],
      '@typescript-eslint/no-require-imports': 'off'
    },
    settings: {
      react: {
        version: 'detect'
      }
    }
  },
  {
    files: ['eslint.config.cjs', 'eslint.config.js'],
    rules: {
      '@typescript-eslint/ban-ts-comment': 'off',
      '@typescript-eslint/no-require-imports': 'off'
    }
  },
  prettier
);

module.exports = config;
