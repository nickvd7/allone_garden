'use strict';

/**
 * react-scripts nests webpack-dev-server@4.x under its own node_modules even when
 * the root override installs 5.2.3+ at the hoisted level. npm audit still flags the
 * nested copy. Remove the nested install + lockfile entry so resolution uses 5.x.
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
