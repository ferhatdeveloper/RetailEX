#!/usr/bin/env node
/**
 * Expo projesini EAS'e bağlar → app.json extra.eas.projectId yazar.
 * Önce: npx eas-cli@latest login
 *
 *   npm run mobile:eas:init
 */

import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const mobileDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'mobile');

console.log('[eas-init] RetailEX mobile → Expo Application Services');
console.log('[eas-init] Önce Expo hesabına giriş: npx eas-cli@latest login\n');

const r = spawnSync('npx', ['eas-cli@latest', 'init'], {
  cwd: mobileDir,
  stdio: 'inherit',
  shell: true,
});

if (r.status === 0) {
  console.log('\n[eas-init] Tamam. Doğrulama: npm run mobile:eas:check');
  console.log('[eas-init] İlk preview: npm run mobile:eas:preview');
}

process.exit(r.status ?? 1);
