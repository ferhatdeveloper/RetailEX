#!/usr/bin/env node
/**
 * WhatsApp Baileys bridge icin portable prebundle.
 *
 * scripts/whatsapp-bridge/package.json bagimliliklarini (pino, qrcode, baileys)
 * `npm ci --omit=dev` ile kurar ve `DeskApp/resources/node_modules/whatsapp-bridge`
 * altina kopyalar. `pack-retailex-portable-zip.mjs` bu klasoru portable EXE/ZIP
 * icine `node_modules/whatsapp-bridge` olarak paketler; RetailEX_WA_Bridge.exe
 * calisirken bu modul yolunu kullanir.
 *
 * Kullanim:
 *   node scripts/bundle-whatsapp-bridge-portable.mjs
 *
 * CI: desktop-portable-release.yml icinde build oncesi cagirilir.
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const bridgeDir = path.join(root, 'scripts', 'whatsapp-bridge');
const target = path.join(root, 'DeskApp', 'resources', 'node_modules', 'whatsapp-bridge');

if (!fs.existsSync(path.join(bridgeDir, 'package.json'))) {
  throw new Error(`[wa-bridge:prebundle] package.json yok: ${bridgeDir}/package.json`);
}

console.log(`[wa-bridge:prebundle] Kaynak: ${bridgeDir}`);
console.log(`[wa-bridge:prebundle] Hedef:  ${target}`);

// 1) scripts/whatsapp-bridge icin temiz kurulum (gerekirse)
const localNm = path.join(bridgeDir, 'node_modules');
try {
  if (!fs.existsSync(localNm)) {
    console.log('[wa-bridge:prebundle] npm install (ilk kurulum)...');
    execSync('npm install --omit=dev', { cwd: bridgeDir, stdio: 'inherit' });
  } else {
    console.log('[wa-bridge:prebundle] node_modules mevcut, npm install atlandi.');
  }
} catch (e) {
  throw new Error(`[wa-bridge:prebundle] npm install basarisiz: ${e?.message || e}`);
}

// 2) Hedefi temizle
if (fs.existsSync(target)) {
  fs.rmSync(target, { recursive: true, force: true });
}
fs.mkdirSync(target, { recursive: true });

// 3) tum node_modules icindeki bagimliliklari hedefe tasi (sadece runtime paketleri, devDependencies haric).
// scripts/whatsapp-bridge/package.json icindeki dependencies listesini kullan.
const pkg = JSON.parse(fs.readFileSync(path.join(bridgeDir, 'package.json'), 'utf8'));
const deps = pkg.dependencies || {};
console.log(`[wa-bridge:prebundle] Paketlenen runtime deps: ${Object.keys(deps).join(', ')}`);

// Klasor olustur ve gerekiyorsa .bin linklerini de tasi
for (const dep of Object.keys(deps)) {
  const src = path.join(localNm, dep);
  if (!fs.existsSync(src)) {
    throw new Error(
      `[wa-bridge:prebundle] '${dep}' node_modules altinda bulunamadi (${src}). Once 'npm install --prefix scripts/whatsapp-bridge' calistirin.`
    );
  }
  copyRecursive(src, path.join(target, dep));
}

// .bin klasoru (komut calistirmak icin)
const binSrc = path.join(localNm, '.bin');
if (fs.existsSync(binSrc)) {
  copyRecursive(binSrc, path.join(target, '.bin'));
}

console.log(`[wa-bridge:prebundle] OK: ${target}`);

function copyRecursive(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const ent of fs.readdirSync(src, { withFileTypes: true })) {
      // dev / test / docs / example iceriklerini atla (boyut优化)
      if (['test', 'tests', '__tests__', '.github', 'docs', 'doc', 'examples', 'example'].includes(ent.name)) {
        continue;
      }
      copyRecursive(path.join(src, ent.name), path.join(dest, ent.name));
    }
  } else if (stat.isFile()) {
    fs.copyFileSync(src, dest);
  } else if (stat.isSymbolicLink()) {
    try {
      const target_path = fs.readlinkSync(src);
      fs.symlinkSync(target_path, dest);
    } catch {
      // symlink basarisizsa kopyaya dus
      try {
        fs.copyFileSync(src, dest);
      } catch {
        /* ignore */
      }
    }
  }
}
