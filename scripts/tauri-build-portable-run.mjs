#!/usr/bin/env node
/**
 * Tauri portable build: NSIS yok (--no-bundle), updater kapalı.
 * Kaynak: DeskApp/tauri.portable.conf.json
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const deskApp = path.join(__dirname, '..', 'DeskApp');
const portableConf = path.join(deskApp, 'tauri.portable.conf.json');

if (!fs.existsSync(portableConf)) {
  console.error('[tauri:portable] DeskApp/tauri.portable.conf.json yok');
  process.exit(1);
}

const args = ['build', '--no-bundle', '--config', 'tauri.portable.conf.json'];

execSync(`npx tauri ${args.map((a) => `"${a}"`).join(' ')}`, {
  cwd: deskApp,
  stdio: 'inherit',
  env: {
    ...process.env,
    ASIN_PORTABLE: process.env.ASIN_PORTABLE || '1',
  },
  shell: true,
});
