#!/usr/bin/env node
/**
 * Kök package.json sürümünü mobile/app.json (Expo) ve mobile/package.json ile eşitler.
 * Android versionCode: major*1_000_000 + minor*1_000 + patch
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const v = String(pkg.version ?? '').trim();
if (!/^\d+\.\d+\.\d+/.test(v)) {
  console.error('[sync-mobile-version] Geçersiz package.json version:', v);
  process.exit(1);
}

const parts = v.split('.').map((n) => parseInt(n, 10) || 0);
const versionCode = parts[0] * 1_000_000 + parts[1] * 1_000 + parts[2];

const appJsonPath = join(root, 'mobile', 'app.json');
const appJson = JSON.parse(readFileSync(appJsonPath, 'utf8'));
appJson.expo = appJson.expo || {};
appJson.expo.version = v;
appJson.expo.android = appJson.expo.android || {};
appJson.expo.android.versionCode = versionCode;
appJson.expo.ios = appJson.expo.ios || {};
appJson.expo.ios.buildNumber = String(versionCode);
writeFileSync(appJsonPath, `${JSON.stringify(appJson, null, 2)}\n`, 'utf8');

const mobilePkgPath = join(root, 'mobile', 'package.json');
const mobilePkg = JSON.parse(readFileSync(mobilePkgPath, 'utf8'));
mobilePkg.version = v;
writeFileSync(mobilePkgPath, `${JSON.stringify(mobilePkg, null, 2)}\n`, 'utf8');

console.log(`[sync-mobile-version] ${v} (code ${versionCode}) → mobile/app.json + mobile/package.json`);
