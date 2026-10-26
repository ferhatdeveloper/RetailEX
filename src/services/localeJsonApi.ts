/**
 * Dil JSON okuma/yazma: masaüstünde Tauri komutu, webde pg_bridge.
 * İkisi de yoksa düzenleme yerelde kalır ve JSON indirilir.
 */
import { getBridgeUrl, isTauriApp } from '../utils/env';

export interface LocaleFileInfo {
  root: string;
  file: string;
  language: string;
  relativePath: string;
}

export interface LocaleCatalogView {
  files: LocaleFileInfo[];
  writable: boolean;
  transport: 'tauri' | 'bridge' | 'local';
}

interface CatalogPayload {
  roots?: Array<{
    id?: string;
    relative?: string;
    missing?: boolean;
    files?: Array<{ file?: string; language?: string }>;
  }>;
  writable?: boolean;
}

function normalizeCatalog(payload: CatalogPayload, transport: 'tauri' | 'bridge'): LocaleCatalogView {
  const files: LocaleFileInfo[] = [];
  for (const root of payload.roots || []) {
    const rootId = String(root.id || '');
    const relative = String(root.relative || '').replace(/\/+$/, '');
    for (const file of root.files || []) {
      const name = String(file.file || '');
      if (!rootId || !name) continue;
      files.push({
        root: rootId,
        file: name,
        language: String(file.language || name.replace(/\.json$/, '')),
        relativePath: relative ? `${relative}/${name}` : name,
      });
    }
  }
  return {
    files,
    writable: payload.writable === true && files.length > 0,
    transport,
  };
}

async function tauriInvoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(command, args);
}

export async function loadLocaleCatalog(): Promise<LocaleCatalogView> {
  if (isTauriApp()) {
    try {
      const payload = await tauriInvoke<CatalogPayload>('list_locale_json_files');
      const view = normalizeCatalog(payload, 'tauri');
      if (view.writable || view.files.length > 0) return view;
    } catch {
      /* köprü dene */
    }
  }
  try {
    const response = await fetch(`${getBridgeUrl()}/api/locale-files`);
    if (!response.ok) throw new Error('liste alınamadı');
    const payload = (await response.json()) as CatalogPayload;
    return normalizeCatalog(payload, 'bridge');
  } catch {
    return { files: [], writable: false, transport: 'local' };
  }
}

export async function readLocaleFile(
  transport: LocaleCatalogView['transport'],
  root: string,
  file: string,
): Promise<string> {
  if (transport === 'tauri') {
    const payload = await tauriInvoke<{ text?: string }>('read_locale_json', { root, file });
    if (typeof payload?.text !== 'string') throw new Error('Dil dosyası okunamadı');
    return payload.text;
  }
  if (transport !== 'bridge') throw new Error('Dil dosyası okunamadı');
  const url = new URL(`${getBridgeUrl()}/api/locale-files/content`);
  url.searchParams.set('root', root);
  url.searchParams.set('file', file);
  const response = await fetch(url.toString());
  const body = (await response.json().catch(() => ({}))) as { text?: string; error?: string };
  if (!response.ok || typeof body.text !== 'string') {
    throw new Error(body.error || 'Dil dosyası okunamadı');
  }
  return body.text;
}

export async function writeLocaleFile(
  transport: LocaleCatalogView['transport'],
  root: string,
  file: string,
  text: string,
): Promise<void> {
  if (transport === 'local') throw new Error('Bu ortamda dosyaya yazılamadı');
  if (transport === 'tauri') {
    await tauriInvoke('write_locale_json', { root, file, text });
    return;
  }
  const response = await fetch(`${getBridgeUrl()}/api/locale-files/content`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ root, file, text }),
  });
  const body = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) throw new Error(body.error || 'Dil dosyası yazılamadı');
}

export function downloadLocaleJson(fileName: string, text: string) {
  const leaf = fileName.split('/').pop() || 'dil.json';
  const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = leaf;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
