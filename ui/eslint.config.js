import js from '@eslint/js'
import globals from 'globals'
import tsPlugin from '@typescript-eslint/eslint-plugin'
import tsParser from '@typescript-eslint/parser'
import reactPlugin from 'eslint-plugin-react'
import reactHooksPlugin from 'eslint-plugin-react-hooks'
import reactRefreshPlugin from 'eslint-plugin-react-refresh'
import jsxA11yPlugin from 'eslint-plugin-jsx-a11y'
import importPlugin from 'eslint-plugin-import-x'

export default [
  { ignores: ['dist/', 'wailsjs/'] },
  js.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      globals: {
        ...globals.browser,
      },
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        project: ['./tsconfig.json', './tsconfig.node.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      react: reactPlugin,
      'react-hooks': reactHooksPlugin,
      'react-refresh': reactRefreshPlugin,
      'jsx-a11y': jsxA11yPlugin,
      'import-x': importPlugin,
    },
    settings: {
      react: { version: 'detect' },
      'import-x/resolver': {
        typescript: {
          project: './tsconfig.json',
        },
      },
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      ...reactPlugin.configs.recommended.rules,
      ...reactPlugin.configs['jsx-runtime'].rules,
      ...reactHooksPlugin.configs.recommended.rules,
      ...Object.fromEntries(
        Object.entries(jsxA11yPlugin.configs.recommended.rules).map(
          ([key, value]) => [key, Array.isArray(value) ? ['warn', ...value.slice(1)] : 'warn']
        )
      ),
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'error',
      'react/prop-types': 'off',
      'react/no-unescaped-entities': 'off',
      'no-undef': 'off',
      'no-unused-vars': 'off',
      'no-useless-assignment': 'error',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/refs': 'error',

      // Import ordering
      'import-x/order': ['warn', {
        groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
        'newlines-between': 'never',
        alphabetize: { order: 'asc', caseInsensitive: true },
      }],
      'import-x/no-duplicates': 'error',
    },
  },
]
