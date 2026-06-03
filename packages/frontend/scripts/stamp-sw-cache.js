#!/usr/bin/env node
/**
 * Bumps the service worker cache id before each production build so PWA /
 * browser clients fetch fresh JS/CSS after deploy (install.sh, update.sh, CI).
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const swPath = path.join(__dirname, '..', 'public', 'sw.js');
const repoRoot = path.join(__dirname, '..', '..', '..');

function resolveCacheRev() {
  if (process.env.BUILD_CACHE_REV) {
    return process.env.BUILD_CACHE_REV.replace(/[^a-zA-Z0-9._-]/g, '');
  }
  try {
    return execSync('git rev-parse --short HEAD', {
      encoding: 'utf8',
      cwd: repoRoot,
    }).trim();
  } catch {
    return String(Date.now());
  }
}

const rev = resolveCacheRev();
let content = fs.readFileSync(swPath, 'utf8');

if (!/const CACHE_NAME = /.test(content)) {
  console.error('[stamp-sw-cache] sw.js: missing CACHE_NAME');
  process.exit(1);
}

content = content.replace(
  /const CACHE_NAME = 'allone-garden-[^']*';/,
  `const CACHE_NAME = 'allone-garden-${rev}';`,
);

fs.writeFileSync(swPath, content);
console.log(`[stamp-sw-cache] CACHE_NAME → allone-garden-${rev}`);
