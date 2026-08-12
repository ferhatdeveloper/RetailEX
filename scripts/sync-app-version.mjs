/**
 * package.json içindeki "version" alanını DeskApp/tauri.conf.json ve DeskApp/Cargo.toml ile eşitler.
 * Tek doğruluk kaynağı: kök package.json — npm run build öncesi (prebuild) çalışır.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const pkgPath = join(root, 'package.json');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
const v = String(pkg.version ?? '').trim();
if (!/^\d+\.\d+\.\d+/.test(v)) {
  console.error('[sync-app-version] Geçersiz package.json version:', v);
  process.exit(1);
}

const tauriPath = join(root, 'DeskApp', 'tauri.conf.json');
const tauri = JSON.parse(readFileSync(tauriPath, 'utf8'));
tauri.version = v;
writeFileSync(tauriPath, JSON.stringify(tauri, null, 2) + '\n');

const cargoPath = join(root, 'DeskApp', 'Cargo.toml');
const cargoLines = readFileSync(cargoPath, 'utf8').split(/\r?\n/);
let inPackage = false;
for (let i = 0; i < cargoLines.length; i++) {
  const line = cargoLines[i];
  if (line.trim() === '[package]') {
    inPackage = true;
    continue;
  }
  if (inPackage && line.startsWith('[') && line.trim() !== '[package]') break;
  if (inPackage && /^version\s*=\s*"/.test(line)) {
    cargoLines[i] = `version = "${v}"`;
    break;
  }
}
writeFileSync(cargoPath, cargoLines.join('\n') + (cargoLines[cargoLines.length - 1] === '' ? '' : '\n'));

console.log(`[sync-app-version] ${v} → DeskApp/tauri.conf.json, DeskApp/Cargo.toml`);
