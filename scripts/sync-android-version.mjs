/**
 * package.json sürümünü android/app/build.gradle versionName / versionCode ile eşitler.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const v = String(pkg.version ?? '').trim();
if (!/^\d+\.\d+\.\d+/.test(v)) {
  console.error('[sync-android-version] Geçersiz package.json version:', v);
  process.exit(1);
}

const parts = v.split('.').map((n) => parseInt(n, 10) || 0);
const versionCode = parts[0] * 1_000_000 + parts[1] * 1_000 + parts[2];

const gradlePath = join(root, 'android', 'app', 'build.gradle');
let gradle = readFileSync(gradlePath, 'utf8');
gradle = gradle.replace(/versionCode\s+\d+/, `versionCode ${versionCode}`);
gradle = gradle.replace(/versionName\s+"[^"]*"/, `versionName "${v}"`);
writeFileSync(gradlePath, gradle);

console.log(`[sync-android-version] ${v} (code ${versionCode}) → android/app/build.gradle`);
