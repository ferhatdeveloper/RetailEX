#!/usr/bin/env node
/**
 * Köprü staging / kurulum dizininde gerekli dosyalar var mi?
 *   node scripts/scale-bridge/validate-package.mjs [scale-bridge-dir]
 */
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = process.argv[2] || join(__dirname, 'installer', 'staging', 'scale-bridge');

const required = [
  'server.mjs',
  'rongtaTcp.mjs',
  'scan.mjs',
  'scalePorts.mjs',
  'listen.mjs',
  'rongtaDll.mjs',
  'admin/index.html',
  'sdk/rongta/index.mjs',
  'sdk/rongta/client.mjs',
  'sdk/rongta/protocol.mjs',
  'sdk/rongta/transport.mjs',
];

const missing = required.filter((rel) => !existsSync(join(root, rel)));
if (missing.length) {
  console.error('[validate-package] Eksik dosyalar:');
  for (const m of missing) console.error('  -', m);
  process.exit(1);
}

console.log('[validate-package] OK —', root);
