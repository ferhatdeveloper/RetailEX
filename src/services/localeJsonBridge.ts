/**
 * pg_bridge: yalnızca izinli dil klasöründeki JSON dosyalarını okur ve yazar.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Hono } from 'hono';
import {
  LOCALE_JSON_ROOTS,
  assertSafeLocaleRelative,
  localeFileLanguage,
  parseLocaleJson,
  type LocaleRootId,
} from '../utils/localeJsonDocument';

export interface LocaleCatalogFile {
  file: string;
  language: string;
}

export interface LocaleCatalogRoot {
  id: LocaleRootId;
  relative: string;
  files: LocaleCatalogFile[];
  missing: boolean;
}

export interface LocaleCatalog {
  roots: LocaleCatalogRoot[];
  writable: boolean;
}

export function findLocaleRepoRoot(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [process.cwd(), path.resolve(here, '../..')];
  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, LOCALE_JSON_ROOTS['mobile-i18n']))) return candidate;
  }
  return process.cwd();
}

function localeRootAbsolute(repoRoot: string, rootKey: string): string {
  const rel = LOCALE_JSON_ROOTS[rootKey as LocaleRootId];
  if (!rel) throw new Error('İzin verilmeyen kök');
  if (path.isAbsolute(rel) || rel.split(/[/\\]/).includes('..')) {
    throw new Error('İzin verilmeyen kök');
  }
  return path.resolve(repoRoot, rel);
}

export function confineLocaleJson(repoRoot: string, rootKey: string, fileName: string): string {
  const safe = assertSafeLocaleRelative(fileName);
  const rootAbs = localeRootAbsolute(repoRoot, rootKey);
  if (!fs.existsSync(rootAbs) || !fs.statSync(rootAbs).isDirectory()) {
    throw new Error('Dil klasörü bulunamadı');
  }
  const rootReal = fs.realpathSync(rootAbs);
  const target = path.resolve(rootReal, safe);
  const rel = path.relative(rootReal, target);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error('Dil klasörü dışında yazılamaz');
  }
  const parent = path.dirname(target);
  if (!fs.existsSync(parent)) throw new Error('Dil klasörü bulunamadı');
  const parentReal = fs.realpathSync(parent);
  const relParent = path.relative(rootReal, parentReal);
  if (relParent.startsWith('..') || path.isAbsolute(relParent)) {
    throw new Error('Dil klasörü dışında yazılamaz');
  }
  let listed: fs.Stats | null = null;
  try {
    listed = fs.lstatSync(target);
  } catch {
    listed = null;
  }
  if (listed) {
    if (listed.isSymbolicLink() || !listed.isFile()) {
      throw new Error('Dil klasörü dışında yazılamaz');
    }
    const fileReal = fs.realpathSync(target);
    const relFile = path.relative(rootReal, fileReal);
    if (relFile.startsWith('..') || path.isAbsolute(relFile)) {
      throw new Error('Dil klasörü dışında yazılamaz');
    }
  }
  return target;
}

function languageToken(name: string): boolean {
  return /^[a-z]{2,3}(-[A-Za-z0-9]{2,12})?$/.test(name);
}

export function listLocaleJsonFiles(repoRoot: string): LocaleCatalog {
  const roots: LocaleCatalogRoot[] = [];
  for (const id of Object.keys(LOCALE_JSON_ROOTS) as LocaleRootId[]) {
    const relative = LOCALE_JSON_ROOTS[id];
    const abs = path.resolve(repoRoot, relative);
    if (!fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) {
      roots.push({ id, relative, files: [], missing: true });
      continue;
    }
    const files: LocaleCatalogFile[] = [];
    const names = fs.readdirSync(abs).sort((a, b) => a.localeCompare(b, 'tr'));
    for (const name of names) {
      if (name.includes('..') || name.includes('/') || name.includes('\\')) continue;
      const full = path.join(abs, name);
      let stat: fs.Stats;
      try {
        stat = fs.lstatSync(full);
      } catch {
        continue;
      }
      if (stat.isSymbolicLink()) continue;
      if (stat.isFile()) {
        try {
          assertSafeLocaleRelative(name);
        } catch {
          continue;
        }
        files.push({ file: name, language: localeFileLanguage(name) });
        continue;
      }
      if (!stat.isDirectory() || !languageToken(name)) continue;
      const nested = fs.readdirSync(full).sort((a, b) => a.localeCompare(b, 'tr'));
      for (const child of nested) {
        const childPath = path.join(full, child);
        let childStat: fs.Stats;
        try {
          childStat = fs.lstatSync(childPath);
        } catch {
          continue;
        }
        if (!childStat.isFile() || childStat.isSymbolicLink()) continue;
        const relFile = `${name}/${child}`;
        try {
          assertSafeLocaleRelative(relFile);
        } catch {
          continue;
        }
        files.push({ file: relFile, language: name });
      }
    }
    roots.push({ id, relative, files, missing: false });
  }
  return { roots, writable: roots.some((root) => !root.missing) };
}

export function readLocaleJsonFile(repoRoot: string, rootKey: string, fileName: string): string {
  const target = confineLocaleJson(repoRoot, rootKey, fileName);
  if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
    throw new Error('Dil dosyası bulunamadı');
  }
  return fs.readFileSync(target, 'utf8');
}

export function writeLocaleJsonFile(repoRoot: string, rootKey: string, fileName: string, text: string): void {
  if (typeof text !== 'string') throw new Error('Geçersiz JSON');
  let body = text;
  if (body.charCodeAt(0) === 0xfeff) body = body.slice(1);
  parseLocaleJson(body);
  if (!body.endsWith('\n')) body += '\n';
  const target = confineLocaleJson(repoRoot, rootKey, fileName);
  const buf = Buffer.from(body, 'utf8');
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    throw new Error('BOM yazılamaz');
  }
  fs.writeFileSync(target, buf);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function registerLocaleJsonRoutes(app: Hono, repoRoot: string) {
  app.get('/api/locale-files', (c) => c.json(listLocaleJsonFiles(repoRoot)));

  app.get('/api/locale-files/content', (c) => {
    try {
      const root = c.req.query('root') || '';
      const file = c.req.query('file') || '';
      const text = readLocaleJsonFile(repoRoot, root, file);
      return c.json({ root, file, text });
    } catch (error) {
      const message = errorMessage(error);
      const status = message === 'Dil dosyası bulunamadı' ? 404 : 400;
      return c.json({ error: message }, status);
    }
  });

  app.post('/api/locale-files/content', async (c) => {
    try {
      const body = await c.req.json();
      const root = typeof body?.root === 'string' ? body.root : '';
      const file = typeof body?.file === 'string' ? body.file : '';
      const text = typeof body?.text === 'string' ? body.text : '';
      writeLocaleJsonFile(repoRoot, root, file, text);
      return c.json({ ok: true, root, file });
    } catch (error) {
      return c.json({ error: errorMessage(error) }, 400);
    }
  });
}

export function createLocaleJsonApp(repoRoot: string) {
  const app = new Hono();
  registerLocaleJsonRoutes(app, repoRoot);
  return app;
}
