#!/usr/bin/env node
/**
 * GitHub Actions "Desktop Portable Release" tetikler, bitene kadar bekler, zip'i Masaüstü'ne indirir.
 *
 *   npm run desktop:portable:ci:build
 *   npm run desktop:portable:ci:build -- --no-fetch
 */
import { spawnSync, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const defaultRepo = process.env.GITHUB_REPOSITORY || 'ferhatdeveloper/RetailEX';
const workflowFile = 'desktop-portable-release.yml';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function sh(cmd) {
  return execSync(cmd, { encoding: 'utf8' }).trim();
}

function parseArgs() {
  const args = process.argv.slice(2);
  return { fetchAfter: !args.includes('--no-fetch') };
}

async function waitForRun(repo, beforeRunId) {
  const maxMin = 100;
  const start = Date.now();
  process.stdout.write('[desktop:portable:ci] Derleme bekleniyor');
  while (Date.now() - start < maxMin * 60 * 1000) {
    await sleep(20000);
    process.stdout.write('.');
    const list = sh(
      `gh run list --workflow=${workflowFile} --repo ${repo} --limit 5 --json databaseId,status,conclusion,displayTitle`,
    );
    const runs = JSON.parse(list);
    const candidate = runs.find((r) => r.databaseId > beforeRunId) || runs[0];
    if (!candidate) continue;
    if (candidate.status === 'completed') {
      process.stdout.write('\n');
      if (candidate.conclusion === 'success') {
        console.log(`[desktop:portable:ci] Başarılı: ${candidate.displayTitle}`);
        return true;
      }
      console.error(`[desktop:portable:ci] Workflow başarısız: ${candidate.conclusion}`);
      try {
        console.error(sh(`gh run view ${candidate.databaseId} --repo ${repo} --log-failed`).slice(0, 8000));
      } catch {
        /* ignore */
      }
      return false;
    }
  }
  process.stdout.write('\n');
  console.error('[desktop:portable:ci] Zaman aşımı (100 dk).');
  return false;
}

async function main() {
  const { fetchAfter } = parseArgs();
  const repo = defaultRepo;
  const tag = `portable-v${pkg.version}`;

  try {
    sh('gh auth status');
  } catch {
    console.error('[desktop:portable:ci] gh auth login gerekli.');
    process.exit(1);
  }

  const remote = sh('git remote get-url origin');
  if (!/RetailEX/i.test(remote)) {
    console.error(`[desktop:portable:ci] origin RetailEX değil: ${remote}`);
    process.exit(1);
  }

  let beforeId = 0;
  try {
    const latest = JSON.parse(
      sh(`gh run list --workflow=${workflowFile} --repo ${repo} --limit 1 --json databaseId`),
    );
    beforeId = latest[0]?.databaseId ?? 0;
  } catch {
    /* ilk */
  }

  console.log(`[desktop:portable:ci] Workflow tetikleniyor (${repo}) — hedef tag: ${tag}`);
  const run = spawnSync('gh', ['workflow', 'run', workflowFile, '--repo', repo], {
    encoding: 'utf8',
    stdio: 'inherit',
  });
  if (run.status !== 0) {
    process.exit(run.status ?? 1);
  }

  await sleep(5000);
  const ok = await waitForRun(repo, beforeId);
  if (!ok) process.exit(1);

  if (fetchAfter) {
    const zipName = `RetailEX-Portable-${pkg.version}.zip`;
    const destDir = path.join(os.homedir(), 'Desktop');
    fs.mkdirSync(destDir, { recursive: true });
    console.log(`[desktop:portable:ci] İndiriliyor: ${tag} → ${destDir}`);
    spawnSync(
      'gh',
      ['release', 'download', tag, '--repo', repo, '--pattern', zipName, '--dir', destDir, '--clobber'],
      { stdio: 'inherit' },
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
