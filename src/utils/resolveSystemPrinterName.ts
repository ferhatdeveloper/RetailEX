/**
 * Sistem yazıcısı adı: canlı tarama + önceki taramalar.
 * USB yeniden takılınca "EPSON TM-T20 (kopya 1)" gibi ad sapmalarında eşleştirir.
 */

const SCAN_STORAGE_KEY = 'retailex_system_printers_scan';
const MAX_CACHED_NAMES = 80;

type ScanCache = { at: number; names: string[] };

function normPrinterKey(s: string): string {
  return String(s || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('tr-TR');
}

/** Windows " (Copy 1)" / " (kopya 2)" / " (2)" sonekini düşür. */
export function printerBaseName(s: string): string {
  let k = normPrinterKey(s);
  k = k.replace(/\s*\((?:copy|kopya|kopyası|kopyasi|copia)\s*\d+\)\s*$/i, '').trim();
  k = k.replace(/\s*\(\d+\)\s*$/, '').trim();
  return k;
}

export function extractSystemPrinterNames(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const row of raw) {
    if (typeof row === 'string' && row.trim()) {
      out.push(row.trim());
      continue;
    }
    if (row && typeof row === 'object') {
      const o = row as Record<string, unknown>;
      const n = o.Name ?? o.name ?? o.printerName ?? o.systemName;
      if (typeof n === 'string' && n.trim()) out.push(n.trim());
    }
  }
  return [...new Set(out)];
}

export function cacheSystemPrinterScan(raw: unknown): string[] {
  const names = extractSystemPrinterNames(raw);
  if (names.length === 0 || typeof localStorage === 'undefined') return names;
  try {
    let prev: string[] = [];
    const existing = localStorage.getItem(SCAN_STORAGE_KEY);
    if (existing) {
      const parsed = JSON.parse(existing) as ScanCache;
      if (Array.isArray(parsed?.names)) prev = parsed.names.filter((n) => typeof n === 'string' && n.trim());
    }
    const merged = [...names, ...prev.filter((p) => !names.some((n) => normPrinterKey(n) === normPrinterKey(p)))];
    const cache: ScanCache = { at: Date.now(), names: merged.slice(0, MAX_CACHED_NAMES) };
    localStorage.setItem(SCAN_STORAGE_KEY, JSON.stringify(cache));
  } catch {
    /* ignore */
  }
  return names;
}

export function getCachedSystemPrinterScanNames(): string[] {
  try {
    const raw = localStorage.getItem(SCAN_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ScanCache;
    return Array.isArray(parsed?.names) ? parsed.names.filter((n) => typeof n === 'string' && n.trim()) : [];
  } catch {
    return [];
  }
}

/** İstenen adı aday listesinde tam / büyük-küçük / kopya soneki / içerme ile bul. */
export function matchPrinterNameAmong(wanted: string, candidates: string[]): string | null {
  const w = wanted.trim();
  if (!w || candidates.length === 0) return null;
  const wn = normPrinterKey(w);
  const wb = printerBaseName(w);
  const exact = candidates.find((c) => c === w);
  if (exact) return exact;
  const ci = candidates.find((c) => normPrinterKey(c) === wn);
  if (ci) return ci;
  if (wb.length >= 4) {
    const base = candidates.find((c) => printerBaseName(c) === wb);
    if (base) return base;
  }
  const contained = candidates.find((c) => {
    const cn = normPrinterKey(c);
    const cb = printerBaseName(c);
    if (wn.length >= 5 && (cn.includes(wn) || wn.includes(cn))) return true;
    if (wb.length >= 5 && (cb.includes(wb) || wb.includes(cb))) return true;
    return false;
  });
  return contained ?? null;
}

async function listLiveSystemPrinters(): Promise<string[]> {
  try {
    const { IS_TAURI } = await import('./env');
    if (!IS_TAURI) return [];
    const { invoke } = await import('@tauri-apps/api/core');
    const list = await invoke<unknown>('list_system_printers');
    return cacheSystemPrinterScan(list);
  } catch {
    return [];
  }
}

async function collectKnownPrinterNames(): Promise<string[]> {
  const extra: string[] = [];
  try {
    const { getStoredWindowsPrinterNameForPrint } = await import('./tauriPrintSettings');
    const n = getStoredWindowsPrinterNameForPrint();
    if (n?.trim()) extra.push(n.trim());
  } catch {
    /* ignore */
  }
  try {
    const { useRestaurantStore } = await import('../components/restaurant/store/useRestaurantStore');
    for (const p of useRestaurantStore.getState().printerProfiles || []) {
      if (typeof p?.systemName === 'string' && p.systemName.trim()) extra.push(p.systemName.trim());
    }
  } catch {
    /* ignore */
  }
  return extra;
}

/**
 * Kayıtlı yazıcı adını canlı tarama + önceki taramalarla çöz.
 * Eşleşme yoksa orijinal adı döner (OS hâlâ tanıyor olabilir).
 */
export async function resolveSystemPrinterName(
  wanted: string | null | undefined,
  extraCandidates: string[] = [],
): Promise<string | null> {
  const raw = typeof wanted === 'string' ? wanted.trim() : '';
  if (!raw) return null;
  const live = await listLiveSystemPrinters();
  const cached = getCachedSystemPrinterScanNames();
  const known = await collectKnownPrinterNames();
  const extra = extraCandidates.filter((n) => typeof n === 'string' && n.trim());
  const candidates = [...new Set([...live, ...cached, ...known, ...extra])];
  return matchPrinterNameAmong(raw, candidates) ?? raw;
}
