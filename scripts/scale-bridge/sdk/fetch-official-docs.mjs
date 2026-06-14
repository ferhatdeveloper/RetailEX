#!/usr/bin/env node
/**
 * Rongta resmi terazi dokümanlarını indirir.
 * Kaynak: https://www.rongtatech.com/download/ (User Manual / label scale araması)
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, 'docs');

/** Etiket terazisi entegrasyonu için öncelikli dosyalar */
const DOCS = [
  {
    name: 'label-scale-software-user-manual.pdf',
    url: 'https://file.globalso.com/file_manage/4365/20251121/label-scale-software-user-manual.pdf',
    note: 'TCP/IP protokol spesifikasyonu (RetailEX SDK kaynağı)',
  },
  {
    name: 'rls-series-user-manual_v1-3_en.pdf',
    url: 'https://file.globalso.com/file_manage/4365/20251121/rls-series-user-manual_v1-3_en.pdf',
    note: 'RLS1000/RLS1100 donanım kılavuzu',
  },
  {
    name: 'label-scale-user-manual-us-v1-3.pdf',
    url: 'https://file.globalso.com/file_manage/4365/20251121/label-scale-user-manual-us-v1-3.pdf',
    note: 'ABD etiket terazisi kullanım kılavuzu',
  },
];

async function downloadOne(doc) {
  const dest = join(OUT_DIR, doc.name);
  console.log(`[fetch] ${doc.name} …`);
  const res = await fetch(doc.url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`${doc.name}: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(dest, buf);
  console.log(`  → ${dest} (${buf.length} bayt) — ${doc.note}`);
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const manifest = {
    fetchedAt: new Date().toISOString(),
    portal: 'https://www.rongtatech.com/download/',
    files: DOCS.map((d) => ({ ...d, local: join('docs', d.name) })),
  };
  for (const doc of DOCS) {
    await downloadOne(doc);
  }
  await writeFile(join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
  console.log('[fetch] Tamam. Ayrıntı: sdk/OFFICIAL_SOURCES.md');
}

main().catch((e) => {
  console.error('[fetch] Hata:', e instanceof Error ? e.message : e);
  process.exit(1);
});
