#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');

const esmDir = path.resolve(__dirname, '..', '..', '..', 'node_modules', 'html5-qrcode', 'esm');
const sourceMapLine = /\n?\/\/# sourceMappingURL=.*$/m;

function walkJsFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkJsFiles(full, out);
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      out.push(full);
    }
  }
  return out;
}

function main() {
  const files = walkJsFiles(esmDir);
  if (!files.length) {
    return;
  }

  let touched = 0;
  for (const file of files) {
    const original = fs.readFileSync(file, 'utf8');
    const updated = original.replace(sourceMapLine, '');
    if (updated !== original) {
      fs.writeFileSync(file, updated, 'utf8');
      touched += 1;
    }
  }

  if (touched > 0) {
    console.log(`[frontend] stripped html5-qrcode sourceMappingURL lines in ${touched} files`);
  }
}

main();
