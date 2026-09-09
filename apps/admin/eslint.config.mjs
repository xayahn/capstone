import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ['frontend/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{
          group: ['@/backend/*', '@/db/*'],
          message: 'Frontend modules must use API contracts or shared rules, never server or database code.',
        }],
      }],
    },
  },
  {
    files: ['backend/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{
          group: ['@/frontend/*'],
          message: 'Backend modules must not depend on admin UI modules.',
        }],
      }],
    },
  },
  {
    files: ['shared/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{
          group: ['@/app/*', '@/backend/*', '@/db/*', '@/frontend/*'],
          message: 'Shared rules must stay independent from framework, UI, database, and server modules.',
        }],
      }],
    },
  },
  globalIgnores([
    '.next/**',
    '.vinext/**',
    '.wrangler/**',
    'build/**',
    'dist/**',
    'out/**',
    'outputs/**',
    'work/**',
    'next-env.d.ts',
  ]),
]);

export default eslintConfig;
