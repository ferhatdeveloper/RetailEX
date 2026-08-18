/**
 * RetailEX — Ortak rapor / liste filter altyapısı.
 *
 * Tüm raporlar (60+ tab), cari listeleri, ürün listeleri, personel listeleri
 * ve yeni ERP raporları için tek tip filter config + hook.
 *
 *  - `ReportFilterConfig` → toolbar'a verilen alan tanımları
 *  - `useFilterState`     → state + localStorage senkronu + reset/isActive
 *
 * Kalıp: `SurveyReportToolbar` (güzellik) ve `CommissionReport` ile aynı zihniyette —
 * default değerler tip-tabanlı, persistence opsiyonel, koşullu görünür alanlar desteklenir.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/* -------------------------------------------------------------------------- */
/* Tipler                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Desteklenen filter alanı türleri.
 *
 *  - `dateRange`     → { from, to } (YYYY-MM-DD)
 *  - `date`          → tek gün (YYYY-MM-DD)
 *  - `select`        → tek seçim
 *  - `multiSelect`   → çoklu seçim
 *  - `range`         → { min, max } sayısal aralık
 *  - `text`          → serbest metin araması
 *  - `cariSelect`    → cari (müşteri/tedarikçi) seçimi (multi, ileride bağlanacak)
 *  - `productSelect` → ürün seçimi (multi, ileride bağlanacak)
 *  - `staffSelect`   → personel/uzman seçimi (multi, ileride bağlanacak)
 *  - `checkbox`      → boolean
 */
export type FilterFieldType =
  | 'dateRange'
  | 'date'
  | 'select'
  | 'multiSelect'
  | 'range'
  | 'text'
  | 'cariSelect'
  | 'productSelect'
  | 'staffSelect'
  | 'checkbox';

/** Tek bir select / multiSelect seçeneği */
export interface FilterOption {
  value: string;
  label: string;
}

/** Tek bir filter alanı tanımı */
export interface ReportFilterField {
  /** State'teki alan anahtarı (benzersiz) */
  key: string;
  /** i18n label anahtarı — `tm('key')` ile çözümlenir */
  labelKey: string;
  /** Alan tipi (yukarıya bak) */
  type: FilterFieldType;
  /** select / multiSelect için statik seçenekler */
  options?: FilterOption[];
  /** İleride dinamik yükleme için (örn. cari / ürün endpoint) */
  endpoint?: string;
  /** Placeholder (i18n key veya ham metin) */
  placeholder?: string;
  /** Default değer (yoksa tip-tabanlı üretilir) */
  defaultValue?: unknown;
  /** range.min / range.max başlangıç değeri (default üretiminde kullanılır) */
  min?: number;
  max?: number;
  /** Tailwind class e.g. 'w-48' (toolbar layout kontrolü) */
  width?: string;
  /** Koşullu görünür — diğer filtre değerlerine bağlı */
  visible?: (filters: Record<string, unknown>) => boolean;
}

/** Filter konfigürasyonu */
export interface ReportFilterConfig {
  fields: ReportFilterField[];
  /** localStorage anahtarı — verilirse otomatik persist edilir */
  storageKey?: string;
}

/** Runtime filter state — anahtarlar ReportFilterField.key */
export type ReportFilterState = Record<string, unknown>;

/* -------------------------------------------------------------------------- */
/* Default üretimi                                                             */
/* -------------------------------------------------------------------------- */

/** Bir alan için default değer üret — verilmediyse tip-tabanlı */
export function getDefaultValueForField(field: ReportFilterField): unknown {
  if (field.defaultValue !== undefined) return field.defaultValue;
  switch (field.type) {
    case 'dateRange':
      return { from: '', to: '' };
    case 'date':
      return '';
    case 'select':
      return '';
    case 'multiSelect':
    case 'cariSelect':
    case 'productSelect':
    case 'staffSelect':
      return [] as string[];
    case 'range':
      return { min: field.min ?? null, max: field.max ?? null };
    case 'text':
      return '';
    case 'checkbox':
      return false;
    default:
      return null;
  }
}

