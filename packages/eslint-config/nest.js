const base = require('./index.js');

module.exports = [
  ...base,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
      // NestJS DI relies on emitDecoratorMetadata, which needs runtime class
      // references. Auto-fixing constructor-injected classes to type-only
      // imports breaks the DI graph (see PR #1 e2e failure).
      '@typescript-eslint/consistent-type-imports': 'off',
    },
  },
];
