import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createLocaleJsonApp, writeLocaleJsonFile } from '../../services/localeJsonBridge';

const temps: string[] = [];

function makeRepo() {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'rex-locale-'));
  temps.push(repo);
  const dir = path.join(repo, 'mobile', 'src', 'i18n', 'locales');
  fs.mkdirSync(dir, { recursive: true });
  return { repo, dir };
}

afterEach(() => {
  while (temps.length) {
    const dir = temps.pop();
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  }
});

const TR = `{
  "menu": {
    "cash": { "title": "Kasa", "hint": "İpucu" },
    "stock": { "title": "Stok" }
  },
  "note": "Çğüşöı İade Şube"
}
`;

describe('dil dosyası yazma ucu', () => {
  it('seçilen dosyayı yazar, kardeş dosya durur, Türkçe korunur', async () => {
    const { repo, dir } = makeRepo();
    fs.writeFileSync(path.join(dir, 'tr.json'), TR, 'utf8');
    fs.writeFileSync(path.join(dir, 'en.json'), '{\n  "title": "Cash"\n}\n', 'utf8');
    const app = createLocaleJsonApp(repo);
    const next = TR.replace('"Kasa"', '"Kasa adı"');
    const response = await app.request('/api/locale-files/content', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ root: 'mobile-i18n', file: 'tr.json', text: next }),
    });
    expect(response.status).toBe(200);
    const written = fs.readFileSync(path.join(dir, 'tr.json'));
    expect(written.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]))).toBe(false);
    const parsed = JSON.parse(written.toString('utf8'));
    expect(parsed.menu.cash).toEqual({ title: 'Kasa adı', hint: 'İpucu' });
    expect(parsed.menu.stock.title).toBe('Stok');
    expect(parsed.note).toBe('Çğüşöı İade Şube');
    expect(fs.readFileSync(path.join(dir, 'en.json'), 'utf8')).toContain('"Cash"');
  });

  it('geçersiz JSON dosyayı değiştirmez', async () => {
    const { repo, dir } = makeRepo();
    fs.writeFileSync(path.join(dir, 'tr.json'), TR, 'utf8');
    const app = createLocaleJsonApp(repo);
    const response = await app.request('/api/locale-files/content', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ root: 'mobile-i18n', file: 'tr.json', text: '{kapali' }),
    });
    expect(response.status).toBe(400);
    expect(fs.readFileSync(path.join(dir, 'tr.json'), 'utf8')).toBe(TR);
  });

  it('üst klasöre, mutlak yola ve bağlantı yoluyla yazmaz', async () => {
    const { repo, dir } = makeRepo();
    fs.writeFileSync(path.join(dir, 'tr.json'), TR, 'utf8');
    const outside = path.join(os.tmpdir(), `rex-secret-${Date.now()}.txt`);
    temps.push(outside);
    fs.writeFileSync(outside, 'gizli', 'utf8');
    fs.symlinkSync(outside, path.join(dir, 'en.json'));
    const danglingTarget = path.join(os.tmpdir(), `rex-dangling-${Date.now()}.txt`);
    const danglingLink = path.join(dir, 'ar.json');
    fs.symlinkSync(danglingTarget, danglingLink);
    const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rex-out-'));
    temps.push(outsideDir);
    fs.symlinkSync(outsideDir, path.join(dir, 'ku'));
    const app = createLocaleJsonApp(repo);

    for (const file of ['../secret.json', '/etc/passwd', 'C:/Windows/tr.json', 'tr/../../en.json', '.env', 'config.json']) {
      const response = await app.request('/api/locale-files/content', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ root: 'mobile-i18n', file, text: '{}\n' }),
      });
      expect(response.status, file).toBe(400);
    }

    const viaLink = await app.request('/api/locale-files/content', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ root: 'mobile-i18n', file: 'en.json', text: '{ "a": "yok" }\n' }),
    });
    expect(viaLink.status).toBe(400);
    expect(fs.readFileSync(outside, 'utf8')).toBe('gizli');
    const danglingWrite = await app.request('/api/locale-files/content', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ root: 'mobile-i18n', file: 'ar.json', text: '{ "a": "yok" }\n' }),
    });
    expect(danglingWrite.status).toBe(400);
    expect(fs.existsSync(danglingTarget)).toBe(false);
    expect(fs.lstatSync(danglingLink).isSymbolicLink()).toBe(true);

    const viaDir = await app.request('/api/locale-files/content', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ root: 'mobile-i18n', file: 'ku/common.json', text: '{ "a": "yok" }\n' }),
    });
    expect(viaDir.status).toBe(400);
    expect(fs.readdirSync(outsideDir)).toEqual([]);

    expect(() => writeLocaleJsonFile(repo, 'mobile-i18n', 'en.json', '{}\n')).toThrow(/dışında/);
  });
});
