'use strict';

/**
 * react-scripts nests webpack-dev-server under its own node_modules. npm may still
 * hoist a single version from root overrides. Remove the nested copy + lockfile entry
 * so the tree uses one resolved version (must stay on webpack-dev-server 4.x — CRA
 * 5 is incompatible with the webpack-dev-server 5 API).
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const lockPath = path.join(root, 'package-lock.json');
const nestedDir = path.join(
  root,
  'node_modules',
  'react-scripts',
  'node_modules',
  'webpack-dev-server'
);
const lockKey = 'node_modules/react-scripts/node_modules/webpack-dev-server';

if (fs.existsSync(nestedDir)) {
  fs.rmSync(nestedDir, { recursive: true, force: true });
}

if (!fs.existsSync(lockPath)) return;

const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
if (lock.packages && lock.packages[lockKey]) {
  delete lock.packages[lockKey];
  fs.writeFileSync(lockPath, `${JSON.stringify(lock, null, 4)}\n`);
}
