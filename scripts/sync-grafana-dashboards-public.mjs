#!/usr/bin/env node
/** docker/grafana/dashboards → public/grafana-dashboards (frontend static + API sync) */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'docker/grafana/dashboards');
const dest = path.join(root, 'public/grafana-dashboards');

fs.mkdirSync(dest, { recursive: true });
for (const f of fs.readdirSync(dest)) {
  if (f.endsWith('.json')) fs.unlinkSync(path.join(dest, f));
}
let n = 0;
for (const f of fs.readdirSync(src)) {
  if (!f.endsWith('.json')) continue;
  fs.copyFileSync(path.join(src, f), path.join(dest, f));
  n++;
}
console.log(`[sync-grafana-dashboards-public] ${n} → public/grafana-dashboards`);
