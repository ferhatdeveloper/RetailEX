#!/usr/bin/env node
/**
 * tauri build — updater CI overlay varsa --config ile birleştirir.
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const deskApp = path.join(__dirname, '..', 'DeskApp');
const overlay = path.join(deskApp, 'tauri.updater-ci.conf.json');

const args = ['build'];
if (fs.existsSync(overlay)) {
  args.push('--config', 'tauri.updater-ci.conf.json');
}

execSync(`npx tauri ${args.map((a) => `"${a}"`).join(' ')}`, {
  cwd: deskApp,
  stdio: 'inherit',
  env: process.env,
  shell: true,
});
