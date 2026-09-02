/**
 * Windows print service taşıyıcısı — PC'de çalışan print servisine HTTP üzerinden
 * ESC/POS baytı gönderir (PrintServer / `print-server.example.json` ile uyumlu).
 *
 * Akış: mobil → fetch POST {baseUrl}/print (JSON: printerName, jobName,
 * dataBase64, copies) → Windows servisi → yazıcı.
 */

import { uint8ToBase64 } from './escposBytes';

export type WindowsServiceErrorCode =
  | 'unreachable'
  | 'printerNotFound'
  | 'serviceError'
  | 'unauthorized'
  | 'timeout'
  | 'invalidUrl'
  | 'cancelled';

export type WindowsServiceSendResult = {
  ok: boolean;
  message: string;
  jobId?: string;
  transport: 'windows-service';
  bytesSent?: number;
  code?: WindowsServiceErrorCode;
};

export type WindowsPrinterInfo = {
  name: string;
  isDefault?: boolean;
  port?: string | null;
  status?: 'ready' | 'offline' | 'error' | 'unknown';
};

export type WindowsServicePrinterListResult = {
  ok: boolean;
  printers: WindowsPrinterInfo[];
  message?: string;
};

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_LIST_TIMEOUT_MS = 5_000;

function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

function isAbortError(e: unknown): boolean {
  return e instanceof Error && (e.name === 'AbortError' || /abort/i.test(e.message));
}

function looksLikeTimeout(err: unknown, timedOut: boolean): boolean {
  if (timedOut) return true;
  if (!(err instanceof Error)) return false;
  return /timeout|timed out|network timeout/i.test(err.message);
}

