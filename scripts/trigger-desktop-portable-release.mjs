#!/usr/bin/env node
/**
 * GitHub Actions "Desktop Portable Release" tetikler, bitene kadar bekler, asset'i Masaüstü'ne indirir.
 *
 *   npm run desktop:portable:ci:build              # full EXE
 *   npm run desktop:portable:ci:build -- --no-fetch
 *   npm run desktop:portable:ci:build:soft         # Soft ZIP
 *   node scripts/trigger-desktop-portable-release.mjs --soft
 *   node scripts/trigger-desktop-portable-release.mjs --profile both
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
  let profile = 'full';
  let fetchAfter = true;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--no-fetch') {
      fetchAfter = false;
    } else if (args[i] === '--soft') {
      profile = 'soft';
    } else if (args[i] === '--profile' && args[i + 1]) {
      profile = String(args[++i]).toLowerCase();
    }
  }
  if (!['full', 'soft', 'both'].includes(profile)) {
    console.error(`[desktop:portable:ci] Geçersiz profile: ${profile} (full|soft|both)`);
    process.exit(1);
  }
  return { fetchAfter, profile };
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
  const { fetchAfter, profile } = parseArgs();
  const repo = defaultRepo;
  const tagFull = `portable-v${pkg.version}`;
  const tagSoft = `portable-soft-v${pkg.version}`;

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

  console.log(
    `[desktop:portable:ci] Workflow tetikleniyor (${repo}) — profile=${profile} tags: ${tagFull} / ${tagSoft}`,
  );
  const run = spawnSync(
    'gh',
    ['workflow', 'run', workflowFile, '--repo', repo, '-f', `profile=${profile}`],
    {
      encoding: 'utf8',
      stdio: 'inherit',
    },
  );
  if (run.status !== 0) {
    process.exit(run.status ?? 1);
  }

  await sleep(5000);
  const ok = await waitForRun(repo, beforeId);
  if (!ok) process.exit(1);

  if (fetchAfter) {
    const destDir = path.join(os.homedir(), 'Desktop');
    fs.mkdirSync(destDir, { recursive: true });
    if (profile === 'full' || profile === 'both') {
      const exeName = `RetailEX-${pkg.version}.exe`;
      const legacyExe = `RetailEX-Portable-${pkg.version}.exe`;
      console.log(`[desktop:portable:ci] İndiriliyor: ${tagFull} → ${destDir}`);
      let dl = spawnSync(
        'gh',
        ['release', 'download', tagFull, '--repo', repo, '--pattern', exeName, '--dir', destDir, '--clobber'],
        { stdio: 'inherit' },
      );
      if ((dl.status ?? 1) !== 0) {
        console.log(`[desktop:portable:ci] Eski ad fallback: ${legacyExe}`);
        spawnSync(
          'gh',
          ['release', 'download', tagFull, '--repo', repo, '--pattern', legacyExe, '--dir', destDir, '--clobber'],
          { stdio: 'inherit' },
        );
      }
    }
    if (profile === 'soft' || profile === 'both') {
      const zipName = `RetailEX-Soft-${pkg.version}.zip`;
      const legacyZip = `RetailEX-Portable-Soft-${pkg.version}.zip`;
      console.log(`[desktop:portable:ci] İndiriliyor: ${tagSoft} → ${destDir}`);
      let dl = spawnSync(
        'gh',
        ['release', 'download', tagSoft, '--repo', repo, '--pattern', zipName, '--dir', destDir, '--clobber'],
        { stdio: 'inherit' },
      );
      if ((dl.status ?? 1) !== 0) {
        console.log(`[desktop:portable:ci] Eski ad fallback: ${legacyZip}`);
        spawnSync(
          'gh',
          ['release', 'download', tagSoft, '--repo', repo, '--pattern', legacyZip, '--dir', destDir, '--clobber'],
          { stdio: 'inherit' },
        );
      }
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
