/** @type {import('eslint').Linter.Config} */
module.exports = {
  env: {
    node: true,
    es2022: true,
  },
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'commonjs',
  },
  plugins: ['node'],
  extends: ['eslint:recommended', 'plugin:node/recommended'],
  rules: {
    // ── Code quality ──────────────────────────────────────────────────────
    'no-unused-vars':          ['warn', { argsIgnorePattern: '^_' }],
    'no-console':              'off',   // server code needs console
    'eqeqeq':                  ['error', 'always'],
    'no-var':                  'error',
    'prefer-const':            'warn',

    // ── Security-relevant ─────────────────────────────────────────────────
    'no-eval':                 'error',
    'no-implied-eval':         'error',
    'no-new-func':             'error',

    // ── Node-specific overrides ───────────────────────────────────────────
    'node/no-missing-require':              'error',
    'node/no-extraneous-require':           'error',
    // We target Node 20+, disable version warnings for newer syntax
    'node/no-unsupported-features/es-syntax': 'off',
    // process.exit() is intentional in server bootstrap code
    'node/no-process-exit':                 'off',
    'no-process-exit':                      'off',
  },
  overrides: [
    {
      // email.js uses a lazy require(nodemailer) inside try/catch on purpose —
      // nodemailer is an optional runtime dep, not listed in package.json.
      files: ['src/services/email.js'],
      rules: {
        'node/no-missing-require':    'off',
        'node/no-extraneous-require': 'off',
      },
    },
    {
      // Test files — relax some rules
      files: ['**/tests/**/*.test.js'],
      env: { jest: true },
      rules: {
        'no-unused-vars':             'off',
        'node/no-extraneous-require': 'off',
      },
    },
  ],
};
