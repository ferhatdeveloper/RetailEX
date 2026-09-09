#!/usr/bin/env node
/**
 * Portable CI: NSIS/updater yok — yalnızca binary + frontend (tauri build --no-bundle).
 */
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const deskApp = path.join(__dirname, '..', 'DeskApp');

execSync('npx tauri build --no-bundle', {
  cwd: deskApp,
  stdio: 'inherit',
  env: {
    ...process.env,
    WINDOWS_CODESIGN_DISABLE: process.env.WINDOWS_CODESIGN_DISABLE || '1',
  },
  shell: true,
});
