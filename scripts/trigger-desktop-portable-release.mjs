#!/usr/bin/env node
/**
 * GitHub Actions "Desktop Portable Release" tetikler.
 *
 *   npm run desktop:ci:portable
 *   npm run desktop:ci:portable -- --tag-only   # yalnızca portable-v* tag push
 */
import { spawnSync, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const workflowFile = 'desktop-portable-release.yml';

function sh(cmd) {
  return execSync(cmd, { encoding: 'utf8', cwd: root }).trim();
}

function detectRepo() {
  if (process.env.GITHUB_REPOSITORY) return process.env.GITHUB_REPOSITORY;
  try {
    const url = sh('git remote get-url origin');
    const m = url.match(/github\.com[:/](.+?)(?:\.git)?$/i);
    if (m) return m[1].replace(/\/$/, '');
  } catch {
    /* ignore */
  }
  return 'ferhatdeveloper/asin';
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForRun(repo, beforeRunId) {
  const maxMin = 100;
  const start = Date.now();
  process.stdout.write('[desktop:portable] Derleme bekleniyor');
  while (Date.now() - start < maxMin * 60 * 1000) {
    await sleep(20000);
    process.stdout.write('.');
    const list = sh(
      `gh run list --workflow=${workflowFile} --repo ${repo} --limit 5 --json databaseId,status,conclusion,displayTitle,url`,
    );
    const runs = JSON.parse(list);
    const candidate = runs.find((r) => r.databaseId > beforeRunId) || runs[0];
    if (!candidate) continue;
    if (candidate.status === 'completed') {
      process.stdout.write('\n');
      if (candidate.conclusion === 'success') {
        console.log(`[desktop:portable] Başarılı: ${candidate.displayTitle}`);
        console.log(`[desktop:portable] ${candidate.url}`);
        return true;
      }
      console.error(`[desktop:portable] Workflow başarısız: ${candidate.conclusion}`);
      console.error(`[desktop:portable] ${candidate.url}`);
      return false;
    }
  }
  process.stdout.write('\n');
  console.error('[desktop:portable] Zaman aşımı. Actions sekmesinden kontrol edin.');
  return false;
}

async function main() {
  const tagOnly = process.argv.includes('--tag-only');
  const repo = detectRepo();
  const version = pkg.version;
  const tag = `portable-v${version}`;

  try {
    sh('gh auth status');
  } catch {
    console.error('[desktop:portable] gh auth login gerekli.');
    process.exit(1);
  }

  // Tag oluştur / güncelle ve push (workflow tetikleyici)
  try {
    sh(`git rev-parse ${tag}`);
    console.log(`[desktop:portable] Yerel tag var, yeniden işaretleniyor: ${tag}`);
    sh(`git tag -d ${tag}`);
  } catch {
    /* yeni tag */
  }
  sh(`git tag -a ${tag} -m "AsinERP Portable ${version}"`);
  const push = spawnSync('git', ['push', 'origin', tag, '--force'], {
    cwd: root,
    encoding: 'utf8',
    stdio: 'inherit',
  });
  if (push.status !== 0) {
    process.exit(push.status ?? 1);
  }

  console.log(`[desktop:portable] Tag push edildi: ${tag} → ${repo}`);
  if (tagOnly) {
    console.log(
      `[desktop:portable] İzleme: https://github.com/${repo}/actions/workflows/${workflowFile}`,
    );
    return;
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

  await sleep(8000);
  // Tag push zaten workflow'u tetikler; ek workflow_dispatch gerekmez.
  // Tag kaçırıldıysa manuel tetikle:
  let runs = [];
  try {
    runs = JSON.parse(
      sh(
        `gh run list --workflow=${workflowFile} --repo ${repo} --limit 3 --json databaseId,status,event,displayTitle,url`,
      ),
    );
  } catch {
    /* */
  }
  const fresh = runs.find((r) => r.databaseId > beforeId);
  if (!fresh) {
    console.log('[desktop:portable] Tag run görünmedi; workflow_dispatch deneniyor…');
    const run = spawnSync('gh', ['workflow', 'run', workflowFile, '--repo', repo], {
      encoding: 'utf8',
      stdio: 'inherit',
    });
    if (run.status !== 0) process.exit(run.status ?? 1);
    await sleep(5000);
  }

  const ok = await waitForRun(repo, beforeId);
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e?.message || e);
  process.exit(1);
});
