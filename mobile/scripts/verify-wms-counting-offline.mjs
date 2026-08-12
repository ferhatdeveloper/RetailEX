#!/usr/bin/env node
/**
 * WMS sayım offline kuyruk — statik doğrulama (PG/bridge gerekmez).
 * Kullanım: node mobile/scripts/verify-wms-counting-offline.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

const mutationSrc = read('src/offline/mutationQueue.ts');
const syncSrc = read('src/offline/syncEngine.ts');
const apiSrc = read('src/api/wmsStockCountApi.ts');
const cacheSrc = read('src/offline/snapshotCache.ts');
const policySrc = read('src/offline/HYBRID_POLICY.md');

const WMS_TYPES = [
  'wms.counting.slip.create',
  'wms.counting.line.upsert',
  'wms.counting.line.delete',
  'wms.counting.status.update',
  'wms.counting.applyStock',
];

const errors = [];

for (const t of WMS_TYPES) {
  if (!mutationSrc.includes(`'${t}'`)) {
    errors.push(`mutationQueue: eksik tip ${t}`);
  }
  if (!syncSrc.includes(`'${t}'`)) {
    errors.push(`syncEngine: eksik handler ${t}`);
  }
}

if (!mutationSrc.includes('coalesceWmsMutation')) {
  errors.push('mutationQueue: WMS coalesce yok');
}
if (!syncSrc.includes('markCountingSlipSynced')) {
  errors.push('syncEngine: markCountingSlipSynced çağrısı yok');
}
if (!cacheSrc.includes('markCountingSlipSynced')) {
  errors.push('snapshotCache: markCountingSlipSynced export yok');
}
if (!apiSrc.includes("slip.status === 'completed'")) {
  errors.push('wmsStockCountApi: applyStock completed guard yok');
}
if (!apiSrc.includes('writeOpts?.lineId')) {
  errors.push('wmsStockCountApi: offline lineId senkronu yok');
}
if (!policySrc.includes('wms.counting.*')) {
  errors.push('HYBRID_POLICY: wms.counting.* belgelenmemiş');
}

if (errors.length) {
  console.error('WMS sayım offline doğrulama BAŞARISIZ:');
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

console.log('WMS sayım offline doğrulama OK');
console.log(`  Tipler (${WMS_TYPES.length}): ${WMS_TYPES.join(', ')}`);
console.log('  Coalesce · cache sync · applyStock idempotent · lineId flush');
