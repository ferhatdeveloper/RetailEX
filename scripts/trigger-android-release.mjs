#!/usr/bin/env node
/**
 * GitHub Actions "Android App Release" (React Native / Expo mobile/) tetikler, bitene kadar bekler.
 *
 *   npm run android:ci:build
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const defaultRepo = process.env.GITHUB_REPOSITORY || 'ferhatdeveloper/RetailEX';
const workflowFile = 'android-release.yml';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function sh(cmd) {
  return execSync(cmd, { encoding: 'utf8' }).trim();
}

async function waitForRun(repo, beforeRunId) {
  const maxMin = 60;
  const start = Date.now();
  process.stdout.write('[android:ci] Derleme bekleniyor (RN/Expo)');
  while (Date.now() - start < maxMin * 60 * 1000) {
    await sleep(15000);
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
        console.log(`[android:ci] Başarılı: ${candidate.displayTitle}`);
        console.log(`[android:ci] Run: ${candidate.url}`);
        return candidate;
      }
      console.error(`[android:ci] Workflow başarısız: ${candidate.conclusion}`);
      try {
        console.error(sh(`gh run view ${candidate.databaseId} --repo ${repo} --log-failed`).slice(0, 12000));
      } catch {
        /* ignore */
      }
      return null;
    }
  }
  process.stdout.write('\n');
  console.error('[android:ci] Zaman aşımı. Actions sekmesinden kontrol edin.');
  return null;
}

async function main() {
  const repo = defaultRepo;
  const version = pkg.version;
  const tag = `android-v${version}`;

  try {
    sh('gh auth status');
  } catch {
    console.error('[android:ci] gh auth login gerekli.');
    process.exit(1);
  }

  let beforeId = 0;
  try {
    const latest = JSON.parse(
      sh(`gh run list --workflow=${workflowFile} --repo ${repo} --limit 1 --json databaseId`),
    );
    beforeId = latest[0]?.databaseId ?? 0;
  } catch {
    beforeId = 0;
  }

  console.log(`[android:ci] Workflow tetikleniyor (${workflowFile}) — RN mobile/, tag hedefi: ${tag}`);
  sh(`gh workflow run ${workflowFile} --repo ${repo}`);

  const run = await waitForRun(repo, beforeId);
  if (!run) process.exit(1);

  const artifactName = `RetailEX-Android-${version}`;
  console.log(`[android:ci] Artifact: ${artifactName}`);
  console.log(`[android:ci] İndirme: ${run.url} → Artifacts bölümü`);

  try {
    const rel = sh(`gh release view ${tag} --repo ${repo} --json url -q .url`);
    if (rel) {
      console.log(`[android:ci] Release: ${rel}`);
    }
  } catch {
    console.log('[android:ci] Tag release yok (workflow_dispatch); artifact kullanın. Tag için: git tag ' + tag);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
