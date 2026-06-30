#!/usr/bin/env node
/**
 * GitHub'daki eski RetailEX masaüstü release'lerini ve app-v* tag'lerini siler.
 * scale-bridge-v* ve diğer release'lere dokunmaz.
 *
 * Kullanım:
 *   node scripts/cleanup-github-desktop-releases.mjs
 *   node scripts/cleanup-github-desktop-releases.mjs --keep app-v0.1.151
 *   node scripts/cleanup-github-desktop-releases.mjs --dry-run
 */

import { execSync } from 'node:child_process';

const defaultRepo = process.env.GITHUB_REPOSITORY || 'ferhatdeveloper/RetailEX';
const DESKTOP_TAG_RE = /^app-v\d+\.\d+\.\d+$/;

function parseArgs() {
  const args = process.argv.slice(2);
  let keep = process.env.RELEASE_TAG || '';
  let repo = defaultRepo;
  let dryRun = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--keep' && args[i + 1]) keep = args[++i];
    else if (args[i] === '--repo' && args[i + 1]) repo = args[++i];
    else if (args[i] === '--dry-run') dryRun = true;
    else if (args[i] === '--help' || args[i] === '-h') {
      console.log('node scripts/cleanup-github-desktop-releases.mjs [--keep app-vX.Y.Z] [--dry-run]');
      process.exit(0);
    }
  }
  return { keep: keep.trim(), repo, dryRun };
}

function sh(cmd) {
  return execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
}

function listDesktopReleaseTags(repo) {
  const raw = sh(
    `gh release list --repo "${repo}" --limit 200 --json tagName,isDraft,isPrerelease`,
  );
  const rows = JSON.parse(raw);
  return rows
    .map((r) => String(r.tagName || '').trim())
    .filter((tag) => DESKTOP_TAG_RE.test(tag));
}

function listDesktopRemoteTags(repo) {
  try {
    const raw = sh(`gh api "repos/${repo}/git/matching-refs/tags/app-v"`);
    const rows = JSON.parse(raw);
    return rows
      .map((r) => String(r.ref || '').replace(/^refs\/tags\//, ''))
      .filter((tag) => DESKTOP_TAG_RE.test(tag));
  } catch {
    return [];
  }
}

function deleteReleaseAndTag(repo, tag, dryRun) {
  if (dryRun) {
    console.log(`[cleanup:desktop] (dry-run) silinecek: ${tag}`);
    return;
  }
  try {
    sh(`gh release delete "${tag}" --repo "${repo}" --yes --cleanup-tag`);
    console.log(`[cleanup:desktop] release+tag silindi: ${tag}`);
  } catch (e) {
    const msg = e?.stderr?.toString?.() || e?.message || String(e);
    if (/not found|404/i.test(msg)) {
      try {
        sh(`gh api --method DELETE "repos/${repo}/git/refs/tags/${encodeURIComponent(tag)}"`);
        console.log(`[cleanup:desktop] yalnızca tag silindi: ${tag}`);
      } catch (e2) {
        console.warn(`[cleanup:desktop] atlandı (${tag}):`, e2?.stderr?.toString?.() || e2?.message || e2);
      }
    } else {
      console.warn(`[cleanup:desktop] hata (${tag}):`, msg);
    }
  }
}

function main() {
  const { keep, repo, dryRun } = parseArgs();

  try {
    sh('gh auth status');
  } catch {
    console.error('[cleanup:desktop] gh auth gerekli.');
    process.exit(1);
  }

  const fromReleases = listDesktopReleaseTags(repo);
  const fromTags = listDesktopRemoteTags(repo);
  const all = [...new Set([...fromReleases, ...fromTags])].sort();

  const toDelete = all.filter((tag) => tag !== keep);
  if (!toDelete.length) {
    console.log(`[cleanup:desktop] Silinecek eski masaüstü sürümü yok.${keep ? ` (korunan: ${keep})` : ''}`);
    return;
  }

  console.log(
    `[cleanup:desktop] ${toDelete.length} eski sürüm${dryRun ? ' (dry-run)' : ''}${keep ? `; korunan: ${keep}` : ''}`,
  );
  for (const tag of toDelete) {
    deleteReleaseAndTag(repo, tag, dryRun);
  }
  console.log('[cleanup:desktop] Tamam.');
}

main();
