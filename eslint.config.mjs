import js from '@eslint/js'
import typescriptEslint from '@typescript-eslint/eslint-plugin'
import jest from 'eslint-plugin-jest'
import prettierPlugin from 'eslint-plugin-prettier'
import prettierConfig from 'eslint-config-prettier'
import globals from 'globals'

export default [
  {
    ignores: [
      '**/coverage',
      '**/dist',
      '**/lib',
      '**/node_modules',
      'test-files/*'
    ]
  },
  js.configs.recommended,
  ...typescriptEslint.configs['flat/recommended'],
  jest.configs['flat/recommended'],
  prettierConfig,
  {
    plugins: {
      prettier: prettierPlugin
    },

    languageOptions: {
      globals: {
        ...globals.node
      },

      ecmaVersion: 2023,

      parserOptions: {
        projectService: {
          allowDefaultProject: [
            'eslint.config.mjs',
            'jest.config.js',
            'rollup.config.ts',
            '__tests__/*.test.ts'
          ]
        },
        tsconfigRootDir: import.meta.dirname
      }
    },

    rules: {
      'prettier/prettier': 'error',
      '@typescript-eslint/explicit-member-accessibility': [
        'error',
        { accessibility: 'no-public' }
      ],
      '@typescript-eslint/array-type': 'error',
      '@typescript-eslint/consistent-type-assertions': 'error',
      '@typescript-eslint/explicit-function-return-type': [
        'error',
        { allowExpressions: true }
      ],
      '@typescript-eslint/no-inferrable-types': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/prefer-for-of': 'error',
      '@typescript-eslint/prefer-function-type': 'error'
    }
  }
]
