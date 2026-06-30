#!/usr/bin/env node
/**
 * GitHub Release'teki RetailEX masaüstü kurulumunu kullanıcı Masaüstü'ne indirir.
 *
 * Gereksinim: gh CLI (gh auth login)
 *
 * Kullanım:
 *   npm run desktop:ci:fetch
 *   npm run desktop:ci:fetch -- --tag app-v0.1.151
 *   node scripts/fetch-desktop-release-to-desktop.mjs --out "C:\Users\me\Desktop"
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  desktopInstallerFilename,
  LEGACY_DESKTOP_INSTALLER_FILENAME,
} from './desktop-installer-filename.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const defaultRepo = process.env.GITHUB_REPOSITORY || 'ferhatdeveloper/RetailEX';

function parseArgs() {
  const args = process.argv.slice(2);
  let tag = '';
  let outDir = '';
  let repo = defaultRepo;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--tag' && args[i + 1]) tag = args[++i];
    else if (args[i] === '--out' && args[i + 1]) outDir = args[++i];
    else if (args[i] === '--repo' && args[i + 1]) repo = args[++i];
    else if (args[i] === '--help' || args[i] === '-h') {
      console.log(`Kullanım: node scripts/fetch-desktop-release-to-desktop.mjs [--tag app-vX.Y.Z] [--out dizin] [--repo owner/repo]`);
      process.exit(0);
    }
  }
  if (!tag) tag = `app-v${pkg.version}`;
  return { tag, outDir, repo };
}

function resolveDesktopDir() {
  const home = os.homedir();
  if (process.platform === 'win32') {
    const userProfile = process.env.USERPROFILE || home;
    const candidates = [
      process.env.RETAILEX_DESKTOP_DIR,
      path.join(userProfile, 'OneDrive', 'Desktop'),
      path.join(userProfile, 'OneDrive - Personal', 'Desktop'),
      path.join(userProfile, 'Desktop'),
      path.join(home, 'Desktop'),
    ].filter(Boolean);
    for (const dir of candidates) {
      if (fs.existsSync(dir)) return dir;
    }
    return path.join(userProfile, 'Desktop');
  }
  const desktop = path.join(home, 'Desktop');
  return fs.existsSync(desktop) ? desktop : home;
}

function sh(cmd) {
  return execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
}

function downloadAsset(repo, tag, pattern, tmp) {
  sh(`gh release download "${tag}" --repo "${repo}" --pattern "${pattern}" --dir "${tmp}"`);
  const files = fs.readdirSync(tmp).filter((f) => f.toLowerCase().endsWith('.exe'));
  return files[0] ? path.join(tmp, files[0]) : null;
}

function main() {
  const { tag, outDir, repo } = parseArgs();
  const version = tag.replace(/^app-v/, '');
  const desktop = outDir || resolveDesktopDir();
  fs.mkdirSync(desktop, { recursive: true });

  try {
    sh('gh auth status');
  } catch {
    console.error('[desktop:fetch] gh CLI oturumu yok. Windows: gh auth login');
    process.exit(1);
  }

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'retailex-setup-'));
  console.log(`[desktop:fetch] Release: ${tag} (${repo})`);

  const versionedName = desktopInstallerFilename(version);
  let src = null;
  try {
    src = downloadAsset(repo, tag, versionedName, tmp);
  } catch {
    /* eski release */
  }
  if (!src) {
    try {
      console.warn(`[desktop:fetch] ${versionedName} yok; eski ad deneniyor: ${LEGACY_DESKTOP_INSTALLER_FILENAME}`);
      src = downloadAsset(repo, tag, LEGACY_DESKTOP_INSTALLER_FILENAME, tmp);
    } catch (e) {
      console.error(`[desktop:fetch] İndirme başarısız. gh release view ${tag} --repo ${repo}`);
      console.error(e?.stderr?.toString?.() || e?.message || e);
      process.exit(1);
    }
  }

  if (!src || !fs.existsSync(src)) {
    console.error('[desktop:fetch] Kurulum dosyası bulunamadı.');
    process.exit(1);
  }

  const dest = path.join(desktop, versionedName);
  fs.copyFileSync(src, dest);
  const sizeMb = (fs.statSync(dest).size / (1024 * 1024)).toFixed(1);
  console.log(`[desktop:fetch] Tamam: ${dest} (${sizeMb} MB)`);
}

main();
