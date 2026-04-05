#!/usr/bin/env node
/**
 * @capacitor/cli uses `__importDefault(require('tar')).default.extract`, which breaks with tar@7
 * (no default export). Root overrides pin tar@7.x; patch the compiled helper to support both APIs.
 */
const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'node_modules', '@capacitor', 'cli', 'dist', 'util', 'template.js');

function main() {
  if (!fs.existsSync(file)) return;

  let s = fs.readFileSync(file, 'utf8');
  const needle = 'await tar_1.default.extract({ file: src, cwd: dir });';
  const repl = 'await (tar_1.default?.extract ?? tar_1.extract)({ file: src, cwd: dir });';

  if (!s.includes(needle)) return;
  if (s.includes(repl)) return;

  fs.writeFileSync(file, s.replace(needle, repl), 'utf8');
  console.log('[postinstall] Patched @capacitor/cli dist/util/template.js for tar@7');
}

main();
