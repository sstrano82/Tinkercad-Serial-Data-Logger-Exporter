/**
 * release.js — Script per il bump automatico della versione e creazione pacchetto Store .zip
 * Uso:
 *   node release.js patch   (es. 1.0.0 -> 1.0.1)  [default]
 *   node release.js minor   (es. 1.0.1 -> 1.1.0)
 *   node release.js major   (es. 1.1.0 -> 2.0.0)
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = __dirname;
const MANIFEST_PATH = path.join(ROOT, 'manifest.json');
const PACKAGE_PATH = path.join(ROOT, 'package.json');
const DIST_CHROME = path.join(ROOT, 'dist', 'chrome');
const RELEASES_DIR = path.join(ROOT, 'releases');

// 1. Determina tipo di bump (patch | minor | major)
const bumpType = (process.argv[2] || 'patch').toLowerCase();

// 2. Leggi versione attuale
const manifestRaw = fs.readFileSync(MANIFEST_PATH, 'utf8').replace(/^\uFEFF/, '');
const manifest = JSON.parse(manifestRaw);
const currentVersion = manifest.version || '1.0.0';
const parts = currentVersion.split('.').map(n => parseInt(n, 10));

if (parts.length !== 3 || parts.some(isNaN)) {
  console.error(`❌ Versione non valida nel manifest: ${currentVersion}`);
  process.exit(1);
}

// 3. Calcola nuova versione
let [major, minor, patch] = parts;
if (bumpType === 'major') {
  major += 1;
  minor = 0;
  patch = 0;
} else if (bumpType === 'minor') {
  minor += 1;
  patch = 0;
} else {
  // default: patch
  patch += 1;
}

const newVersion = `${major}.${minor}.${patch}`;

console.log('\n🚀 Preparazione Release');
console.log('─'.repeat(50));
console.log(`Versione: ${currentVersion}  -->  ${newVersion} (${bumpType})`);

// 4. Aggiorna manifest.json
manifest.version = newVersion;
fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
console.log(`✓ Aggiornato manifest.json (v${newVersion})`);

// 5. Aggiorna package.json (rimuovendo eventuale BOM UTF-8)
if (fs.existsSync(PACKAGE_PATH)) {
  const pkgRaw = fs.readFileSync(PACKAGE_PATH, 'utf8').replace(/^\uFEFF/, '');
  const pkg = JSON.parse(pkgRaw);
  pkg.version = newVersion;
  fs.writeFileSync(PACKAGE_PATH, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
  console.log(`✓ Aggiornato package.json (v${newVersion})`);
}

// 6. Esegui la build compilata e minificata
console.log('\n🔨 Esecuzione build minificata...');
execSync('node build.js', { stdio: 'inherit' });

// 7. Crea cartella releases/ se non esiste
if (!fs.existsSync(RELEASES_DIR)) {
  fs.mkdirSync(RELEASES_DIR, { recursive: true });
}

// 8. Crea pacchetto .zip nativo pronto per Microsoft Edge Add-ons / Chrome Web Store
const zipFileName = `tinkercad-serial-logger-v${newVersion}.zip`;
const zipFilePath = path.join(RELEASES_DIR, zipFileName);

if (fs.existsSync(zipFilePath)) {
  fs.unlinkSync(zipFilePath);
}

// Compressione zip con tar nativo di Windows
execSync(`tar -a -c -f "${zipFilePath}" -C "${DIST_CHROME}" *`, { stdio: 'pipe' });

const sizeKB = (fs.statSync(zipFilePath).size / 1024).toFixed(1);
console.log('─'.repeat(50));
console.log(`📦 Pacchetto per Edge / Chrome Store creato con successo!`);
console.log(`   Percorso: releases/${zipFileName} (${sizeKB} KB)`);
console.log(`   Pronto per l'upload su Microsoft Partner Center / Edge Add-ons!\n`);
