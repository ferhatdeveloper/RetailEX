/**
 * e-Fatura / e-Arşiv (GİB) — bölge ve test ortamı yapılandırması.
 * Öncelik: PostgreSQL `firms.regulatory_region` (aktif ERP_SETTINGS.firmNr) → Tauri AppConfig → VITE_
 */

import { IS_TAURI, safeInvoke } from '../utils/env';

export type RegulatoryRegion = 'TR' | 'IQ';

/** GİB’e gerçek istek: yalnızca entegratör veya doğrudan SOAP tamamlanınca */
export type GibClientMode = 'mock' | 'unconfigured_http';

export interface EInvoiceResolvedConfig {
  regulatoryRegion: RegulatoryRegion;
  /** TR: e-dönüşüm modülleri ve servisleri kullanılabilir */
  eInvoiceFeaturesEnabled: boolean;
  /** Fatura XML para birimi (UBL) */
  documentCurrency: string;
  /** mock: gecikmeli sahte yanıt; unconfigured_http: üretim uçları henüz yok uyarısı */
  gibClientMode: GibClientMode;
  /** İnsan okunur etiket (UI banner) */
  environmentLabel: string;
  /** Ayarın kaynağı (debug) */
  source: 'database' | 'tauri' | 'env';
}

function parseRegion(raw: string | undefined): RegulatoryRegion {
  const u = String(raw ?? '')
    .trim()
    .toUpperCase();
  if (u === 'TR' || u === 'TURKEY' || u === 'TURKIYE') return 'TR';
  return 'IQ';
}

function parseMockTransport(raw: string | undefined): boolean {
  if (raw === undefined || raw === '') return true;
  const v = String(raw).trim().toLowerCase();
  return v !== 'false' && v !== '0' && v !== 'no';
}

function buildResolved(
  regulatoryRegion: RegulatoryRegion,
  gibClientMode: GibClientMode,
  source: EInvoiceResolvedConfig['source']
): EInvoiceResolvedConfig {
  const eInvoiceFeaturesEnabled = regulatoryRegion === 'TR';
  const documentCurrency = regulatoryRegion === 'TR' ? 'TRY' : 'IQD';
  const environmentLabel =
    regulatoryRegion === 'TR'
      ? gibClientMode === 'mock'
        ? 'TR · GİB mock (test)'
        : 'TR · GİB HTTP iskelet (henüz üretim değil)'
      : 'IQ · e-Fatura kapalı';

  return {
    regulatoryRegion,
    eInvoiceFeaturesEnabled,
    documentCurrency,
    gibClientMode,
    environmentLabel,
    source,
  };
}

/**
 * Senkron: yalnızca import.meta.env (Vite); tam çözümleme için `getEInvoiceResolvedConfig` kullanın.
 */
export function getEInvoiceEnvConfig(): EInvoiceResolvedConfig {
  const regulatoryRegion = parseRegion(import.meta.env.VITE_REGULATORY_REGION);
  const gibUseMockTransport = parseMockTransport(import.meta.env.VITE_GIB_MOCK_TRANSPORT);
  const gibClientMode: GibClientMode = gibUseMockTransport ? 'mock' : 'unconfigured_http';
  return buildResolved(regulatoryRegion, gibClientMode, 'env');
}

async function tryRegulatoryRegionFromDatabase(): Promise<{ region: RegulatoryRegion } | null> {
  try {
    const { ERP_SETTINGS } = await import('../services/postgres');
    const { organizationAPI } = await import('../services/api/organization');
    const firmNr = ERP_SETTINGS?.firmNr;
    if (!firmNr) return null;
    const r = await organizationAPI.getRegulatoryRegionForFirmNr(firmNr);
    if (r == null) return null;
    return { region: r };
  } catch {
    return null;
  }
}

async function tryRegulatoryRegionFromTauri(): Promise<{ region: RegulatoryRegion } | null> {
  if (!IS_TAURI) return null;
  try {
    const ac = await safeInvoke<{ regulatory_region?: string } | Record<string, unknown>>(
      'get_app_config',
      undefined,
      {}
    );
    const raw = ac && typeof ac === 'object' ? (ac as any).regulatory_region : undefined;
    if (raw === undefined || raw === null || String(raw).trim() === '') return null;
    return { region: parseRegion(String(raw)) };
  } catch {
    return null;
  }
}

/**
 * Birleşik çözümleme: **firms (PG)** → Tauri config → **VITE_REGULATORY_REGION**.
 * Mock bayrağı yalnızca `VITE_GIB_MOCK_TRANSPORT` (test).
 */
export async function getEInvoiceResolvedConfig(): Promise<EInvoiceResolvedConfig> {
  const gibUseMockTransport = parseMockTransport(import.meta.env.VITE_GIB_MOCK_TRANSPORT);
  const gibClientMode: GibClientMode = gibUseMockTransport ? 'mock' : 'unconfigured_http';

  const envFallback = parseRegion(import.meta.env.VITE_REGULATORY_REGION);

  const fromDb = await tryRegulatoryRegionFromDatabase();
  if (fromDb) {
    return buildResolved(fromDb.region, gibClientMode, 'database');
  }

  const fromTauri = await tryRegulatoryRegionFromTauri();
  if (fromTauri) {
    return buildResolved(fromTauri.region, gibClientMode, 'tauri');
  }

  return buildResolved(envFallback, gibClientMode, 'env');
}
