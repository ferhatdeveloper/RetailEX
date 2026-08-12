#!/usr/bin/env node
/**
 * GitHub Actions "Desktop App Release" tetikler, bitene kadar bekler, kurulumu Masaüstü'ne indirir.
 *
 * Önce package.json sürümü için app-v* tag push edilmiş olmalı VEYA workflow_dispatch çalışır
 * (aynı tag varsa release adımı hata verebilir — yeni sürüm için önce version bump + tag).
 *
 *   npm run desktop:ci:build
 *   npm run desktop:ci:build -- --no-fetch
 */

import { spawnSync, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const defaultRepo = process.env.GITHUB_REPOSITORY || 'ferhatdeveloper/RetailEX';
const workflowFile = 'desktop-release.yml';

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
  process.stdout.write('[desktop:ci] Derleme bekleniyor');
  while (Date.now() - start < maxMin * 60 * 1000) {
    await sleep(20000);
    process.stdout.write('.');
    const list = sh(
      `gh run list --workflow=${workflowFile} --repo ${repo} --limit 5 --json databaseId,status,conclusion,headBranch,displayTitle`,
    );
    const runs = JSON.parse(list);
    const candidate = runs.find((r) => r.databaseId > beforeRunId) || runs[0];
    if (!candidate) continue;
    if (candidate.status === 'completed') {
      process.stdout.write('\n');
      if (candidate.conclusion === 'success') {
        console.log(`[desktop:ci] Başarılı: ${candidate.displayTitle}`);
        return true;
      }
      console.error(`[desktop:ci] Workflow başarısız: ${candidate.conclusion}`);
      sh(`gh run view ${candidate.databaseId} --repo ${repo} --log-failed`).slice(0, 8000);
      return false;
    }
  }
  process.stdout.write('\n');
  console.error('[desktop:ci] Zaman aşımı (100 dk). Actions sekmesinden kontrol edin.');
  return false;
}

async function main() {
  const { fetchAfter } = parseArgs();
  const repo = defaultRepo;
  const tag = `app-v${pkg.version}`;

  try {
    sh('gh auth status');
  } catch {
    console.error('[desktop:ci] gh auth login gerekli.');
    process.exit(1);
  }

  let beforeId = 0;
  try {
    const latest = JSON.parse(
      sh(`gh run list --workflow=${workflowFile} --repo ${repo} --limit 1 --json databaseId`),
    );
    beforeId = latest[0]?.databaseId ?? 0;
  } catch {
    /* ilk çalıştırma */
  }

  console.log(`[desktop:ci] Workflow tetikleniyor (${repo}) — hedef tag: ${tag}`);
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
    const fetchScript = path.join(__dirname, 'fetch-desktop-release-to-desktop.mjs');
    const r = spawnSync(process.execPath, [fetchScript, '--tag', tag, '--repo', repo], {
      stdio: 'inherit',
    });
    process.exit(r.status ?? 0);
  }

  console.log(`[desktop:ci] İndirmek için: npm run desktop:ci:fetch -- --tag ${tag}`);
}

main().catch((e) => {
  console.error(e?.message || e);
  process.exit(1);
});
