/**
 * build.js — Script di build per Tinkercad Serial Data Logger & Exporter
 * Uso: node build.js
 * Produce: dist/chrome/ con JS minificati e banner copyright
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const DIST_CHROME = path.join(ROOT, 'dist', 'chrome');
const TERSER = path.join(ROOT, 'node_modules', '.bin', 'terser');

// M7: versione letta dinamicamente da manifest.json (mai desincronizzata)
const { version: EXT_VERSION } = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
const BANNER = `/*! Tinkercad Serial Data Logger & Exporter v${EXT_VERSION} | (c) 2026 Salvatore Strano | Tutti i diritti riservati | Tool didattico per scuole e privati */`;

// ── Utility ─────────────────────────────────────────────────────────────────
function log(msg) { console.log(msg); }
function err(msg) { console.error('\x1b[31m' + msg + '\x1b[0m'); process.exit(1); }

function copyFile(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function sizeDiff(src, dest) {
  const s = fs.statSync(src).size;
  const d = fs.statSync(dest).size;
  const pct = Math.round((1 - d / s) * 100);
  return `${s} B → ${d} B (-${pct}%)`;
}

function minifyJS(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const cmd = `"${TERSER}" "${src}" --compress passes=2 --mangle --output "${dest}"`;
  try {
    execSync(cmd, { stdio: 'pipe' });
    // Prepend banner
    const minified = fs.readFileSync(dest, 'utf8');
    fs.writeFileSync(dest, BANNER + '\n' + minified, 'utf8');
  } catch (e) {
    err(`Errore minificando ${path.basename(src)}: ${e.message}`);
  }
}

// ── Pulizia ─────────────────────────────────────────────────────────────────
log('\n🔨 Build Tinkercad Serial Data Logger & Exporter');
log('─'.repeat(50));

if (fs.existsSync(DIST_CHROME)) {
  fs.rmSync(DIST_CHROME, { recursive: true, force: true });
}
fs.mkdirSync(DIST_CHROME, { recursive: true });

// ── File statici ─────────────────────────────────────────────────────────────
log('\n📁 Copia file statici...');
const staticFiles = [
  ['manifest.json',              'manifest.json'],
  ['LICENSE',                    'LICENSE'],
  ['PRIVACY.md',                 'PRIVACY.md'],
  ['README.md',                  'README.md'],
  ['src/content/content.css',    'src/content/content.css'],
  ['src/popup/popup.html',       'src/popup/popup.html'],
  ['src/popup/popup.css',        'src/popup/popup.css'],
  ['icons/icon16.png',           'icons/icon16.png'],
  ['icons/icon48.png',           'icons/icon48.png'],
  ['icons/icon128.png',          'icons/icon128.png'],
  ['icons/icon300.png',          'icons/icon300.png'],
];

for (const [src, dest] of staticFiles) {
  copyFile(path.join(ROOT, src), path.join(DIST_CHROME, dest));
  log(`  ✓ ${dest}`);
}

// ── Minificazione JS ─────────────────────────────────────────────────────────
log('\n⚡ Minificazione JS con terser...');

const jsFiles = [
  ['src/content/content.js', 'src/content/content.js'],
  ['src/popup/popup.js',     'src/popup/popup.js'],
];

for (const [src, dest] of jsFiles) {
  const srcPath  = path.join(ROOT, src);
  const destPath = path.join(DIST_CHROME, dest);
  minifyJS(srcPath, destPath);
  log(`  ✓ ${dest}  [${sizeDiff(srcPath, destPath)}]`);
}

// ── Done ─────────────────────────────────────────────────────────────────────
log('\n' + '─'.repeat(50));
log('✅ Chrome build completata in: dist/chrome/');
log('');

