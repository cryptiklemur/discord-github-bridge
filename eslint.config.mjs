import globals from 'globals';
import tsParser from '@typescript-eslint/parser';
import typescriptEslint from '@typescript-eslint/eslint-plugin';
import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import { FlatCompat } from '@eslint/eslintrc';

const compat = new FlatCompat({
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all
});

export default defineConfig([
  {
    languageOptions: {
      globals: {
        ...globals.commonjs,
        ...globals.node,
        DATABASE_URL: true,
        DISCORD_APP_ID: true,
        DISCORD_PUBLIC_KEY: true,
        DISCORD_BOT_TOKEN: true
      },

      parser: tsParser,
      ecmaVersion: 6,
      sourceType: 'module',
      parserOptions: {}
    },

    extends: compat.extends('eslint:recommended', 'plugin:prettier/recommended'),

    plugins: {
      '@typescript-eslint': typescriptEslint
    },

    rules: {
      'prettier/prettier': 'warn',
      'no-cond-assign': [2, 'except-parens'],
      'no-unused-vars': 0,
      '@typescript-eslint/no-unused-vars': 1,

      'no-empty': [
        'error',
        {
          allowEmptyCatch: true
        }
      ],

      'prefer-const': [
        'warn',
        {
          destructuring: 'all'
        }
      ],

      'spaced-comment': 'warn'
    }
  },
  {
    files: ['**/slash-up.config.js', '**/webpack.config.js'],

    languageOptions: {
      globals: {
        ...globals.node
      }
    }
  }
]);
