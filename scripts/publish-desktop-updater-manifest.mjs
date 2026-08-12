#!/usr/bin/env node
/**
 * GitHub Release için Tauri updater `latest.json` üretir.
 * Kullanım (CI):
 *   node scripts/publish-desktop-updater-manifest.mjs \
 *     --version 0.1.205 \
 *     --tag app-v0.1.205 \
 *     --bundle-dir DeskApp/target/release/bundle/nsis \
 *     --out dist/latest.json
 */
import fs from 'node:fs';
import path from 'node:path';

const REPO = 'ferhatdeveloper/RetailEX';

function arg(name, fallback = '') {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const version = arg('--version') || process.env.PACKAGE_VERSION;
const tag = arg('--tag') || process.env.RELEASE_TAG || (version ? `app-v${version}` : '');
const bundleDir = arg('--bundle-dir', 'DeskApp/target/release/bundle/nsis');
const outFile = arg('--out', 'dist/latest.json');

if (!version || !tag) {
  console.error('Sürüm gerekli: --version veya PACKAGE_VERSION');
  process.exit(1);
}

if (!fs.existsSync(bundleDir)) {
  console.error(`Bundle klasörü yok: ${bundleDir}`);
  process.exit(1);
}

const zip = fs
  .readdirSync(bundleDir)
  .filter((f) => f.endsWith('.nsis.zip') && !f.endsWith('.sig'))
  .sort()
  .pop();

if (!zip) {
  console.error(`NSIS updater zip bulunamadı: ${bundleDir} (*.nsis.zip)`);
  process.exit(1);
}

const sigPath = path.join(bundleDir, `${zip}.sig`);
if (!fs.existsSync(sigPath)) {
  console.error(`İmza dosyası yok: ${sigPath} — TAURI_SIGNING_PRIVATE_KEY tanımlı mı?`);
  process.exit(1);
}

const signature = fs.readFileSync(sigPath, 'utf8').trim();
const baseUrl = `https://github.com/${REPO}/releases/download/${tag}/${zip}`;

const manifest = {
  version,
  notes: `RetailEX Desktop ${version} — GitHub otomatik güncelleme`,
  pub_date: new Date().toISOString(),
  platforms: {
    'windows-x86_64': {
      signature,
      url: baseUrl,
    },
  },
};

fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
console.log(`latest.json yazıldı: ${outFile}`);
console.log(`  url: ${baseUrl}`);