/** Tüm alanlar için default map */
export function buildInitialDefaults(config: ReportFilterConfig): ReportFilterState {
  const out: ReportFilterState = {};
  for (const f of config.fields) out[f.key] = getDefaultValueForField(f);
  return out;
}

/* -------------------------------------------------------------------------- */
/* Derin karşılaştırma (default ↔ current)                                     */
/* -------------------------------------------------------------------------- */

function isObject(v: unknown): v is Record<string, unknown> {
  return v != null && typeof v === 'object' && !Array.isArray(v);
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!deepEqual(a[i], b[i])) return false;
    return true;
  }
  if (isObject(a) && isObject(b)) {
    const ka = Object.keys(a);
    const kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    for (const k of ka) if (!deepEqual(a[k], (b as Record<string, unknown>)[k])) return false;
    return true;
  }
  return false;
}

/* -------------------------------------------------------------------------- */
/* useFilterState hook                                                          */
/* -------------------------------------------------------------------------- */

export interface UseFilterStateApi {
  /** Mevcut filter state */
  filters: ReportFilterState;
  /** Tek alan güncelle */
  set: (key: string, value: unknown) => void;
  /** Toplu patch */
  setMany: (patch: Record<string, unknown>) => void;
  /** Default değerlere dön */
  reset: () => void;
  /** Herhangi bir alan default'tan farklı mı */
  isActive: () => boolean;
  /** Default map (salt okunur) */
  defaults: ReportFilterState;
}

/**
 * Filter state yönetimi + opsiyonel localStorage senkronu.
 *
 * @example
 *   const { filters, set, reset, isActive } = useFilterState({
 *     storageKey: 'report.commission.v1',
 *     fields: [
 *       { key: 'period', labelKey: 'bDateRange', type: 'dateRange' },
 *       { key: 'staff',  labelKey: 'bStaff',     type: 'staffSelect' },
 *     ],
 *   });
 */
export function useFilterState(config: ReportFilterConfig): UseFilterStateApi {
  const initial = useMemo(() => buildInitialDefaults(config), [config]);
  const [filters, setFilters] = useState<ReportFilterState>(() => {
    if (!config.storageKey || typeof window === 'undefined') return initial;
    try {
      const raw = window.localStorage.getItem(config.storageKey);
      if (!raw) return initial;
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      // Sadece tanımlı alanları kabul et, geri kalanını default'a düşür
      const merged: ReportFilterState = { ...initial };
      for (const f of config.fields) {
        if (Object.prototype.hasOwnProperty.call(parsed, f.key)) {
          merged[f.key] = parsed[f.key];
        }
      }
      return merged;
    } catch {
      return initial;
    }
  });

  // İlk mount'ta defaults referansı
  const defaultsRef = useRef<ReportFilterState>(initial);
  useEffect(() => {
    defaultsRef.current = initial;
  }, [initial]);

  // localStorage sync
  useEffect(() => {
    if (!config.storageKey || typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(config.storageKey, JSON.stringify(filters));
    } catch {
      // quota veya private mode — yoksay
    }
  }, [filters, config.storageKey]);

  const set = useCallback((key: string, value: unknown) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }, []);

  const setMany = useCallback((patch: Record<string, unknown>) => {
    setFilters((prev) => ({ ...prev, ...patch }));
  }, []);

  const reset = useCallback(() => {
    setFilters(defaultsRef.current);
  }, []);

  const isActive = useCallback((): boolean => {
    const defs = defaultsRef.current;
    for (const k of Object.keys(defs)) {
      if (!deepEqual(filters[k], defs[k])) return true;
    }
    return false;
  }, [filters]);

  return {
    filters,
    set,
    setMany,
    reset,
    isActive,
    defaults: initial,
  };
}
