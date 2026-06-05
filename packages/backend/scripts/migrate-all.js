#!/usr/bin/env node
/**
 * Runs base schema setup + all incremental PostgreSQL migrations.
 * Safe to re-run. Skips individual scripts when DATABASE_URL is unset.
 *
 * Used by: npm run db:migrate, install.sh, update.sh, Docker entrypoint.
 */
const path = require('path');
const { spawnSync } = require('child_process');

const scriptsDir = __dirname;
const repoBackend = path.join(scriptsDir, '..');

const STEPS = [
  'setup-db.js',
  'migrate-dm.js',
  'migrate-gradendex.js',
  'migrate-world.js',
  'migrate-proposals.js',
  'migrate-leaderboard-season-history.js',
  'migrate-push-tables.js',
  'migrate-user-language.js',
];

function runStep(script) {
  const scriptPath = path.join(scriptsDir, script);
  console.log(`\n▶ ${script}`);
  const result = spawnSync(process.execPath, [scriptPath], {
    stdio: 'inherit',
    cwd: repoBackend,
    env: process.env,
  });
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

console.log('🗄️  AllOne Garden — database migrate (all steps)');
for (const script of STEPS) {
  runStep(script);
}
console.log('\n✅  All database migrations complete');
