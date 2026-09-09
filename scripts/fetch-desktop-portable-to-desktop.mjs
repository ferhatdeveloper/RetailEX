#!/usr/bin/env node
/**
 * GitHub Release'ten RetailEX-Portable-{version}.zip indirir (Masaüstü).
 *
 *   npm run desktop:portable:ci:fetch
 *   npm run desktop:portable:ci:fetch -- --tag portable-v0.1.263
 */
import { spawnSync, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const repo = process.env.GITHUB_REPOSITORY || 'ferhatdeveloper/RetailEX';

function parseArgs() {
  const args = process.argv.slice(2);
  let tag = `portable-v${pkg.version}`;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--tag' && args[i + 1]) tag = args[++i];
  }
  return { tag };
}

const { tag } = parseArgs();
const version = tag.replace(/^portable-v/, '');
const zipName = `RetailEX-Portable-${version}.zip`;
const destDir = path.join(os.homedir(), 'Desktop');

const remote = execSync('git remote get-url origin', { encoding: 'utf8' }).trim();
if (!/RetailEX/i.test(remote)) {
  console.error(`origin RetailEX değil: ${remote}`);
  process.exit(1);
}

fs.mkdirSync(destDir, { recursive: true });
console.log(`[portable:fetch] ${tag} / ${zipName} → ${destDir}`);
const r = spawnSync(
  'gh',
  ['release', 'download', tag, '--repo', repo, '--pattern', zipName, '--dir', destDir, '--clobber'],
  { stdio: 'inherit' },
);
process.exit(r.status ?? 1);