function tryParseUrl(raw: string): URL | null {
  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

async function jsonFetch<T>(
  input: string,
  init: { method: string; headers: Record<string, string>; body?: string; signal: AbortSignal },
): Promise<{ ok: boolean; status: number; data: T | null; text: string }> {
  const res = await fetch(input, init as RequestInit);
  const text = await res.text();
  let data: T | null = null;
  if (text) {
    try {
      data = JSON.parse(text) as T;
    } catch {
      data = null;
    }
  }
  return { ok: res.ok, status: res.status, data, text };
}

/**
 * Ham ESC/POS baytını Windows print servisine gönderir.
 * Yanıt JSON: `{ ok, message, jobId?, bytesSent? }`. Hata durumunda ilgili kod.
 */
export async function sendEscposToWindowsService(
  baseUrl: string,
  apiKey: string | undefined,
  printerName: string,
  payload: Uint8Array,
  jobName: string,
  options?: { signal?: AbortSignal; copies?: number; timeoutMs?: number },
): Promise<WindowsServiceSendResult> {
  const trimmedBase = trimTrailingSlash(baseUrl.trim());
  const url = tryParseUrl(trimmedBase);
  if (!url || !/^https?:$/.test(url.protocol)) {
    return {
      ok: false,
      code: 'invalidUrl',
      transport: 'windows-service',
      message: 'Geçersiz servis URL. Örn: http://192.168.1.50:9105',
    };
  }

  const trimmedPrinter = printerName.trim();
  if (!trimmedPrinter) {
    return {
      ok: false,
      code: 'printerNotFound',
      transport: 'windows-service',
      message: 'Yazıcı adı boş olamaz.',
    };
  }

  const endpoint = `${trimmedBase}/print`;
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  if (options?.signal) {
    if (options.signal.aborted) controller.abort();
    else options.signal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey && apiKey.trim()) headers.Authorization = `Bearer ${apiKey.trim()}`;

  const body = JSON.stringify({
    printerName: trimmedPrinter,
    jobName,
    dataBase64: uint8ToBase64(payload),
    copies: options?.copies ?? 1,
  });

  try {
    const { ok, status, data, text } = await jsonFetch<{
      ok?: boolean;
      message?: string;
      jobId?: string;
      bytesSent?: number;
    }>(endpoint, {
      method: 'POST',
      headers,
      body,
      signal: controller.signal,
    });

    if (ok && data?.ok !== false) {
      return {
        ok: true,
        transport: 'windows-service',
        message: data?.message ?? 'Yazdırma kuyruğa alındı.',
        jobId: data?.jobId,
        bytesSent: data?.bytesSent ?? payload.byteLength,
      };
    }

    const message = data?.message ?? text ?? `HTTP ${status}`;
    if (status === 401 || status === 403) {
      return { ok: false, code: 'unauthorized', transport: 'windows-service', message };
    }
    if (status === 404) {
      return {
        ok: false,
        code: 'printerNotFound',
        transport: 'windows-service',
        message: `Yazıcı serviste bulunamadı: ${trimmedPrinter}`,
      };
    }
    if (status >= 500) {
      return { ok: false, code: 'serviceError', transport: 'windows-service', message };
    }
    return { ok: false, code: 'serviceError', transport: 'windows-service', message };
  } catch (e) {
    const cancelled = options?.signal?.aborted === true;
    if (cancelled || isAbortError(e)) {
      return {
        ok: false,
        code: cancelled ? 'cancelled' : 'unreachable',
        transport: 'windows-service',
        message: cancelled ? 'İstek iptal edildi.' : 'Windows servisine ulaşılamadı.',
      };
    }
    if (looksLikeTimeout(e, false)) {
      return {
        ok: false,
        code: 'timeout',
        transport: 'windows-service',
        message: 'Windows servisi zaman aşımı.',
      };
    }
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      code: 'unreachable',
      transport: 'windows-service',
      message: `Windows servisi yanıt vermedi: ${msg}`,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Windows servisinden yazıcı listesi alır (GET {baseUrl}/printers).
 * Yanıt: `Array<WindowsPrinterInfo>` veya `{ printers: [...] }`.
 */
export async function listWindowsServicePrinters(
  baseUrl: string,
  apiKey: string | undefined,
  options?: { signal?: AbortSignal; timeoutMs?: number },
): Promise<WindowsServicePrinterListResult> {
  const trimmedBase = trimTrailingSlash(baseUrl.trim());
  const url = tryParseUrl(trimmedBase);
  if (!url || !/^https?:$/.test(url.protocol)) {
    return { ok: false, printers: [], message: 'Geçersiz servis URL.' };
  }

  const endpoint = `${trimmedBase}/printers`;
  const timeoutMs = options?.timeoutMs ?? DEFAULT_LIST_TIMEOUT_MS;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  if (options?.signal) {
    if (options.signal.aborted) controller.abort();
    else options.signal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (apiKey && apiKey.trim()) headers.Authorization = `Bearer ${apiKey.trim()}`;

  try {
    const { ok, status, data, text } = await jsonFetch<
      | WindowsPrinterInfo[]
      | { printers: WindowsPrinterInfo[]; message?: string }
    >(endpoint, {
      method: 'GET',
      headers,
      signal: controller.signal,
    });

    if (!ok) {
      const message =
        (data && 'message' in data && data.message) ||
        text ||
        `HTTP ${status}`;
      return { ok: false, printers: [], message };
    }

    if (Array.isArray(data)) {
      return { ok: true, printers: data };
    }
    if (data && Array.isArray(data.printers)) {
      return { ok: true, printers: data.printers, message: data.message };
    }
    return { ok: false, printers: [], message: 'Beklenmeyen yanıt formatı.' };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      printers: [],
      message: msg || 'Servis yanıt vermedi.',
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Taşıyıcı özet durumu. Service canlı ping'i yapılmaz; sadece HTTP
 * taşıyıcısının varlığı ve kullanım önerisi döner.
 */
export function windowsServiceTransportStatus(): {
  reachable: 'unknown';
  hint: string;
} {
  return {
    reachable: 'unknown',
    hint:
      "Windows print service: HTTP üzerinden PC'deki servise yazdırma. " +
      "Servis kurulu değilse 'Ağ yazıcısı' kullanın.",
  };
}
