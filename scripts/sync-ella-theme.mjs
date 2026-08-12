#!/usr/bin/env node
/**
 * Ella HTML Template — B2B reposundan eticaret/themes/ella dizinine kopyalar.
 * Kaynak: https://github.com/ferhatdeveloper/B2B/tree/main/Ella%20HTML%20Template
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const target = path.join(root, 'eticaret/themes/ella');
const tmp = path.join(root, '.tmp-b2b-ella');

if (fs.existsSync(tmp)) fs.rmSync(tmp, { recursive: true, force: true });

execSync(
  `git clone --depth 1 --filter=blob:none --sparse https://github.com/ferhatdeveloper/B2B.git "${tmp}"`,
  { stdio: 'inherit' },
);
execSync(`git -C "${tmp}" sparse-checkout set "Ella HTML Template/Ella-HTML"`, { stdio: 'inherit' });

const src = path.join(tmp, 'Ella HTML Template/Ella-HTML');
if (!fs.existsSync(src)) {
  console.error('Ella HTML Template bulunamadı.');
  process.exit(1);
}

if (fs.existsSync(target)) fs.rmSync(target, { recursive: true, force: true });
fs.cpSync(src, target, { recursive: true });
fs.rmSync(tmp, { recursive: true, force: true });

console.log('Ella tema kopyalandı:', target);
