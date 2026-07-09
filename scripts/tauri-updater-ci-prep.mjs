#!/usr/bin/env node
/**
 * CI: TAURI_SIGNING_PRIVATE_KEY geçersiz/eksikse updater artifact üretimini kapatır.
 * Böylece NSIS kurulumu başarılı olur; otomatik güncelleme zip'i yalnızca geçerli anahtarla üretilir.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const deskApp = path.join(root, 'DeskApp');
const tauriConfPath = path.join(deskApp, 'tauri.conf.json');
const overlayPath = path.join(deskApp, 'tauri.updater-ci.conf.json');

function decodeKey(raw) {
  const t = String(raw || '').trim();
  if (!t) return '';
  if (t.includes('untrusted comment')) return t;
  try {
    const b = Buffer.from(t.replace(/\s+/g, ''), 'base64');
    const s = b.toString('utf8');
    if (s.includes('untrusted comment')) return s;
  } catch {
    /* base64 değil */
  }
  return t;
}

function isValidMinisignPrivateKey(raw) {
  const key = decodeKey(raw);
  if (!key) return false;
  return (
    key.includes('untrusted comment:') &&
    key.includes('minisign encrypted secret key') &&
    key.includes('RW')
  );
}

const rawKey = process.env.TAURI_SIGNING_PRIVATE_KEY || '';
const valid = isValidMinisignPrivateKey(rawKey);

if (valid) {
  if (fs.existsSync(overlayPath)) fs.unlinkSync(overlayPath);
  console.log('[tauri-updater-ci] Geçerli minisign anahtarı — updater artifact açık.');
  if (process.env.GITHUB_ENV) {
    fs.appendFileSync(process.env.GITHUB_ENV, 'TAURI_SIGNING_ENABLED=1\n');
  }
  process.exit(0);
}

// Tauri CLI birleştirme: createUpdaterArtifacts=false
const overlay = {
  bundle: {
    createUpdaterArtifacts: false,
  },
};

fs.writeFileSync(overlayPath, `${JSON.stringify(overlay, null, 2)}\n`);
console.log(
  '[tauri-updater-ci] TAURI_SIGNING_PRIVATE_KEY eksik veya geçersiz — createUpdaterArtifacts=false (yalnızca NSIS setup).',
);

if (process.env.GITHUB_ENV) {
  fs.appendFileSync(process.env.GITHUB_ENV, 'TAURI_SIGNING_ENABLED=0\n');
}
