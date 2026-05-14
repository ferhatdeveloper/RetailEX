import { IS_TAURI, getBridgeUrl, safeInvoke } from '../utils/env';
import {
  getPrimarySqlConnectionString,
  getPrimaryDatabaseName,
  shouldPreferBridgeInternalPgDump,
} from './postgres';

export type PostgresFullBackupResult =
  | { ok: true; mode: 'tauri'; message: string }
  | { ok: true; mode: 'web'; fileName: string }
  | { ok: false; message: string };

/** Terminal günlüğü satırı (UI tarafında zaman damgası eklenebilir). */
export type PostgresBackupLogFn = (line: string) => void;

function redactConnStr(connStr: string): string {
  try {
    const u = new URL(connStr);
    if (u.password) u.password = '***';
    return u.href;
  } catch {
    return '(bağlantı özeti okunamadı)';
  }
}

function vitePgDumpInternalMode(): string {
  return typeof import.meta !== 'undefined'
    ? String((import.meta as any).env?.VITE_PG_DUMP_INTERNAL || '').trim()
    : '';
}

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

async function consumeSqlDumpResponse(res: Response, log: PostgresBackupLogFn): Promise<PostgresFullBackupResult> {
  log(`[HTTP] ${res.status} ${res.statusText || ''}`.trim());
  const ct = res.headers.get('Content-Type');
  if (ct) log(`      Content-Type: ${ct}`);

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    let detail = errText;
    try {
      const j = JSON.parse(errText) as { error?: string };
      if (j?.error) detail = j.error;
    } catch {
      /* metin */
    }
    log(`HATA: ${detail || `HTTP ${res.status}`}`);
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

  log('Yanıt gövdesi okunuyor (blob)…');
  const blob = await res.blob();
  const kb = blob.size / 1024;
  log(`Boyut: ${kb < 1024 ? `${kb.toFixed(1)} KiB` : `${(kb / 1024).toFixed(2)} MiB`}`);
  log(`İndirme: ${fileName}`);

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

  log('Bitti: tarayıcı indirmeyi tetikledi.');
  return { ok: true, mode: 'web', fileName };
}

/**
 * Aktif SQL ucu için tam PostgreSQL yedeği (düz SQL, pg_dump -Fp).
 * — Tauri: yerel `export_full_postgres_dump` (diske yazar, tam yol döner).
 * — Web: pg_bridge `/api/pg_dump_internal` (PostgREST ile aynı iç PG) veya `/api/pg_dump` (connStr).
 */
export async function runPostgresFullBackup(onLog?: PostgresBackupLogFn): Promise<PostgresFullBackupResult> {
  const log = (s: string) => {
    onLog?.(s);
  };

  if (IS_TAURI) {
    try {
      log('[1/2] Masaüstü (Tauri): export_full_postgres_dump çağrılıyor…');
      log('[1/2] Not: pg_dump süresi veritabanı boyutuna bağlıdır; arayüz bu adımda bekler.');
      const message = await safeInvoke<string>('export_full_postgres_dump');
      log('[2/2] pg_dump tamamlandı.');
      log(message);
      return { ok: true, mode: 'tauri', message };
    } catch (e: unknown) {
      const msg = (e as Error)?.message || String(e);
      log(`HATA: ${msg}`);
      return { ok: false, message: msg };
    }
  }

  const bridge = getBridgeUrl();
  const bridgeDumpToken =
    typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_PG_DUMP_TOKEN
      ? String((import.meta as any).env.VITE_PG_DUMP_TOKEN).trim()
      : '';

  const internalMode = vitePgDumpInternalMode();
  const preferInternal = shouldPreferBridgeInternalPgDump();

  log(`[1] Köprü: ${bridge}`);
  if (bridgeDumpToken) {
    log('     İstek: VITE_PG_DUMP_TOKEN ile body.token (PG_DUMP_TOKEN koruması).');
  } else {
    log('     Uyarı: PG_DUMP_TOKEN tanımlı değilse köprü uçları korumasız olabilir.');
  }

  const tryInternal = preferInternal || internalMode === '1';
  const connStr = getPrimarySqlConnectionString();
  const dbName = getPrimaryDatabaseName();

  if (tryInternal) {
    log('[2] Yol: köprü iç pg_dump — PostgREST (PGRST) ile aynı PostgreSQL örneği (docker ağı, TLS değil).');
    log(`     Veritabanı: ${dbName}`);
    let ir: Response | undefined;
    try {
      log('[3] POST /api/pg_dump_internal …');
      ir = await fetch(`${bridge}/api/pg_dump_internal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/sql, application/octet-stream, */*' },
        body: JSON.stringify({
          database: dbName,
          ...(bridgeDumpToken ? { token: bridgeDumpToken } : {}),
        }),
      });
    } catch (err: unknown) {
      const msg = `Köprüye bağlanılamadı (${bridge}). ${String((err as Error)?.message || err)}`;
      log(`HATA: ${msg}`);
      if (internalMode === '1') {
        return { ok: false, message: msg };
      }
      log('[Yedek] İç yol ağ hatası — harici connStr denemesine geçiliyor…');
    }

    if (ir && ir.ok) {
      return consumeSqlDumpResponse(ir, log);
    }

    if (ir && !ir.ok) {
      const errBody = await ir.text().catch(() => '');
      log(`     İç yol yanıtı: ${ir.status} ${errBody.slice(0, 500)}`);
      if (internalMode === '1') {
        let msg = errBody;
        try {
          const j = JSON.parse(errBody) as { error?: string };
          if (j?.error) msg = j.error;
        } catch {
          /* */
        }
        return { ok: false, message: msg || 'İç pg_dump başarısız (VITE_PG_DUMP_INTERNAL=1).' };
      }
    }

    log('[Yedek] İç yol başarısız veya kapalı — harici connStr ile /api/pg_dump deneniyor…');
    log('     Not: api.*:443 üzerinden PostgreSQL kablo protokolü genelde çalışmaz.');
  } else {
    log('[2] Yol: tarayıcıdaki SQL bağlantı dizesi (köprüye iletilir).');
  }

  log(`     Hedef (gizli): ${redactConnStr(connStr)}`);
  log('[3] POST /api/pg_dump …');

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
    const msg =
      `Köprüye bağlanılamadı (${bridge}). ` +
      `Tarayıcıda tam yedek için pg_bridge çalışmalı ve sunucuda pg_dump kurulu olmalı. ` +
      String((err as Error)?.message || err);
    log(`HATA: ${msg}`);
    return { ok: false, message: msg };
  }

  return consumeSqlDumpResponse(res, log);
}
