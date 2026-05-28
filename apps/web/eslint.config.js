const base = require('@logisti-core/eslint-config/next');

module.exports = [
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'next-env.d.ts',
      'public/**',
      'eslint.config.js',
      'postcss.config.js',
      'next.config.mjs',
      'tailwind.config.ts',
      'vitest.config.ts',
    ],
  },
  ...base,
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
];
