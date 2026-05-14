import { IS_TAURI, getBridgeUrl, safeInvoke } from '../utils/env';
import { getPrimarySqlConnectionString } from './postgres';

export type PostgresFullBackupResult =
  | { ok: true; mode: 'tauri'; message: string }
  | { ok: true; mode: 'web'; fileName: string }
  | { ok: false; message: string };

/** Köprü çalışıyor mu (tarayıcı modunda). */
export async function checkPgBridgeReachable(): Promise<boolean> {
  if (IS_TAURI) return true;
  try {
    const res = await fetch(`${getBridgeUrl()}/api/status`, { method: 'GET' });
    if (!res.ok) return false;
    const j = (await res.json()) as { status?: string };
    return String(j?.status || '').toUpperCase() === 'RUNNING';
  } catch {
    return false;
  }
}

/**
 * Aktif SQL ucu için tam PostgreSQL yedeği (düz SQL, pg_dump -Fp).
 * — Tauri: yerel `export_full_postgres_dump` (diske yazar, tam yol döner).
 * — Web: pg_bridge `/api/pg_dump` (indirme); sunucuda `pg_dump` gerekir.
 */
export async function runPostgresFullBackup(): Promise<PostgresFullBackupResult> {
  if (IS_TAURI) {
    try {
      const message = await safeInvoke<string>('export_full_postgres_dump');
      return { ok: true, mode: 'tauri', message };
    } catch (e: unknown) {
      return { ok: false, message: (e as Error)?.message || String(e) };
    }
  }

  const connStr = getPrimarySqlConnectionString();
  const bridge = getBridgeUrl();
  const bridgeDumpToken =
    typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_PG_DUMP_TOKEN
      ? String((import.meta as any).env.VITE_PG_DUMP_TOKEN).trim()
      : '';
  let res: Response;
  try {
    res = await fetch(`${bridge}/api/pg_dump`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/sql, application/octet-stream, */*' },
      body: JSON.stringify({
        connStr,
        ...(bridgeDumpToken ? { token: bridgeDumpToken } : {}),
      }),
    });
  } catch (err: unknown) {
    return {
      ok: false,
      message:
        `Köprüye bağlanılamadı (${bridge}). ` +
        `Tarayıcıda tam yedek için pg_bridge çalışmalı ve sunucuda pg_dump kurulu olmalı. ` +
        String((err as Error)?.message || err),
    };
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    let detail = errText;
    try {
      const j = JSON.parse(errText) as { error?: string };
      if (j?.error) detail = j.error;
    } catch {
      /* metin olduğu gibi */
    }
    return { ok: false, message: detail || `HTTP ${res.status}` };
  }

  const cd = res.headers.get('Content-Disposition');
  let fileName = `retailex_pg_full_${Date.now()}.sql`;
  const m = cd && /filename\*?=(?:UTF-8''|")?([^";\n]+)/i.exec(cd);
  if (m?.[1]) {
    try {
      fileName = decodeURIComponent(m[1].replace(/"/g, '').trim());
    } catch {
      fileName = m[1].replace(/"/g, '').trim() || fileName;
    }
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    URL.revokeObjectURL(url);
  }

  return { ok: true, mode: 'web', fileName };
}
