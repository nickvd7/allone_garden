/**
 * Replaces `gradendex.entries` in gradendex.{lang}.json when
 * `gradendex-entries-overrides/{lang}.json` exists (full entries tree).
 * Languages: de, fr, es, pt, nl, ru, it, pl, tr, ja, ko, zh, ar, hi, id, vi, uk.
 *
 * Run after: npm run gradendex:extra
 *   node packages/frontend/scripts/gradendex-merge-entry-overrides.js
 */
const fs = require('fs');
const path = require('path');

const i18nDir = path.join(__dirname, '../src/i18n');
const overrideDir = path.join(__dirname, 'gradendex-entries-overrides');

const LANGS = [
  'de', 'fr', 'es', 'pt', 'nl',
  'ru', 'it', 'pl', 'tr', 'ja', 'ko', 'zh', 'ar', 'hi', 'id', 'vi', 'uk',
];

function main() {
  if (!fs.existsSync(overrideDir)) {
    console.log('No gradendex-entries-overrides/ directory — nothing to merge.');
    return;
  }
  for (const lang of LANGS) {
    const oPath = path.join(overrideDir, `${lang}.json`);
    const gPath = path.join(i18nDir, `gradendex.${lang}.json`);
    if (!fs.existsSync(oPath) || !fs.existsSync(gPath)) continue;
    const grad = JSON.parse(fs.readFileSync(gPath, 'utf8'));
    const entries = JSON.parse(fs.readFileSync(oPath, 'utf8'));
    grad.gradendex.entries = entries;
    fs.writeFileSync(gPath, JSON.stringify(grad, null, 2) + '\n');
    console.log('Merged entries override → gradendex.' + lang + '.json');
  }
}

main();
