import js from '@eslint/js'
import prettierConfig from 'eslint-config-prettier'
import importPlugin from 'eslint-plugin-import-x'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  // Global ignores
  {
    ignores: [
      'payload-types.ts',
      'migrations/**',
      'node_modules/**',
      '.next/**',
      'dist/**',
      'src/app/(payload)/**',
    ],
  },

  // Base configs
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettierConfig,

  // Import plugin settings
  importPlugin.flatConfigs.recommended,
  importPlugin.flatConfigs.typescript,

  // Global rules
  {
    settings: {
      'import-x/resolver': {
        typescript: {
          project: './tsconfig.json',
        },
      },
    },
    rules: {
      // === Strict equality ===
      eqeqeq: ['error', 'always'],

      // === No var, prefer const ===
      'no-var': 'error',
      'prefer-const': 'error',

      // === Console ===
      'no-console': ['warn', { allow: ['warn', 'error'] }],

      // === Prefer template literals ===
      'prefer-template': 'error',

      // === Arrow function body — concise when possible ===
      'arrow-body-style': ['warn', 'as-needed'],

      // === No require — ESM only ===
      '@typescript-eslint/no-require-imports': 'error',

      // === Unused vars — error, _ prefix exception ===
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],

      // === No explicit any — warn by default ===
      '@typescript-eslint/no-explicit-any': 'warn',

      // === Import order ===
      'import-x/order': [
        'error',
        {
          groups: ['builtin', 'external', 'internal', 'parent', 'sibling'],
          pathGroups: [
            {
              pattern: '@/**',
              group: 'internal',
              position: 'before',
            },
            {
              pattern: '@payload-config',
              group: 'internal',
              position: 'before',
            },
          ],
          pathGroupsExcludedImportTypes: ['builtin'],
          'newlines-between': 'always',
          alphabetize: {
            order: 'asc',
            caseInsensitive: true,
          },
        },
      ],
      'import-x/no-unresolved': 'off',
    },
  },

  // Collection / Hook files — allow any
  {
    files: ['src/collections/**/*.ts', 'src/hooks/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
)
