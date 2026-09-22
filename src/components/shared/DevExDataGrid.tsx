import { useState, useMemo, useEffect, useRef, useCallback, type CSSProperties, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  flexRender,
  ColumnDef,
  SortingState,
  ColumnFiltersState,
  PaginationState,
  Column,
  FilterFn,
  Header,
} from '@tanstack/react-table';
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ChevronDown, ChevronUp, Filter, Download, Printer, Layers, GripVertical, BarChart3 } from 'lucide-react';
import { useResponsive } from '../../hooks/useResponsive';
import { useLanguage } from '../../contexts/LanguageContext';
import { useTheme } from '../../contexts/ThemeContext';
import { ColumnVisibilityMenu } from './ColumnVisibilityMenu';
import { DevExGroupPivotChartModal } from './DevExGroupPivotChartModal';
import { exportDataGridToExcel, printDataGridHtml } from '../../utils/gridExcelExport';
import { ActiveFiltersBar, filterOperatorI18nKey, type ActiveFilterChip } from './ActiveFiltersBar';
import { GRID_POPOVER_Z } from './FullscreenBodyPortal';
import { resolveReportDateRange, type ReportDatePreset } from '../../utils/reportDatePresets';
import {
  coerceReportNumber,
  formatReportFooterSum,
  isDevExCompactNumericColumn,
  isReportCodeColumnId,
  isReportSumColumnId,
  reportDisplayCode,
  resolveDevExCompactNumericSizing,
  type DevExCompactNumericMeta,
} from '../../utils/reportGridChrome';
import { aggregateDevExGroupPivot } from '../../utils/devExGroupPivot';
import { getFirmLedgerCurrency, getGlobalCurrency } from '../../utils/currency';
import { getAppDefaultCurrency } from '../../services/postgres';
import { useFirmaDonem } from '../../contexts/FirmaDonemContext';

/** Sabit kolonlar — sürüklenmez; select solda, actions sağda kalır. */
const PINNED_COLUMN_IDS = new Set(['select', 'actions']);

/**
 * Durum / İşlem kolonları — varsayılan gizli; Kolonlar menüsünden açılır.
 * Tam eşleşme + yaygın alias’lar (statusLabel, is_active, aktif, …).
 */
export const DEVEX_DEFAULT_HIDDEN_COLUMN_IDS = new Set([
  'durum',
  'status',
  'actions',
  'islem',
  'işlem',
  'islemler',
  'işlemler',
  'action',
  // Aktif/Pasif “Durum” kolonları
  'is_active',
  'isactive',
  'aktif',
  'active',
  // Rapor / liste alias’ları
  'statuslabel',
  'statustext',
  'colstatus',
]);

/** statusLabel, stock_status, campColStatus, so_col_status vb. */
const DEVEX_STATUS_ID_RE = /(^|_)(status|durum)(_|$)/i;

export function isDevExDefaultHiddenColumnId(columnId: string | null | undefined): boolean {
  const raw = String(columnId || '').trim();
  if (!raw) return false;
  const id = raw.toLowerCase().replace(/-/g, '_');
  if (DEVEX_DEFAULT_HIDDEN_COLUMN_IDS.has(id)) return true;
  // CamelCase: statusLabel → statuslabel (set’te); campColStatus → campcolstatus
  if (id.includes('status') || id.includes('durum')) return true;
  if (DEVEX_STATUS_ID_RE.test(raw)) return true;
  return false;
}

/** Tanımsız anahtarları varsayılan gizleme ile doldur; açıkça verilen değerleri koru. */
export function mergeDevExDefaultColumnVisibility(
  columns: ColumnDef<any, any>[],
  visibility?: Record<string, boolean> | null,
): Record<string, boolean> {
  const next: Record<string, boolean> = { ...(visibility || {}) };
  for (const col of columns) {
    let id = '';
    if (col.id) id = String(col.id);
    else if ('accessorKey' in col && col.accessorKey != null) id = String(col.accessorKey);
    if (!id || id === 'select') continue;
    if (isDevExDefaultHiddenColumnId(id) && next[id] === undefined) {
      next[id] = false;
    }
  }
  return next;
}

/**
 * Görünürlük key’inden sıra key’i: `…_columnVisibility_v1` → `…_columnOrder_v1`
 */
export function toColumnOrderStorageKey(visibilityStorageKey: string): string {
  if (visibilityStorageKey.includes('_columnVisibility_')) {
    return visibilityStorageKey.replace('_columnVisibility_', '_columnOrder_');
  }
  return `${visibilityStorageKey}_columnOrder`;
}

/** localStorage anahtarı için güvenli segment (path / namespace). */
export function sanitizeStorageNamespace(raw: string): string {
  const cleaned = String(raw || '')
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 120);
  return cleaned || 'grid';
}

/** Kolon id şeması için stabil kısa hash (sıra bağımsız). */
export function hashDevExColumnIds(columnIds: string[]): string {
  const s = [...columnIds]
    .filter((id) => Boolean(id) && !PINNED_COLUMN_IDS.has(id))
    .sort()
    .join('|');
  if (!s) return '0';
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

/**
 * Sürükle-bırak sıra tercihi için otomatik localStorage anahtarı.
 * - `storageNamespace` varsa: `retailex_colOrder_v1_{namespace}` (şema değişince de kalıcı)
 * - yoksa: `retailex_colOrder_v1_{pathname}_{columnIdsHash}` (aynı path’te çoklu grid ayrımı)
 */
export function buildAutoColumnOrderStorageKey(
  storageNamespace: string | undefined,
  columnIds: string[],
  pathname?: string,
): string {
  if (storageNamespace && storageNamespace.trim()) {
    return `retailex_colOrder_v1_${sanitizeStorageNamespace(storageNamespace)}`;
  }
  const pathSource =
    pathname ||
    (typeof window !== 'undefined' ? window.location.pathname : '') ||
    'app';
  const ns = sanitizeStorageNamespace(pathSource);
  const hash = hashDevExColumnIds(columnIds);
  return `retailex_colOrder_v1_${ns}_${hash}`;
}

export function loadColumnOrderFromStorage(storageKey: string): string[] | null {
  if (typeof window === 'undefined' || !storageKey) return null;
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || !parsed.every((x) => typeof x === 'string')) return null;
    return parsed as string[];
  } catch {
    return null;
  }
}

export function saveColumnOrderToStorage(storageKey: string, order: string[]): void {
  if (typeof window === 'undefined' || !storageKey) return;
  try {
    const persistable = order.filter((id) => !PINNED_COLUMN_IDS.has(id));
    localStorage.setItem(storageKey, JSON.stringify(persistable));
  } catch {
    /* quota / private mode */
  }
}

function resolveInitialColumnOrder(opts: {
  columnOrderProp?: string[];
  columnOrderStorageKey?: string;
  storageNamespace?: string;
  enableColumnReorder?: boolean;
  columns: ColumnDef<unknown, unknown>[];
}): string[] {
  const { columnOrderProp, columnOrderStorageKey, storageNamespace, enableColumnReorder, columns } = opts;
  if (columnOrderProp != null) return columnOrderProp;
  if (enableColumnReorder === false) return [];
  const ids = columns.map((c) => columnDefId(c)).filter((id): id is string => Boolean(id));
  const key =
    columnOrderStorageKey ||
    (ids.length > 0 ? buildAutoColumnOrderStorageKey(storageNamespace, ids) : undefined);
  if (!key) return [];
  return loadColumnOrderFromStorage(key) ?? [];
}

/** Tercih edilen sırayı mevcut kolon id’leriyle birleştir; select/actions sabit. */
export function mergeDevExColumnOrder(preferred: string[], availableIds: string[]): string[] {
  const available = availableIds.filter(Boolean);
  const availableSet = new Set(available);
  const start = available.filter((id) => id === 'select');
  const end = available.filter((id) => id === 'actions');
  const middleAvail = available.filter((id) => !PINNED_COLUMN_IDS.has(id));
  const middleSet = new Set(middleAvail);
  const fromPreferred = preferred.filter((id) => middleSet.has(id));
  const seen = new Set(fromPreferred);
  const missing = middleAvail.filter((id) => !seen.has(id));
  const merged = [...start, ...fromPreferred, ...missing, ...end];
  // preferred’da olmayan ama available’da olan her şey eklendi; fazladan id yok
  return merged.filter((id) => availableSet.has(id));
}

function isColumnReorderable(columnId: string): boolean {
  return !PINNED_COLUMN_IDS.has(columnId);
}

const DEFAULT_PAGE_SIZE_OPTIONS = [10, 15, 20, 25, 50, 100];

/** Huni / kolon menüsü — body portal; GRID_POPOVER_Z modal overlay üstünde (Analiz drill-down). */
const FILTER_MENU_Z_INDEX = GRID_POPOVER_Z;
/** Sticky dip toplam / sayfalama — yalnızca tablo kaydırma kutusunun içinde */
const GRID_CHROME_Z_INDEX = 1;

export interface DevExDataGridProps<T> {
  data: T[];
  columns: ColumnDef<T, any>[];
  enableSorting?: boolean;
  /** İlk yüklemede kolon sıralaması (ör. file_id asc) */
  initialSorting?: SortingState;
  enableFiltering?: boolean;
  enableColumnResizing?: boolean;
  enablePagination?: boolean;
  /** Sayfa başına satır seçenekleri (masaüstü alt çubuk). Varsayılan: 10…100 */
  pageSizeOptions?: number[];
  /** Kolon göster/gizle menüsü (masaüstü) */
  enableColumnVisibility?: boolean;
  /** false ise kolon menüsü grid üstünde gösterilmez (harici toolbar kullanımı) */
  showColumnVisibilityToolbar?: boolean;
  columnVisibility?: Record<string, boolean>;
  onColumnVisibilityChange?: (visibility: any) => void;
  /**
   * Kolon başlığını sürükleyerek sıra değiştir (masaüstü). Varsayılan: açık.
   * `select` / `actions` sabit kalır. Filtre / grup ikonları sürüklenmez.
   */
  enableColumnReorder?: boolean;
  /** Kontrollü kolon sırası (kolon id listesi) */
  columnOrder?: string[];
  onColumnOrderChange?: (order: string[]) => void;
  /**
   * Sıra tercihi localStorage anahtarı (görünürlük ile aynı kalıp).
   * Örn. `retailex_invoiceList_columnOrder_v1` —
   * `toColumnOrderStorageKey(INVOICE_LIST_COLUMN_VISIBILITY_KEY)` ile üretilebilir.
   * Verilmezse ve sürükleme açıksa (kontrolsüz mod) otomatik üretilir:
   * `buildAutoColumnOrderStorageKey(storageNamespace ?? pathname, columnIds)`.
   */
  columnOrderStorageKey?: string;
  /**
   * Otomatik persist anahtarı için sabit ad alanı (aynı path’te birden fazla grid).
   * Örn. `materialExtract`, `customerList`. Verilmezse `location.pathname` kullanılır.
   */
  storageNamespace?: string;
  pageSize?: number;
  onRowClick?: (row: T) => void;
  onRowDoubleClick?: (row: T) => void;
  onRowContextMenu?: (e: React.MouseEvent, row: T) => void;
  height?: string | number;
  enableSelection?: boolean;
  onSelectionChange?: (selectedRows: T[]) => void;
  selectedRowIds?: Record<string, boolean>;
  /** compact: 10px (varsayılan), comfortable: 13px — fatura listesi vb. okunabilirlik */
  density?: 'compact' | 'comfortable';
  /** true ise filtrelenmiş satırları Excel olarak indirir */
  enableExcelExport?: boolean;
  excelFileName?: string;
  /** true ise Excel yanındaki Yazdır (varsayılan: Excel açıksa açık) */
  enablePrint?: boolean;
  printTitle?: string;
  /** Verilirse yerleşik tablo yazdırma yerine bu çağrılır */
  onPrint?: () => void;
  printDisabled?: boolean;
  /**
   * Sayısal kolonlarda otomatik dip toplam (miktar/tutar).
   * Birim fiyat ve yüzde toplanmaz. Varsayılan: açık.
   */
  autoFooterSums?: boolean;
  /**
   * Tablo altında sticky dip toplam satırı.
   * Toplamlar `getFilteredRowModel` satırları üzerinden hesaplanır.
   */
  footerSumColumns?: Array<{
    columnId: string;
    getValue: (row: T) => number;
    format?: (sum: number, rows: T[]) => ReactNode;
  }>;
  /** Dip toplam etiketi (ör. "Dip Toplam") — ilk uygun metin kolonuna yazılır */
  footerLabel?: ReactNode;
  /**
   * Footer tutar kolonları için para birimi (varsayılan: firma ana para birimi).
   * Verilmezse `getFirmLedgerCurrency(selectedFirm)`.
   */
  footerCurrency?: string | null;
  /**
   * Kolona göre gruplama (controlled). `null` / `undefined` = gruplama yok.
   * Veride zaten `getRowKind` ile group/subtotal satırları varsa yalnızca UI senkronu için kullanılır (çift genişletme yok).
   */
  groupByColumnId?: string | null;
  onGroupByColumnIdChange?: (columnId: string | null) => void;
  /**
   * Kolon başlığı sağ tık / Layers: «Bu kolona göre grupla».
   * Varsayılan: açık. Veride zaten group/subtotal satırları varsa native genişletme yapılmaz.
   */
  enableGrouping?: boolean;
  /**
   * Önceden enjekte edilmiş satır türü (ör. Malzeme Ekstresi `_rowKind`).
   * Grup başlığı / alt toplam satırlarına dip toplam stiline yakın arka plan uygular.
   */
  getRowKind?: (row: T) => DevExGridRowKind | undefined;
  /** Ek satır sınıfı (grup stillerinden sonra birleştirilir) */
  getRowClassName?: (row: T, index: number) => string | undefined;
  /**
   * Otomatik grup footer satırında toplanacak kolonlar.
   * Verilmezse `footerSumColumns` / autoFooterSums kullanılır.
   */
  groupFooterSumColumns?: Array<{
    columnId: string;
    getValue: (row: T) => number;
    format?: (sum: number, rows: T[]) => ReactNode;
  }>;
}

/** Satır türü — grup başlığı / grup alt toplamı / detay */
export type DevExGridRowKind = 'detail' | 'group' | 'subtotal';

/** Dahili otomatik gruplama meta alanları (satır objesine yazılır) */
export const DEVEX_GRID_ROW_KIND = '__devexRowKind';
export const DEVEX_GRID_ROW_ID = '__devexRowId';
export const DEVEX_GRID_GROUP_LABEL = '__devexGroupLabel';
export const DEVEX_GRID_GROUP_COLUMN_ID = '__devexGroupColumnId';
export const DEVEX_GRID_GROUP_SUMS = '__devexGroupSums';

export function resolveDevExGridRowKind<T>(
  row: T,
  getRowKind?: (row: T) => DevExGridRowKind | undefined,
): DevExGridRowKind {
  const custom = getRowKind?.(row);
  if (custom === 'group' || custom === 'subtotal' || custom === 'detail') return custom;
  const rec = row as Record<string, unknown>;
  const meta = rec[DEVEX_GRID_ROW_KIND] ?? rec._rowKind;
  if (meta === 'group' || meta === 'subtotal' || meta === 'detail') return meta;
  return 'detail';
}

/** Grup başlığı: indigo; grup dip toplam: amber — birbirinden net ayırt edilir. */
function devExGridRowKindClass(kind: DevExGridRowKind, darkMode: boolean): string {
  if (kind === 'group') {
    return darkMode
      ? 'bg-indigo-900/85 hover:bg-indigo-800 text-indigo-50 !border-indigo-500 ring-1 ring-inset ring-indigo-400/35'
      : 'bg-indigo-100 hover:bg-indigo-200/90 text-indigo-950 !border-indigo-300 ring-1 ring-inset ring-indigo-200/90';
  }
  if (kind === 'subtotal') {
    return darkMode
      ? 'bg-amber-900/75 hover:bg-amber-900/90 text-amber-50 !border-amber-600 ring-1 ring-inset ring-amber-500/45'
      : 'bg-amber-100 hover:bg-amber-200/95 text-amber-950 !border-amber-300 ring-1 ring-inset ring-amber-200/95';
  }
  return '';
}

type GridColumnMeta = {
  filterKind?: string;
  format?: string;
  type?: string;
  align?: 'left' | 'right' | 'center';
  /** false: sayısal kolon daraltması uygulanmaz */
  compactWidth?: boolean;
};

function readGridColumnMeta(column: { columnDef: { meta?: unknown } }): GridColumnMeta {
  return (column.columnDef.meta as GridColumnMeta | undefined) ?? {};
}

function resolveGridColumnAlign(
  column: { id: string; columnDef: { meta?: unknown } },
  isNumericFooter: boolean,
): 'left' | 'right' | 'center' {
  const meta = readGridColumnMeta(column);
  if (meta.align === 'left' || meta.align === 'right' || meta.align === 'center') {
    return meta.align;
  }
  if (meta.filterKind === 'number' || meta.format === 'number' || meta.format === 'currency') {
    return 'right';
  }
  if (isNumericFooter) return 'right';
  return 'left';
}

function gridColumnAlignClass(align: 'left' | 'right' | 'center'): string {
  if (align === 'right') return 'text-right tabular-nums';
  if (align === 'center') return 'text-center';
  return 'text-left';
}

function gridColumnWidthStyle(size: number): { width: number; minWidth: number } {
  return { width: size, minWidth: size };
}

interface FilterMenuProps {
  column: Column<any, unknown>;
  onClose: () => void;
}

type DateFilterPreset = Extract<ReportDatePreset, 'today' | 'week' | 'month' | 'lastMonth'>;

type DateCompareMode = 'equals' | 'before' | 'after' | 'range';

type GridFilterPayload =
  | string
  | {
      mode?: string;
      operator?: string;
      value?: string;
      from?: string;
      to?: string;
      /** Tarih aralığında saat sınırı kullan */
      includeTime?: boolean;
      values?: string[];
      /** Tarih filtresi — sayısal/metin equals ile çakışmayı önler */
      kind?: 'date';
      /** Hızlı dönem kısayolu (chip etiketi) */
      preset?: DateFilterPreset;
    };

const DATE_COMPARE_MODES = new Set<string>(['equals', 'before', 'after', 'range']);

const DATE_PRESET_I18N: Record<DateFilterPreset, string> = {
  today: 'bCallBoardToday',
  week: 'bCallBoardWeek',
  month: 'bCallBoardMonth',
  lastMonth: 'reportDatePresetLastMonth',
};

function isDateKindFilterPayload(payload: Exclude<GridFilterPayload, string>): boolean {
  if (!payload || typeof payload !== 'object') return false;
  if (payload.kind === 'date') return true;
  if (payload.preset && DATE_PRESET_I18N[payload.preset as DateFilterPreset]) return true;
  const mode = payload.mode ?? payload.operator;
  // Eski kayıtlar: yalnızca tarih menüsü `range` / `before` / `after` yazar (sayısal `between` değil)
  return mode === 'range' || mode === 'before' || mode === 'after';
}

/** toLocaleLowerCase / localeCompare için güvenli BCP-47; geçersiz → tr-TR */
function safeGridLocale(locale: unknown): string {
  if (typeof locale !== 'string' || !locale.trim()) return 'tr-TR';
  const trimmed = locale.trim();
  try {
    // Intl kabul etmezse RangeError — filtre menüsünü düşürmesin
    void new Intl.Locale(trimmed);
    return trimmed;
  } catch {
    return 'tr-TR';
  }
}

const EMPTY_FILTER_KEY = '__EMPTY__';

function cellToFilterKey(value: unknown): string {
  if (value == null || String(value).trim() === '') return EMPTY_FILTER_KEY;
  return String(value);
}

const BOOL_FILTER_COLUMNS = new Set(['hasVariants', 'isScaleProduct']);

function formatFilterChipValue(payload: GridFilterPayload | undefined): string {
  if (payload == null || payload === '') return '';
  if (typeof payload === 'string') return payload;
  if (payload.preset && DATE_PRESET_I18N[payload.preset]) {
    return payload.preset;
  }
  if (payload.mode === 'range' || payload.mode === 'between') {
    const from = String(payload.from ?? '').trim();
    const to = String(payload.to ?? '').trim();
    if (from && to) return `${from} – ${to}`;
    return from || to;
  }
  if (payload.mode === 'before' || payload.mode === 'after' || (payload.mode === 'equals' && payload.kind === 'date')) {
    return String(payload.value ?? payload.from ?? payload.to ?? '').trim();
  }
  if (payload.mode === 'multiselect') {
    const values = Array.isArray(payload.values) ? payload.values : [];
    return values.filter((v) => v && v !== EMPTY_FILTER_KEY).join(', ');
  }
  return String(payload.value ?? '').trim();
}

function gridColumnHeaderLabel(column: Column<any, unknown> | undefined, fallbackId: string): string {
  if (!column) return fallbackId;
  const header = column.columnDef.header;
  if (typeof header === 'string' && header.trim()) return header;
  return column.id || fallbackId;
}

function gridFilterOperatorMode(payload: GridFilterPayload | undefined): string {
  if (payload == null || payload === '') return 'contains';
  if (typeof payload === 'string') return 'contains';
  return payload.mode ?? payload.operator ?? 'contains';
}

function gridFilterChipValueLabel(
  payload: GridFilterPayload | undefined,
  columnId: string,
  tm: (key: string) => string,
  localeCode: string,
): string {
  if (payload == null || payload === '') return '';
  if (typeof payload === 'string') return payload;
  if (payload.preset && DATE_PRESET_I18N[payload.preset]) {
    return tm(DATE_PRESET_I18N[payload.preset]);
  }
  if (payload.mode === 'range' || payload.mode === 'between') {
    return formatFilterChipValue(payload);
  }
  if (payload.mode === 'before' || payload.mode === 'after' || (payload.mode === 'equals' && payload.kind === 'date')) {
    return String(payload.value ?? payload.from ?? payload.to ?? '').trim();
  }
  if (payload.mode === 'multiselect') {
    const values = Array.isArray(payload.values) ? payload.values : [];
    if (values.length === 0) return tm('gridFilterEmpty');
    const labels = values.map((v) =>
      formatFilterLabel(v === EMPTY_FILTER_KEY ? null : v, columnId, tm, localeCode),
    );
    if (labels.length <= 2) return labels.join(', ');
    return tm('activeFiltersSelectedCount').replace('{count}', String(labels.length));
  }
  if (payload.mode === 'isEmpty' || payload.mode === 'isNotEmpty') {
    return '—';
  }
  return String(payload.value ?? '').trim();
}

function isGridFilterActive(payload: unknown): boolean {
  if (payload == null || payload === '') return false;
  if (typeof payload === 'string') return payload.trim() !== '';
  const p = payload as GridFilterPayload;
  if (typeof p !== 'object') return false;
  if (p.preset) return true;
  if (p.mode === 'isEmpty' || p.mode === 'isNotEmpty') return true;
  if (p.mode === 'range' || p.mode === 'between') return !!(p.from || p.to);
  if (p.mode === 'before' || p.mode === 'after') {
    return String(p.value ?? p.from ?? p.to ?? '').trim() !== '';
  }
  if (p.mode === 'equals' && p.kind === 'date') {
    return String(p.value ?? p.from ?? '').trim() !== '';
  }
  if (p.mode === 'multiselect') return Array.isArray(p.values);
  return String(p.value ?? '').trim() !== '';
}

function formatFilterLabel(
  value: unknown,
  columnId: string,
  tm?: (key: string) => string,
  localeCode?: string
): string {
  if (value == null || value === EMPTY_FILTER_KEY || String(value).trim() === '') {
    return tm ? tm('gridFilterEmpty') : '(Boş)';
  }
  const boolLike =
    BOOL_FILTER_COLUMNS.has(columnId) &&
    (typeof value === 'boolean' || value === 'true' || value === 'false' || value === 1 || value === 0);
  if (boolLike) {
    const yes = value === true || value === 'true' || value === 1;
    if (tm) return yes ? tm('gridBoolYes') : tm('gridBoolNo');
    return yes ? 'Evet' : 'Hayır';
  }
  if (columnId === 'created_at' || columnId === 'updated_at') {
    const d = new Date(String(value));
    if (Number.isFinite(d.getTime())) {
      try {
        return d.toLocaleString(safeGridLocale(localeCode), {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        });
      } catch {
        return d.toISOString();
      }
    }
  }
  return String(value);
}

function parseCellDate(value: unknown): number | null {
  if (value == null || value === '') return null;
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value.getTime() : null;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'object') return null;
  const d = new Date(String(value));
  return Number.isFinite(d.getTime()) ? d.getTime() : null;
}

const DATE_FILTER_COLUMN_IDS = new Set(['created_at', 'updated_at', 'expiry_date', 'date', 'invoiceDate', 'dueDate']);

function isDateFilterColumn(columnId: string, column: Column<any, unknown>): boolean {
  if (DATE_FILTER_COLUMN_IDS.has(columnId)) return true;
  const meta = column.columnDef.meta as { filterKind?: string; format?: string; type?: string } | undefined;
  return meta?.filterKind === 'date' || meta?.format === 'date' || meta?.type === 'date';
}

const NUMBER_COMPARE_MODES = new Set([
  'equals',
  'notEquals',
  'gt',
  'gte',
  'lt',
  'lte',
  'between',
]);

type NumberCompareMode = 'equals' | 'notEquals' | 'gt' | 'gte' | 'lt' | 'lte' | 'between';

type TextCompareMode =
  | 'contains'
  | 'doesNotContain'
  | 'equals'
  | 'notEquals'
  | 'startsWith'
  | 'endsWith'
  | 'doesNotStartWith'
  | 'doesNotEndWith'
  | 'isEmpty'
  | 'isNotEmpty';

const TEXT_COMPARE_MODES = new Set<string>([
  'contains',
  'doesNotContain',
  'notContains',
  'equals',
  'notEquals',
  'startsWith',
  'endsWith',
  'doesNotStartWith',
  'doesNotEndWith',
  'isEmpty',
  'isNotEmpty',
]);

const TEXT_COMPARE_MODE_OPTIONS: TextCompareMode[] = [
  'contains',
  'doesNotContain',
  'equals',
  'notEquals',
  'startsWith',
  'endsWith',
  'doesNotStartWith',
  'doesNotEndWith',
  'isEmpty',
  'isNotEmpty',
];

function normalizeTextCompareMode(mode: string | null | undefined): TextCompareMode {
  if (mode === 'notContains') return 'doesNotContain';
  if (mode && TEXT_COMPARE_MODES.has(mode) && mode !== 'notContains') {
    return mode as TextCompareMode;
  }
  return 'contains';
}

function textFilterNeedsValue(mode: TextCompareMode): boolean {
  return mode !== 'isEmpty' && mode !== 'isNotEmpty';
}

function isNumberFilterColumn(columnId: string, column: Column<any, unknown>): boolean {
  if (isDateFilterColumn(columnId, column)) return false;
  const meta = readGridColumnMeta(column);
  if (meta.filterKind === 'number' || meta.format === 'number' || meta.format === 'currency') return true;
  if (meta.type === 'number' || meta.type === 'currency') return true;
  return isDevExCompactNumericColumn(columnId, meta);
}

/** Filtre değeri / hücre → sayı; boş veya geçersiz → null */
export function parseFilterNumber(value: unknown): number | null {
  if (value == null || value === '' || value === EMPTY_FILTER_KEY) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'object') return null;
  const raw = String(value).trim();
  if (!raw) return null;
  // Saf sayısal girdi (karşılaştırma operatörleri); metin içinde gömülü rakamları yok say
  if (!/^-?\d+([.,]\d+)?$/.test(raw)) {
    // Para birimi / binlik ayırıcılı: 1.234,56 veya 1,234.56
    if (!/^-?[\d.,]+$/.test(raw)) return null;
  }
  const n = coerceReportNumber(raw);
  if (n === 0 && !/[0-9]/.test(raw.replace(/[^\d]/g, ''))) return null;
  return Number.isFinite(n) ? n : null;
}

function bothNumericComparable(a: unknown, b: unknown): boolean {
  return parseFilterNumber(a) != null && parseFilterNumber(b) != null;
}

function splitDateTimeInput(raw?: string): { date: string; time: string } {
  if (!raw || !String(raw).trim()) return { date: '', time: '' };
  const s = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return { date: s, time: '' };
  const d = new Date(s.includes('T') ? s : `${s}T12:00:00`);
  if (!Number.isFinite(d.getTime())) return { date: '', time: '' };
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return { date, time };
}

function combineDateTimeInput(
  date: string,
  time: string,
  includeTime: boolean,
  bound: 'start' | 'end'
): string | undefined {
  const d = date.trim();
  if (!d) return undefined;
  if (!includeTime) return d;
  const t = time.trim() || (bound === 'start' ? '00:00' : '23:59');
  return `${d}T${t}`;
}

/** Tarih sınırı → ms; non-string / geçersiz → null (asla throw yok) */
export function parseRangeBoundMs(
  value: unknown,
  bound: 'start' | 'end',
  includeTime: boolean,
): number | null {
  if (value == null || value === '') return null;
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'object') return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  if (!includeTime && /^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const [y, m, day] = trimmed.split('-').map(Number);
    if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(day)) return null;
    const dt = new Date(y, m - 1, day);
    if (!Number.isFinite(dt.getTime())) return null;
    if (bound === 'end') dt.setHours(23, 59, 59, 999);
    else dt.setHours(0, 0, 0, 0);
    return dt.getTime();
  }
  const dt = new Date(trimmed.includes('T') ? trimmed : `${trimmed}T${bound === 'start' ? '00:00' : '23:59'}`);
  if (!Number.isFinite(dt.getTime())) return null;
  if (!includeTime && bound === 'end') dt.setHours(23, 59, 59, 999);
  if (!includeTime && bound === 'start') dt.setHours(0, 0, 0, 0);
  return dt.getTime();
}

function gridColumnFilterFnInner(
  row: { getValue: (columnId: string) => unknown },
  columnId: string,
  filterValue: unknown,
): boolean {
  const payload = filterValue as GridFilterPayload | undefined;
  if (payload == null || payload === '') return true;

  if (typeof payload === 'string') {
    const cellValue = String(row.getValue(columnId) ?? '').toLowerCase();
    return cellValue.includes(payload.toLowerCase());
  }

  if (typeof payload !== 'object') return true;

  const mode = String(payload.mode ?? payload.operator ?? 'contains');
  const cellRaw = row.getValue(columnId);

  // Tarih filtreleri (kind:date / range / before / after) — sayısal between'den önce
  if (isDateKindFilterPayload(payload) && DATE_COMPARE_MODES.has(mode)) {
    const includeTime = !!payload.includeTime;
    const cellMs = parseCellDate(cellRaw);
    if (cellMs == null) return false;

    if (mode === 'range') {
      const fromMs =
        payload.from != null && String(payload.from).trim() !== ''
          ? parseRangeBoundMs(payload.from, 'start', includeTime)
          : null;
      const toMs =
        payload.to != null && String(payload.to).trim() !== ''
          ? parseRangeBoundMs(payload.to, 'end', includeTime)
          : null;
      if (fromMs == null && toMs == null) return true;
      if (fromMs != null && cellMs < fromMs) return false;
      if (toMs != null && cellMs > toMs) return false;
      return true;
    }

    if (mode === 'equals') {
      const raw = String(payload.value ?? payload.from ?? '').trim();
      if (!raw) return true;
      const dayStart = parseRangeBoundMs(raw, 'start', includeTime);
      const dayEnd = parseRangeBoundMs(raw, 'end', includeTime);
      if (dayStart == null) return true;
      if (includeTime) {
        // Aynı dakika: saniye/ms farkını yok say
        const minute = 60_000;
        return Math.floor(cellMs / minute) === Math.floor(dayStart / minute);
      }
      if (dayEnd == null) return cellMs >= dayStart;
      return cellMs >= dayStart && cellMs <= dayEnd;
    }

    if (mode === 'before') {
      const raw = String(payload.value ?? payload.to ?? '').trim();
      if (!raw) return true;
      // Tarih-only: o günün başlangıcından önce; saat dahil: verilen andan önce
      const bound = parseRangeBoundMs(raw, 'start', includeTime);
      if (bound == null) return true;
      return cellMs < bound;
    }

    if (mode === 'after') {
      const raw = String(payload.value ?? payload.from ?? '').trim();
      if (!raw) return true;
      // Tarih-only: o günün bitişinden sonra; saat dahil: verilen andan sonra
      const bound = parseRangeBoundMs(raw, 'end', includeTime);
      if (bound == null) return true;
      return cellMs > bound;
    }
  }

  if (mode === 'multiselect') {
    const values = Array.isArray(payload.values) ? payload.values.map(String) : [];
    if (values.length === 0) return false;
    const cellStr = cellToFilterKey(cellRaw);
    return values.includes(cellStr);
  }

  if (mode === 'between' || (NUMBER_COMPARE_MODES.has(mode) && mode !== 'equals' && mode !== 'notEquals')) {
    const cellNum = parseFilterNumber(cellRaw);
    if (cellNum == null) return false;

    if (mode === 'between') {
      const fromNum =
        payload.from != null && String(payload.from).trim() !== '' ? parseFilterNumber(payload.from) : null;
      const toNum =
        payload.to != null && String(payload.to).trim() !== '' ? parseFilterNumber(payload.to) : null;
      if (fromNum == null && toNum == null) return true;
      if (fromNum != null && cellNum < fromNum) return false;
      if (toNum != null && cellNum > toNum) return false;
      return true;
    }

    const cmp = parseFilterNumber(payload.value);
    if (cmp == null) return true;
    switch (mode) {
      case 'gt':
        return cellNum > cmp;
      case 'gte':
        return cellNum >= cmp;
      case 'lt':
        return cellNum < cmp;
      case 'lte':
        return cellNum <= cmp;
      default:
        break;
    }
  }

  if (mode === 'equals' || mode === 'notEquals') {
    if (bothNumericComparable(cellRaw, payload.value)) {
      const eq = parseFilterNumber(cellRaw)! === parseFilterNumber(payload.value)!;
      return mode === 'equals' ? eq : !eq;
    }
    if (mode === 'notEquals') {
      const searchValue = String(payload.value ?? '').toLowerCase();
      if (!searchValue) return true;
      return String(cellRaw ?? '').toLowerCase() !== searchValue;
    }
    // equals: metin karşılaştırmasına düş
  }

  const searchValue = String(payload.value ?? '').toLowerCase();
  const cellValue = String(cellRaw ?? '').toLowerCase();
  const cellBlank = cellRaw == null || String(cellRaw).trim() === '';

  switch (mode) {
    case 'isEmpty':
      return cellBlank;
    case 'isNotEmpty':
      return !cellBlank;
    case 'equals':
      if (!searchValue) return true;
      return cellValue === searchValue;
    case 'notEquals':
      if (!searchValue) return true;
      return cellValue !== searchValue;
    case 'startsWith':
      if (!searchValue) return true;
      return cellValue.startsWith(searchValue);
    case 'endsWith':
      if (!searchValue) return true;
      return cellValue.endsWith(searchValue);
    case 'doesNotStartWith':
      if (!searchValue) return true;
      return !cellValue.startsWith(searchValue);
    case 'doesNotEndWith':
      if (!searchValue) return true;
      return !cellValue.endsWith(searchValue);
    case 'notContains':
    case 'doesNotContain':
      if (!searchValue) return true;
      return !cellValue.includes(searchValue);
    case 'contains':
    default:
      if (!searchValue) return true;
      return cellValue.includes(searchValue);
  }
}

/**
 * Kolon huni filtresi — FilterMenu `{ mode, value }` ile uyumlu.
 * Her satırda throw olursa tüm ReportsModule çöker; bu yüzden catch → true.
 */
export const gridColumnFilterFn: FilterFn<any> = (row, columnId, filterValue) => {
  try {
    return gridColumnFilterFnInner(row, columnId, filterValue);
  } catch {
    return true;
  }
};

function DateRangeFilterMenu({ column, onClose }: FilterMenuProps) {
  const { tm } = useLanguage();
  const existing = column.getFilterValue() as GridFilterPayload | undefined;
  const existingDate =
    existing && typeof existing === 'object' && isDateKindFilterPayload(existing) ? existing : undefined;

  const initMode: DateCompareMode = (() => {
    const m = existingDate?.mode;
    if (m === 'equals' || m === 'before' || m === 'after' || m === 'range') return m;
    return 'range';
  })();

  const initSingle =
    initMode === 'equals' || initMode === 'before' || initMode === 'after'
      ? splitDateTimeInput(String(existingDate?.value ?? existingDate?.from ?? existingDate?.to ?? ''))
      : { date: '', time: '' };
  const initFrom = splitDateTimeInput(existingDate?.from);
  const initTo = splitDateTimeInput(existingDate?.to);

  const [dateMode, setDateMode] = useState<DateCompareMode>(initMode);
  const [includeTime, setIncludeTime] = useState(!!existingDate?.includeTime);
  const [activePreset, setActivePreset] = useState<DateFilterPreset | null>(existingDate?.preset ?? null);
  const [singleDate, setSingleDate] = useState(initSingle.date);
  const [singleTime, setSingleTime] = useState(initSingle.time || (initMode === 'after' ? '00:00' : '23:59'));
  const [fromDate, setFromDate] = useState(initFrom.date);
  const [fromTime, setFromTime] = useState(initFrom.time || '00:00');
  const [toDate, setToDate] = useState(initTo.date);
  const [toTime, setToTime] = useState(initTo.time || '23:59');

  const applyPreset = (preset: DateFilterPreset) => {
    const { from, to } = resolveReportDateRange(preset);
    setDateMode('range');
    setActivePreset(preset);
    setIncludeTime(false);
    setFromDate(from);
    setToDate(to);
    setFromTime('00:00');
    setToTime('23:59');
    column.setFilterValue({
      kind: 'date',
      mode: 'range',
      from,
      to,
      includeTime: false,
      preset,
    });
    onClose();
  };

  const handleApply = () => {
    if (dateMode === 'range') {
      const from = combineDateTimeInput(fromDate, fromTime, includeTime, 'start');
      const to = combineDateTimeInput(toDate, toTime, includeTime, 'end');
      if (!from && !to) {
        column.setFilterValue(undefined);
      } else {
        column.setFilterValue({
          kind: 'date',
          mode: 'range',
          from,
          to,
          includeTime,
          preset: activePreset ?? undefined,
        });
      }
    } else {
      const value = combineDateTimeInput(singleDate, singleTime, includeTime, 'start');
      if (!value) {
        column.setFilterValue(undefined);
      } else {
        column.setFilterValue({
          kind: 'date',
          mode: dateMode,
          value,
          includeTime,
        });
      }
    }
    onClose();
  };

  const handleClear = () => {
    column.setFilterValue(undefined);
    onClose();
  };

  const onModeChange = (next: DateCompareMode) => {
    setDateMode(next);
    setActivePreset(null);
  };

  const presetButtons: Array<{ id: DateFilterPreset; labelKey: string }> = [
    { id: 'today', labelKey: DATE_PRESET_I18N.today },
    { id: 'week', labelKey: DATE_PRESET_I18N.week },
    { id: 'month', labelKey: DATE_PRESET_I18N.month },
    { id: 'lastMonth', labelKey: DATE_PRESET_I18N.lastMonth },
  ];

  return (
    <div
      className="bg-white border border-gray-300 rounded shadow-xl w-[300px] flex flex-col overflow-hidden"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="shrink-0 px-2 py-1.5 border-b border-gray-200 bg-[#E3F2FD]">
        <span className="text-[10px] font-semibold text-gray-700">{tm('gridFilterDateFilter')}</span>
      </div>

      <div className="p-3 space-y-3">
        <div className="space-y-1">
          <span className="text-[10px] font-semibold text-gray-600 uppercase">{tm('gridFilterDatePresets')}</span>
          <div className="flex flex-wrap gap-1">
            {presetButtons.map((btn) => (
              <button
                key={btn.id}
                type="button"
                onClick={() => applyPreset(btn.id)}
                className={`px-2 py-1 rounded text-[10px] font-semibold transition-colors ${
                  activePreset === btn.id
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                }`}
              >
                {tm(btn.labelKey)}
              </button>
            ))}
          </div>
        </div>

        <select
          value={dateMode}
          onChange={(e) => onModeChange(e.target.value as DateCompareMode)}
          className="w-full px-2 py-1.5 text-[11px] border border-gray-300 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="equals">{tm('reportColumnFiltersOpEquals')}</option>
          <option value="before">{tm('reportColumnFiltersOpBefore')}</option>
          <option value="after">{tm('reportColumnFiltersOpAfter')}</option>
          <option value="range">{tm('reportColumnFiltersOpBetween')}</option>
        </select>

        <label className="flex items-center gap-2 text-[11px] text-gray-700 cursor-pointer">
          <input
            type="checkbox"
            checked={includeTime}
            onChange={(e) => {
              setIncludeTime(e.target.checked);
              setActivePreset(null);
            }}
            className="w-3.5 h-3.5 shrink-0"
          />
          <span>{tm('gridFilterIncludeTime')}</span>
        </label>

        {dateMode === 'range' ? (
          <>
            <div className="space-y-1.5">
              <span className="text-[10px] font-semibold text-gray-600 uppercase">{tm('dateFrom')}</span>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => {
                  setFromDate(e.target.value);
                  setActivePreset(null);
                }}
                className="w-full px-2 py-1.5 text-[11px] border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              {includeTime && (
                <input
                  type="time"
                  value={fromTime}
                  onChange={(e) => {
                    setFromTime(e.target.value);
                    setActivePreset(null);
                  }}
                  className="w-full px-2 py-1.5 text-[11px] border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              )}
            </div>

            <div className="space-y-1.5">
              <span className="text-[10px] font-semibold text-gray-600 uppercase">{tm('dateTo')}</span>
              <input
                type="date"
                value={toDate}
                onChange={(e) => {
                  setToDate(e.target.value);
                  setActivePreset(null);
                }}
                className="w-full px-2 py-1.5 text-[11px] border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              {includeTime && (
                <input
                  type="time"
                  value={toTime}
                  onChange={(e) => {
                    setToTime(e.target.value);
                    setActivePreset(null);
                  }}
                  className="w-full px-2 py-1.5 text-[11px] border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              )}
            </div>
          </>
        ) : (
          <div className="space-y-1.5">
            <span className="text-[10px] font-semibold text-gray-600 uppercase">
              {dateMode === 'before'
                ? tm('reportColumnFiltersOpBefore')
                : dateMode === 'after'
                  ? tm('reportColumnFiltersOpAfter')
                  : tm('reportColumnFiltersOpEquals')}
            </span>
            <input
              type="date"
              value={singleDate}
              onChange={(e) => {
                setSingleDate(e.target.value);
                setActivePreset(null);
              }}
              className="w-full px-2 py-1.5 text-[11px] border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            {includeTime && (
              <input
                type="time"
                value={singleTime}
                onChange={(e) => {
                  setSingleTime(e.target.value);
                  setActivePreset(null);
                }}
                className="w-full px-2 py-1.5 text-[11px] border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            )}
          </div>
        )}

        <p className="text-[10px] text-gray-500 leading-snug">{tm('gridFilterDateRangeHint')}</p>
      </div>

      <div className="shrink-0 p-2 flex gap-1 border-t border-gray-200 bg-gray-50/80">
        <button
          type="button"
          onClick={handleApply}
          className="flex-1 px-2 py-1.5 text-[11px] bg-blue-600 text-white rounded hover:bg-blue-700 font-medium"
        >
          {tm('apply')} ({tm(filterOperatorI18nKey(dateMode))})
        </button>
        <button
          type="button"
          onClick={handleClear}
          className="flex-1 px-2 py-1.5 text-[11px] bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
        >
          {tm('clear')}
        </button>
      </div>
    </div>
  );
}

function ValueListFilterMenu({ column, onClose }: FilterMenuProps) {
  const { tm } = useLanguage();
  const localeCode = safeGridLocale(tm('localeCode'));
  const sortLocale = localeCode.split('-')[0] || 'tr';
  const existing = column.getFilterValue() as GridFilterPayload | undefined;
  const columnId = column.id;
  const isNumericColumn = isNumberFilterColumn(columnId, column);

  const valueEntries = useMemo(() => {
    const counts = new Map<string, number>();
    try {
      const faceted = column.getFacetedUniqueValues?.();
      if (faceted && faceted.size > 0) {
        faceted.forEach((count, raw) => {
          const key = cellToFilterKey(raw);
          counts.set(key, (counts.get(key) ?? 0) + count);
        });
      }
    } catch {
      /* fallback */
    }
    if (counts.size === 0) {
      column.getPreFilteredRowModel().rows.forEach((row) => {
        const key = cellToFilterKey(row.getValue(column.id));
        counts.set(key, (counts.get(key) ?? 0) + 1);
      });
    }
    return Array.from(counts.entries())
      .map(([key, count]) => ({
        key,
        label: formatFilterLabel(key === EMPTY_FILTER_KEY ? null : key, columnId, tm, localeCode),
        count,
      }))
      .sort((a, b) => {
        if (isNumericColumn) {
          const na = parseFilterNumber(a.key === EMPTY_FILTER_KEY ? null : a.key);
          const nb = parseFilterNumber(b.key === EMPTY_FILTER_KEY ? null : b.key);
          if (na != null && nb != null) return na - nb;
          if (na != null) return -1;
          if (nb != null) return 1;
        }
        return a.label.localeCompare(b.label, sortLocale);
      });
  }, [column, columnId, tm, localeCode, sortLocale, isNumericColumn]);

  const allKeys = useMemo(() => valueEntries.map((e) => e.key), [valueEntries]);

  const existingAdvancedMode =
    existing && typeof existing === 'object' && existing.mode && existing.mode !== 'multiselect'
      ? existing.mode
      : null;

  const [listSearch, setListSearch] = useState('');
  const [selectedValues, setSelectedValues] = useState<string[]>([]);
  const [showAdvancedFilter, setShowAdvancedFilter] = useState(() => !!existingAdvancedMode);
  const [textMode, setTextMode] = useState<TextCompareMode>(() =>
    normalizeTextCompareMode(existingAdvancedMode)
  );
  const [numberMode, setNumberMode] = useState<NumberCompareMode>(() => {
    if (existingAdvancedMode && NUMBER_COMPARE_MODES.has(existingAdvancedMode)) {
      return existingAdvancedMode as NumberCompareMode;
    }
    return 'gte';
  });
  const [textValue, setTextValue] = useState(
    existing && typeof existing === 'object' && existing.value ? String(existing.value) : ''
  );
  const [numberFrom, setNumberFrom] = useState(
    existing && typeof existing === 'object' && existing.from != null ? String(existing.from) : ''
  );
  const [numberTo, setNumberTo] = useState(
    existing && typeof existing === 'object' && existing.to != null ? String(existing.to) : ''
  );

  useEffect(() => {
    if (existing && typeof existing === 'object' && existing.mode === 'multiselect' && existing.values) {
      setSelectedValues(existing.values);
      return;
    }
    setSelectedValues(allKeys);
  }, [columnId, allKeys, existing]);

  const filteredEntries = useMemo(() => {
    const locale = safeGridLocale(tm('localeCode'));
    const q = listSearch.trim().toLocaleLowerCase(locale);
    if (!q) return valueEntries;
    return valueEntries.filter((e) => e.label.toLocaleLowerCase(locale).includes(q));
  }, [valueEntries, listSearch, tm]);

  const filteredKeys = filteredEntries.map((e) => e.key);
  const allFilteredSelected =
    filteredKeys.length > 0 && filteredKeys.every((k) => selectedValues.includes(k));
  const someFilteredSelected =
    filteredKeys.some((k) => selectedValues.includes(k)) && !allFilteredSelected;

  const toggleValue = (key: string) => {
    setSelectedValues((prev) =>
      prev.includes(key) ? prev.filter((v) => v !== key) : [...prev, key]
    );
  };

  const toggleSelectAllFiltered = () => {
    if (allFilteredSelected) {
      setSelectedValues((prev) => prev.filter((k) => !filteredKeys.includes(k)));
    } else {
      setSelectedValues((prev) => Array.from(new Set([...prev, ...filteredKeys])));
    }
  };

  const handleApplyValues = () => {
    if (selectedValues.length === 0) {
      column.setFilterValue({ mode: 'multiselect', values: [] });
    } else if (selectedValues.length >= allKeys.length) {
      column.setFilterValue(undefined);
    } else {
      column.setFilterValue({ mode: 'multiselect', values: selectedValues });
    }
    onClose();
  };

  const handleApplyAdvanced = () => {
    if (isNumericColumn) {
      if (numberMode === 'between') {
        const from = numberFrom.trim();
        const to = numberTo.trim();
        if (!from && !to) {
          column.setFilterValue(undefined);
        } else {
          column.setFilterValue({ mode: 'between', from: from || undefined, to: to || undefined });
        }
      } else if (textValue.trim()) {
        column.setFilterValue({ mode: numberMode, value: textValue.trim() });
      } else {
        column.setFilterValue(undefined);
      }
    } else if (!textFilterNeedsValue(textMode)) {
      column.setFilterValue({ mode: textMode });
    } else if (textValue.trim()) {
      column.setFilterValue({ mode: textMode, value: textValue.trim() });
    } else {
      column.setFilterValue(undefined);
    }
    onClose();
  };

  const handleClear = () => {
    column.setFilterValue(undefined);
    setSelectedValues(allKeys);
    setListSearch('');
    setTextValue('');
    setNumberFrom('');
    setNumberTo('');
    onClose();
  };

  const FILTER_MENU_HEIGHT = 440;
  const filterListHeight = showAdvancedFilter ? 120 : 220;
  const advancedToggleLabel = isNumericColumn
    ? tm('gridFilterNumberFilter')
    : tm('gridFilterTextFilter');
  const applyAdvancedOpLabel = isNumericColumn
    ? tm(filterOperatorI18nKey(numberMode))
    : tm(filterOperatorI18nKey(textMode));

  return (
    <div
      className="bg-white border border-gray-300 rounded shadow-xl w-[300px] flex flex-col overflow-hidden"
      style={{ height: Math.min(FILTER_MENU_HEIGHT, window.innerHeight - 16) }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="shrink-0 px-2 py-1.5 border-b border-gray-200 bg-[#E3F2FD]">
        <span className="text-[10px] font-semibold text-gray-700">{tm('filterType')}</span>
      </div>

      <div className="shrink-0 p-2 space-y-2 border-b border-gray-100">
        <input
          type="text"
          value={listSearch}
          onChange={(e) => setListSearch(e.target.value)}
          placeholder={`${tm('search')}...`}
          className="w-full px-2 py-1.5 text-[11px] border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
          autoFocus
        />

        <label className="flex items-center gap-2 px-1 py-1 text-[11px] font-medium text-gray-700 cursor-pointer hover:bg-gray-50 rounded">
          <input
            type="checkbox"
            checked={allFilteredSelected}
            ref={(el) => {
              if (el) el.indeterminate = someFilteredSelected;
            }}
            onChange={toggleSelectAllFiltered}
            className="w-3.5 h-3.5 shrink-0"
          />
          <span className="flex-1">({tm('catalogSelectAll')})</span>
          <span className="text-gray-400 tabular-nums">{filteredEntries.length}</span>
        </label>
      </div>

      <div
        className="panel-menu-scroll shrink-0 border-b border-gray-200 bg-white"
        style={{ height: filterListHeight }}
      >
        {filteredEntries.length === 0 ? (
          <div className="p-4 text-[10px] text-gray-400 text-center">{tm('noDataFound')}</div>
        ) : (
          <div className="divide-y divide-gray-50">
            {filteredEntries.map((entry) => (
              <label
                key={entry.key}
                className="flex items-center gap-2 px-2 py-1.5 text-[11px] hover:bg-blue-50/60 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selectedValues.includes(entry.key)}
                  onChange={() => toggleValue(entry.key)}
                  className="w-3.5 h-3.5 shrink-0"
                />
                <span className="flex-1 truncate" title={entry.label}>
                  {entry.label}
                </span>
                <span className="text-gray-400 tabular-nums shrink-0">({entry.count})</span>
              </label>
            ))}
          </div>
        )}
      </div>

      <div className="shrink-0 p-2 space-y-2 bg-gray-50/80">
        <button
          type="button"
          onClick={() => setShowAdvancedFilter((v) => !v)}
          className="text-[10px] text-blue-600 hover:underline"
        >
          {showAdvancedFilter ? `▾ ${tm('gridFilterValueList')}` : `▸ ${advancedToggleLabel}`}
        </button>

        {showAdvancedFilter && (
          <div className="space-y-2 pt-1 border-t border-gray-200">
            {isNumericColumn ? (
              <>
                <select
                  value={numberMode}
                  onChange={(e) => setNumberMode(e.target.value as NumberCompareMode)}
                  className="w-full px-2 py-1 text-[10px] border border-gray-300 rounded bg-white"
                >
                  <option value="equals">{tm('reportColumnFiltersOpEquals')}</option>
                  <option value="notEquals">{tm('reportColumnFiltersOpNotEquals')}</option>
                  <option value="gt">{tm('reportColumnFiltersOpGt')}</option>
                  <option value="gte">{tm('reportColumnFiltersOpGte')}</option>
                  <option value="lt">{tm('reportColumnFiltersOpLt')}</option>
                  <option value="lte">{tm('reportColumnFiltersOpLte')}</option>
                  <option value="between">{tm('reportColumnFiltersOpBetween')}</option>
                </select>
                {numberMode === 'between' ? (
                  <div className="flex gap-1">
                    <input
                      type="number"
                      inputMode="decimal"
                      value={numberFrom}
                      onChange={(e) => setNumberFrom(e.target.value)}
                      placeholder={tm('dateFrom')}
                      className="w-1/2 px-2 py-1 text-[10px] border border-gray-300 rounded bg-white"
                    />
                    <input
                      type="number"
                      inputMode="decimal"
                      value={numberTo}
                      onChange={(e) => setNumberTo(e.target.value)}
                      placeholder={tm('dateTo')}
                      className="w-1/2 px-2 py-1 text-[10px] border border-gray-300 rounded bg-white"
                    />
                  </div>
                ) : (
                  <input
                    type="number"
                    inputMode="decimal"
                    value={textValue}
                    onChange={(e) => setTextValue(e.target.value)}
                    placeholder={tm('value')}
                    className="w-full px-2 py-1 text-[10px] border border-gray-300 rounded bg-white"
                  />
                )}
              </>
            ) : (
              <>
                <select
                  value={textMode}
                  onChange={(e) => setTextMode(normalizeTextCompareMode(e.target.value))}
                  className="w-full px-2 py-1 text-[10px] border border-gray-300 rounded bg-white"
                >
                  {TEXT_COMPARE_MODE_OPTIONS.map((op) => (
                    <option key={op} value={op}>
                      {tm(filterOperatorI18nKey(op))}
                    </option>
                  ))}
                </select>
                {textFilterNeedsValue(textMode) ? (
                  <input
                    type="text"
                    value={textValue}
                    onChange={(e) => setTextValue(e.target.value)}
                    placeholder={tm('value')}
                    className="w-full px-2 py-1 text-[10px] border border-gray-300 rounded bg-white"
                  />
                ) : null}
              </>
            )}
            <button
              type="button"
              onClick={handleApplyAdvanced}
              className="w-full px-2 py-1 text-[10px] bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
            >
              {tm('apply')} ({applyAdvancedOpLabel})
            </button>
          </div>
        )}

        <div className="flex gap-1 pt-1 border-t border-gray-200">
          <button
            type="button"
            onClick={handleApplyValues}
            className="flex-1 px-2 py-1.5 text-[11px] bg-blue-600 text-white rounded hover:bg-blue-700 font-medium"
          >
            {tm('apply')}
          </button>
          <button
            type="button"
            onClick={handleClear}
            className="flex-1 px-2 py-1.5 text-[11px] bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
          >
            {tm('clear')}
          </button>
        </div>
      </div>
    </div>
  );
}

function FilterMenu({ column, onClose }: FilterMenuProps) {
  if (isDateFilterColumn(column.id, column)) {
    return <DateRangeFilterMenu column={column} onClose={onClose} />;
  }
  return <ValueListFilterMenu column={column} onClose={onClose} />;
}

function columnDefId<T>(col: ColumnDef<T, any>): string {
  if (col.id) return String(col.id);
  if ('accessorKey' in col && col.accessorKey != null) return String(col.accessorKey);
  return '';
}

function readRowColumnValue<T>(col: ColumnDef<T, any>, row: T, rowIndex: number): unknown {
  if ('accessorFn' in col && typeof col.accessorFn === 'function') {
    try {
      return col.accessorFn(row, rowIndex);
    } catch {
      return undefined;
    }
  }
  const key = 'accessorKey' in col && col.accessorKey != null ? String(col.accessorKey) : columnDefId(col);
  return (row as Record<string, unknown>)[key];
}

function formatGroupCellLabel(value: unknown): string {
  if (value == null) return '—';
  const s = String(value).trim();
  return s || '—';
}

/**
 * Kolon değerine göre sıralayıp grup başlığı (+ isteğe bağlı grup alt toplamı) satırları ekler.
 */
export function buildDevExGroupedRows<T>(
  data: T[],
  columnId: string,
  columns: ColumnDef<T, any>[],
  options?: {
    groupSubtotalLabel?: string;
    footerSumColumns?: Array<{
      columnId: string;
      getValue: (row: T) => number;
      format?: (sum: number, rows: T[]) => ReactNode;
    }>;
  },
): T[] {
  if (!columnId || data.length === 0) return data;

  const col = columns.find((c) => columnDefId(c) === columnId);
  const indexed = data.map((row, i) => {
    const raw = col ? readRowColumnValue(col, row, i) : (row as Record<string, unknown>)[columnId];
    return { row, i, key: formatGroupCellLabel(raw) };
  });
  indexed.sort((a, b) => a.key.localeCompare(b.key, 'tr', { sensitivity: 'base' }) || a.i - b.i);

  const sumDefs = options?.footerSumColumns ?? [];
  const subtotalLabel = options?.groupSubtotalLabel || 'Grup toplamı';
  const out: T[] = [];

  let gi = 0;
  while (gi < indexed.length) {
    const key = indexed[gi].key;
    const group: typeof indexed = [];
    while (gi < indexed.length && indexed[gi].key === key) {
      group.push(indexed[gi]);
      gi += 1;
    }
    const first = group[0].row;
    const detailRows = group.map((g) => g.row);
    const safeKey = key.replace(/\s+/g, '_').slice(0, 80);

    const header = {
      ...(first as object),
      [columnId]: key === '—' ? '' : key,
      [DEVEX_GRID_ROW_KIND]: 'group' as const,
      [DEVEX_GRID_ROW_ID]: `devex-group-${columnId}-${safeKey}-${out.length}`,
      [DEVEX_GRID_GROUP_LABEL]: key,
      [DEVEX_GRID_GROUP_COLUMN_ID]: columnId,
    } as T;
    out.push(header);
    for (const r of detailRows) out.push(r);

    if (sumDefs.length > 0) {
      const sums: Record<string, number> = {};
      for (const def of sumDefs) {
        sums[def.columnId] = detailRows.reduce((acc, row) => acc + (Number(def.getValue(row)) || 0), 0);
      }
      const footer = {
        ...(first as object),
        [columnId]: key === '—' ? '' : key,
        [DEVEX_GRID_ROW_KIND]: 'subtotal' as const,
        [DEVEX_GRID_ROW_ID]: `devex-subtotal-${columnId}-${safeKey}-${out.length}`,
        [DEVEX_GRID_GROUP_LABEL]: subtotalLabel,
        [DEVEX_GRID_GROUP_COLUMN_ID]: columnId,
        [DEVEX_GRID_GROUP_SUMS]: sums,
      } as T;
      out.push(footer);
    }
  }

  return out;
}

function decorateColumnsForAutoGroupRows<T>(
  columns: ColumnDef<T, any>[],
  options: {
    getRowKind?: (row: T) => DevExGridRowKind | undefined;
    footerSumFormats: Map<string, (sum: number, rows: T[]) => ReactNode>;
    firstLabelColumnId?: string;
  },
): ColumnDef<T, any>[] {
  const { getRowKind, footerSumFormats, firstLabelColumnId } = options;
  return columns.map((col) => {
    const id = columnDefId(col);
    if (id === 'select' || id === 'actions') return col;
    const originalCell = col.cell;
    return {
      ...col,
      cell: (ctx: any) => {
        const row = ctx.row.original as T;
        const kind = resolveDevExGridRowKind(row, getRowKind);
        const rec = row as Record<string, unknown>;
        const metaKind = rec[DEVEX_GRID_ROW_KIND];

        // Yalnızca otomatik üretilen meta satırlarda hücreleri sadeleştir
        if (metaKind !== 'group' && metaKind !== 'subtotal') {
          if (typeof originalCell === 'function') return originalCell(ctx);
          if (originalCell != null) return flexRender(originalCell, ctx);
          const v = ctx.getValue?.();
          if (v == null || v === '') return null;
          return v as ReactNode;
        }

        if (kind === 'group') {
          const gCol = String(rec[DEVEX_GRID_GROUP_COLUMN_ID] || '');
          const label = String(rec[DEVEX_GRID_GROUP_LABEL] ?? '');
          // Tek grup başlığı: yalnızca gruplanan kolonda (yoksa ilk etiket kolonunda)
          const labelColId = gCol || firstLabelColumnId;
          if (id === labelColId) {
            return (
              <span className="font-bold tracking-wide text-indigo-950 dark:text-indigo-50">
                {label || '—'}
              </span>
            );
          }
          return null;
        }

        if (kind === 'subtotal') {
          const sums = rec[DEVEX_GRID_GROUP_SUMS] as Record<string, number> | undefined;
          if (sums && Object.prototype.hasOwnProperty.call(sums, id)) {
            const sum = Number(sums[id]) || 0;
            const fmt = footerSumFormats.get(id);
            return fmt ? fmt(sum, []) : sum;
          }
          // Tek «Grup toplamı» etiketi — ilk etiket kolonunda; grup kolonuyla çift yazma
          if (id === firstLabelColumnId) {
            return (
              <span className="font-bold uppercase tracking-wide text-amber-900 dark:text-amber-100">
                {String(rec[DEVEX_GRID_GROUP_LABEL] || 'Grup toplamı')}
              </span>
            );
          }
          return null;
        }

        if (typeof originalCell === 'function') return originalCell(ctx);
        if (originalCell != null) return flexRender(originalCell, ctx);
        const v = ctx.getValue?.();
        if (v == null || v === '') return null;
        return v as ReactNode;
      },
    };
  });
}

function withReportCodeCells<T>(cols: ColumnDef<T, any>[]): ColumnDef<T, any>[] {
  return cols.map((col) => {
    const id = columnDefId(col);
    if (!isReportCodeColumnId(id)) return col;
    const originalCell = col.cell;
    return {
      ...col,
      cell: (ctx) => {
        const row = ctx.row.original as Record<string, unknown>;
        const shown = reportDisplayCode(
          ctx.getValue(),
          row.barcode,
          row.code,
          row.product_code,
          row.productCode,
          row.itemCode,
          row.item_code,
        );
        if (typeof originalCell === 'function') {
          return originalCell({ ...ctx, getValue: () => shown });
        }
        return shown;
      },
    };
  });
}

/**
 * Sayısal / para kolonları: dar size / minSize / maxSize + sağ hizalama.
 * Id örüntüsü (qty, amount, price, tutar, miktar…) veya meta.type/format/filterKind.
 */
function withCompactNumericColumnSizing<T>(cols: ColumnDef<T, any>[]): ColumnDef<T, any>[] {
  return cols.map((col) => {
    const id = columnDefId(col);
    if (!id || id === 'select' || id === 'actions') return col;
    const meta = (col.meta as DevExCompactNumericMeta | undefined) ?? {};
    const sizing = resolveDevExCompactNumericSizing(id, meta, col.size);
    if (!sizing) return col;
    const nextMeta: GridColumnMeta = {
      ...meta,
      align: meta.align ?? 'right',
      format:
        meta.format ??
        (meta.filterKind === 'date' || meta.type === 'date'
          ? 'date'
          : meta.type === 'currency'
            ? 'currency'
            : 'number'),
    };
    return {
      ...col,
      size: sizing.size,
      minSize: col.minSize ?? sizing.minSize,
      maxSize: col.maxSize ?? sizing.maxSize,
      meta: nextMeta,
    };
  });
}

type SortableHeaderThProps<T> = {
  header: Header<T, unknown>;
  enableReorder: boolean;
  headerClassName: string;
  headerStyle: CSSProperties;
  darkMode: boolean;
  groupingEnabled: boolean;
  enableFiltering: boolean;
  resolvedGroupByColumnId: string | null;
  dragTitle: string;
  filterTitle: string;
  groupByTitle: string;
  groupClearTitle: string;
  onContextMenu: (e: ReactMouseEvent) => void;
  onGroupToggle: (columnId: string) => void;
  onOpenFilter: (headerId: string, anchorEl: HTMLElement, column: Column<T, unknown>) => void;
};

function SortableHeaderTh<T>({
  header,
  enableReorder,
  headerClassName,
  headerStyle,
  darkMode,
  groupingEnabled,
  enableFiltering,
  resolvedGroupByColumnId,
  dragTitle,
  filterTitle,
  groupByTitle,
  groupClearTitle,
  onContextMenu,
  onGroupToggle,
  onOpenFilter,
}: SortableHeaderThProps<T>) {
  const columnId = header.column.id;
  const canReorder = enableReorder && isColumnReorderable(columnId);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: columnId,
    disabled: !canReorder,
  });

  const style: CSSProperties = {
    ...headerStyle,
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.72 : undefined,
    zIndex: isDragging ? 2 : undefined,
    position: 'relative',
  };

  return (
    <th
      ref={setNodeRef}
      className={headerClassName}
      style={style}
      onContextMenu={onContextMenu}
    >
      <div className="flex items-center gap-1">
        <div
          className={`flex items-center gap-1 flex-1 min-w-0 select-none ${
            canReorder ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'
          }`}
          onClick={header.column.getToggleSortingHandler()}
          title={canReorder ? dragTitle : undefined}
          {...(canReorder ? { ...attributes, ...listeners } : {})}
        >
          {canReorder && (
            <GripVertical
              className={`w-2.5 h-2.5 shrink-0 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}
              aria-hidden
            />
          )}
          <span
            className="min-w-0 flex-1 whitespace-normal break-words leading-tight line-clamp-2 text-left"
            title={gridColumnHeaderLabel(header.column, columnId)}
          >
            {flexRender(header.column.columnDef.header, header.getContext())}
          </span>
          {header.column.getIsSorted() && (
            <span className="text-gray-600 shrink-0">
              {header.column.getIsSorted() === 'asc' ? (
                <ChevronUp className="w-2.5 h-2.5" />
              ) : (
                <ChevronDown className="w-2.5 h-2.5" />
              )}
            </span>
          )}
        </div>

        {groupingEnabled && columnId !== 'select' && columnId !== 'actions' && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onGroupToggle(columnId);
            }}
            className={`p-0.5 rounded transition-colors shrink-0 ${
              resolvedGroupByColumnId === columnId
                ? 'text-indigo-700 bg-indigo-100'
                : 'text-gray-400 hover:text-indigo-600 hover:bg-indigo-50'
            }`}
            title={resolvedGroupByColumnId === columnId ? groupClearTitle : groupByTitle}
          >
            <Layers className="w-2.5 h-2.5" />
          </button>
        )}

        {enableFiltering && header.column.getCanFilter() && columnId !== 'select' && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenFilter(header.id, e.currentTarget, header.column);
            }}
            className={`p-0.5 hover:bg-gray-200 rounded transition-colors shrink-0 ${
              header.column.getFilterValue() ? 'text-blue-600' : 'text-gray-500'
            }`}
            title={filterTitle}
          >
            <Filter className="w-2.5 h-2.5" />
          </button>
        )}
      </div>
    </th>
  );
}

export function DevExDataGrid<T>({
  data,
  columns,
  enableSorting = true,
  initialSorting,
  enableFiltering = true,
  enableColumnResizing = true,
  enablePagination = true,
  pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
  enableColumnVisibility = true,
  showColumnVisibilityToolbar = true,
  columnVisibility,
  onColumnVisibilityChange,
  enableColumnReorder = true,
  columnOrder: columnOrderProp,
  onColumnOrderChange,
  columnOrderStorageKey,
  storageNamespace,
  pageSize = 20,
  onRowClick,
  onRowDoubleClick,
  onRowContextMenu,
  height,
  enableSelection,
  onSelectionChange,
  selectedRowIds,
  density = 'compact',
  enableExcelExport = true,
  excelFileName = 'retailex_export',
  enablePrint,
  printTitle,
  onPrint,
  printDisabled,
  autoFooterSums = true,
  footerSumColumns,
  footerLabel,
  footerCurrency: footerCurrencyProp,
  groupByColumnId: groupByColumnIdProp,
  onGroupByColumnIdChange,
  enableGrouping: enableGroupingProp,
  getRowKind,
  getRowClassName,
  groupFooterSumColumns,
}: DevExDataGridProps<T>) {
  const [sorting, setSorting] = useState<SortingState>(() => initialSorting ?? []);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [pagination, setPagination] = useState<PaginationState>(() => ({
    pageIndex: 0,
    pageSize,
  }));
  const [rowSelection, setRowSelection] = useState<Record<string, boolean>>(selectedRowIds || {});
  const [internalColumnVisibility, setInternalColumnVisibility] = useState<Record<string, boolean>>(() =>
    mergeDevExDefaultColumnVisibility(columns as ColumnDef<any, any>[], columnVisibility),
  );
  const [internalColumnOrder, setInternalColumnOrder] = useState<string[]>(() =>
    resolveInitialColumnOrder({
      columnOrderProp,
      columnOrderStorageKey,
      storageNamespace,
      enableColumnReorder,
      columns: columns as ColumnDef<unknown, unknown>[],
    }),
  );
  const columnOrderLoadedKeyRef = useRef<string | null>(null);
  const [openFilterColumn, setOpenFilterColumn] = useState<string | null>(null);
  const [filterMenuAnchor, setFilterMenuAnchor] = useState<{ top: number; left: number } | null>(null);
  const [internalGroupByColumnId, setInternalGroupByColumnId] = useState<string | null>(
    groupByColumnIdProp ?? null,
  );
  const [columnHeaderMenu, setColumnHeaderMenu] = useState<{
    columnId: string;
    top: number;
    left: number;
  } | null>(null);
  const [groupPivotOpen, setGroupPivotOpen] = useState(false);
  const filterColumnsRef = useRef<Map<string, Column<any, unknown>>>(new Map());
  const { isMobile, isTablet } = useResponsive();
  const { tm } = useLanguage();
  const { darkMode } = useTheme();
  const { selectedFirm } = useFirmaDonem();
  const footerCurrency = useMemo(
    () =>
      String(footerCurrencyProp || '').trim() ||
      getFirmLedgerCurrency(selectedFirm, getAppDefaultCurrency() || getGlobalCurrency()),
    [footerCurrencyProp, selectedFirm],
  );
  const headerBg = darkMode ? 'bg-gray-700' : 'bg-[#E3F2FD]';
  const rowHover = darkMode ? 'hover:bg-gray-700' : 'hover:bg-[#BBDEFB]';
  const rowStripeEven = darkMode ? 'bg-gray-800' : 'bg-white';
  const rowStripeOdd = darkMode ? 'bg-gray-700' : 'bg-slate-50';
  const cellTextSize = density === 'comfortable' ? 'text-[13px] leading-snug' : 'text-[10px] leading-tight';
  const cellWeight = density === 'comfortable' ? 'font-medium' : '';
  const cellColor = darkMode ? 'text-gray-50' : 'text-gray-900';
  const cellBorder = darkMode ? 'border-gray-600' : 'border-gray-200';

  const resolvedGroupByColumnId =
    groupByColumnIdProp !== undefined ? groupByColumnIdProp : internalGroupByColumnId;
  /** Varsayılan açık (`enableGrouping={false}` ile kapatılır). */
  const groupingEnabled = enableGroupingProp !== false;

  const setGroupByColumnId = useCallback(
    (columnId: string | null) => {
      if (groupByColumnIdProp === undefined) {
        setInternalGroupByColumnId(columnId);
      }
      onGroupByColumnIdChange?.(columnId);
      setColumnHeaderMenu(null);
    },
    [groupByColumnIdProp, onGroupByColumnIdChange],
  );

  useEffect(() => {
    if (groupByColumnIdProp !== undefined) {
      setInternalGroupByColumnId(groupByColumnIdProp);
    }
  }, [groupByColumnIdProp]);

  const closeColumnHeaderMenu = useCallback(() => setColumnHeaderMenu(null), []);

  useEffect(() => {
    if (!columnHeaderMenu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeColumnHeaderMenu();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [columnHeaderMenu, closeColumnHeaderMenu]);

  const closeFilterMenu = useCallback(() => {
    setOpenFilterColumn(null);
    setFilterMenuAnchor(null);
  }, []);

  useEffect(() => {
    if (!openFilterColumn) return;
    const onScrollOrResize = () => closeFilterMenu();
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
    return () => {
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, [openFilterColumn, closeFilterMenu]);

  useEffect(() => {
    if (columnVisibility) {
      setInternalColumnVisibility(
        mergeDevExDefaultColumnVisibility(columns as ColumnDef<any, any>[], columnVisibility),
      );
    }
  }, [columnVisibility, columns]);

  // Kontrollü görünürlük yokken kolon seti değişince Durum/İşlem varsayılanını uygula
  // (resolvedColumnVisibility useMemo içinde merge edilir; ekstra effect yok)

  useEffect(() => {
    if (columnOrderProp != null) {
      setInternalColumnOrder(columnOrderProp);
    }
  }, [columnOrderProp]);

  useEffect(() => {
    setPagination((prev) => (prev.pageSize === pageSize ? prev : { ...prev, pageSize, pageIndex: 0 }));
  }, [pageSize]);

  useEffect(() => {
    setPagination((prev) => (prev.pageIndex === 0 ? prev : { ...prev, pageIndex: 0 }));
  }, [data.length]);

  const propColumnIdsFingerprint = useMemo(
    () =>
      columns
        .map((col) => columnDefId(col))
        .filter((id): id is string => Boolean(id)),
    [columns],
  );

  /** Açık key > otomatik (path/namespace + kolon hash). Kontrollü `columnOrder` iken LS yok. */
  const resolvedColumnOrderStorageKey = useMemo(() => {
    if (columnOrderStorageKey) return columnOrderStorageKey;
    if (columnOrderProp != null) return undefined;
    if (enableColumnReorder === false) return undefined;
    if (typeof window === 'undefined') return undefined;
    if (propColumnIdsFingerprint.length === 0) return undefined;
    return buildAutoColumnOrderStorageKey(storageNamespace, propColumnIdsFingerprint);
  }, [
    columnOrderStorageKey,
    columnOrderProp,
    enableColumnReorder,
    storageNamespace,
    propColumnIdsFingerprint,
  ]);

  /** Kolonlar geç gelirse / key değişirse kayıtlı sırayı yükle; şema değişiminde mevcut sırayı yeni key’e taşı. */
  useEffect(() => {
    if (columnOrderProp != null) return;
    if (!resolvedColumnOrderStorageKey) return;
    if (columnOrderLoadedKeyRef.current === resolvedColumnOrderStorageKey) return;
    const prevKey = columnOrderLoadedKeyRef.current;
    columnOrderLoadedKeyRef.current = resolvedColumnOrderStorageKey;
    const stored = loadColumnOrderFromStorage(resolvedColumnOrderStorageKey);
    if (stored && stored.length > 0) {
      setInternalColumnOrder(stored);
      return;
    }
    if (prevKey) {
      setInternalColumnOrder((current) => {
        if (current.length > 0) {
          saveColumnOrderToStorage(resolvedColumnOrderStorageKey, current);
        }
        return current;
      });
    }
  }, [resolvedColumnOrderStorageKey, columnOrderProp]);

  const resolvedPageSizeOptions = useMemo(() => {
    const total = data.length;
    const merged = [...pageSizeOptions];
    if (total > 0 && total > Math.max(...merged, 0) && !merged.includes(total)) {
      merged.push(total);
    }
    return [...new Set(merged.filter((n) => Number.isFinite(n) && n > 0))].sort((a, b) => a - b);
  }, [pageSizeOptions, data.length]);

  const resolvedColumnVisibility = useMemo(
    () =>
      mergeDevExDefaultColumnVisibility(
        columns as ColumnDef<any, any>[],
        columnVisibility ?? internalColumnVisibility,
      ),
    [columns, columnVisibility, internalColumnVisibility],
  );

  const handleColumnVisibilityChange = (updater: any) => {
    const nextVisibility =
      typeof updater === 'function'
        ? updater(resolvedColumnVisibility)
        : updater;
    if (!columnVisibility) {
      setInternalColumnVisibility(nextVisibility);
    }
    onColumnVisibilityChange?.(nextVisibility);
  };

  // Sync internal selection with prop if provided
  useEffect(() => {
    if (selectedRowIds) {
      setRowSelection(selectedRowIds);
    }
  }, [selectedRowIds]);

  const codedColumns = useMemo(
    () => withCompactNumericColumnSizing(withReportCodeCells(columns)),
    [columns],
  );

  const autoSumColumns = useMemo(() => {
    if (!autoFooterSums) return [] as NonNullable<DevExDataGridProps<T>['footerSumColumns']>;
    return codedColumns
      .filter((col) => isReportSumColumnId(columnDefId(col)))
      .map((col) => {
        const columnId = columnDefId(col);
        return {
          columnId,
          getValue: (row: T) => coerceReportNumber(readRowColumnValue(col, row, 0)),
          format: (sum: number) => formatReportFooterSum(sum, columnId, footerCurrency),
        };
      });
  }, [autoFooterSums, codedColumns, footerCurrency]);

  const mergedFooterSumColumns = useMemo(() => {
    const explicit = (footerSumColumns ?? []).map((def) => ({
      ...def,
      format:
        def.format ??
        ((sum: number) => formatReportFooterSum(sum, def.columnId, footerCurrency)),
    }));
    const ids = new Set(explicit.map((d) => d.columnId));
    return [...explicit, ...autoSumColumns.filter((d) => !ids.has(d.columnId))];
  }, [footerSumColumns, autoSumColumns, footerCurrency]);

  const resolvedGroupFooterSumColumns = useMemo(() => {
    if (groupFooterSumColumns != null) {
      return groupFooterSumColumns.map((def) => ({
        ...def,
        format:
          def.format ??
          ((sum: number) => formatReportFooterSum(sum, def.columnId, footerCurrency)),
      }));
    }
    return mergedFooterSumColumns;
  }, [groupFooterSumColumns, mergedFooterSumColumns, footerCurrency]);

  const dataHasExternalGroupRows = useMemo(() => {
    if (data.length === 0) return false;
    return data.some((row) => {
      const kind = resolveDevExGridRowKind(row, getRowKind);
      return kind === 'group' || kind === 'subtotal';
    });
  }, [data, getRowKind]);

  const tableSourceData = useMemo(() => {
    const colId = resolvedGroupByColumnId ? String(resolvedGroupByColumnId).trim() : '';
    if (!colId || dataHasExternalGroupRows) return data;
    return buildDevExGroupedRows(data, colId, codedColumns, {
      groupSubtotalLabel: tm('extractGroupSubtotal') || tm('gridGroupSubtotal') || 'Grup toplamı',
      footerSumColumns: resolvedGroupFooterSumColumns.length > 0 ? resolvedGroupFooterSumColumns : undefined,
    });
  }, [
    data,
    resolvedGroupByColumnId,
    dataHasExternalGroupRows,
    codedColumns,
    resolvedGroupFooterSumColumns,
    tm,
  ]);

  const groupPivotMetrics = useMemo(() => {
    const byId = new Map<
      string,
      { id: string; label: string; getValue: (row: T) => number }
    >();

    for (const def of resolvedGroupFooterSumColumns) {
      const col = codedColumns.find((c) => columnDefId(c) === def.columnId);
      const header = col?.header;
      const label =
        typeof header === 'string' && header.trim() ? header : def.columnId;
      byId.set(def.columnId, {
        id: def.columnId,
        label,
        getValue: def.getValue,
      });
    }

    for (const col of codedColumns) {
      const id = columnDefId(col);
      if (!id || byId.has(id) || !isReportSumColumnId(id)) continue;
      const header = col.header;
      const label = typeof header === 'string' && header.trim() ? header : id;
      byId.set(id, {
        id,
        label,
        getValue: (row: T) => {
          const raw = readRowColumnValue(col, row, 0);
          return coerceReportNumber(raw);
        },
      });
    }

    return Array.from(byId.values());
  }, [resolvedGroupFooterSumColumns, codedColumns]);

  const groupPivotRows = useMemo(() => {
    const colId = resolvedGroupByColumnId ? String(resolvedGroupByColumnId).trim() : '';
    if (!colId) return [];
    const groupCol = codedColumns.find((c) => columnDefId(c) === colId);
    const detailRows = data.filter((row) => {
      const kind = resolveDevExGridRowKind(row, getRowKind);
      return kind === 'detail';
    });
    return aggregateDevExGroupPivot(
      detailRows.length > 0 ? detailRows : data,
      (row) =>
        groupCol
          ? readRowColumnValue(groupCol, row, 0)
          : (row as Record<string, unknown>)[colId],
      groupPivotMetrics.map((m) => ({ id: m.id, getValue: m.getValue })),
    );
  }, [resolvedGroupByColumnId, codedColumns, data, getRowKind, groupPivotMetrics]);

  const groupPivotColumnLabel = useMemo(() => {
    const colId = resolvedGroupByColumnId ? String(resolvedGroupByColumnId).trim() : '';
    if (!colId) return '';
    const col = codedColumns.find((c) => columnDefId(c) === colId);
    const header = col?.header;
    if (typeof header === 'string' && header.trim()) return header;
    return colId;
  }, [resolvedGroupByColumnId, codedColumns]);

  const printEnabled = enablePrint ?? (onPrint != null || enableExcelExport);

  const footerSumFormats = useMemo(() => {
    const map = new Map<string, (sum: number, rows: T[]) => ReactNode>();
    for (const def of resolvedGroupFooterSumColumns) {
      map.set(
        def.columnId,
        def.format ?? ((sum: number) => formatReportFooterSum(sum, def.columnId, footerCurrency)),
      );
    }
    return map;
  }, [resolvedGroupFooterSumColumns, footerCurrency]);

  const firstLabelColumnId = useMemo(() => {
    for (const col of codedColumns) {
      const id = columnDefId(col);
      if (!id || id === 'select' || id === 'actions') continue;
      if (isReportSumColumnId(id)) continue;
      return id;
    }
    return codedColumns[0] ? columnDefId(codedColumns[0]) : undefined;
  }, [codedColumns]);

  const groupingDecoratedColumns = useMemo(() => {
    const needsDecorate =
      (!dataHasExternalGroupRows && Boolean(resolvedGroupByColumnId)) ||
      tableSourceData.some((row) => {
        const meta = (row as Record<string, unknown>)[DEVEX_GRID_ROW_KIND];
        return meta === 'group' || meta === 'subtotal';
      });
    if (!needsDecorate) return codedColumns;
    return decorateColumnsForAutoGroupRows(codedColumns, {
      getRowKind,
      footerSumFormats,
      firstLabelColumnId,
    });
  }, [
    codedColumns,
    dataHasExternalGroupRows,
    resolvedGroupByColumnId,
    tableSourceData,
    getRowKind,
    footerSumFormats,
    firstLabelColumnId,
  ]);

  const finalColumns = useMemo(() => {
    if (!enableSelection) return groupingDecoratedColumns;

    const selectionColumn: ColumnDef<T, any> = {
      id: 'select',
      header: ({ table }) => {
        const filtered = table.getFilteredRowModel().rows;
        const allSelected = filtered.length > 0 && filtered.every((row) => row.getIsSelected());
        return (
          <div className="px-1">
            <input
              type="checkbox"
              className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              title={tm('gridSelectAllTitle')}
              checked={allSelected}
              onChange={(e) => {
                if (e.target.checked) {
                  setRowSelection(
                    Object.fromEntries(filtered.map((row) => [row.id, true]))
                  );
                } else {
                  setRowSelection({});
                }
              }}
            />
          </div>
        );
      },
      cell: ({ row }) => (
        <div className="px-1" onClick={e => e.stopPropagation()}>
          <input
            type="checkbox"
            className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            checked={row.getIsSelected()}
            disabled={!row.getCanSelect()}
            onChange={row.getToggleSelectedHandler()}
          />
        </div>
      ),
      size: 40,
    };

    return [selectionColumn, ...groupingDecoratedColumns];
  }, [groupingDecoratedColumns, enableSelection, setRowSelection, tm]);

  const allColumnIds = useMemo(
    () =>
      finalColumns
        .map((col) => columnDefId(col))
        .filter((id): id is string => Boolean(id)),
    [finalColumns],
  );

  const resolvedColumnOrder = useMemo(() => {
    const preferred = columnOrderProp ?? internalColumnOrder;
    return mergeDevExColumnOrder(preferred.length > 0 ? preferred : allColumnIds, allColumnIds);
  }, [columnOrderProp, internalColumnOrder, allColumnIds]);

  const applyColumnOrder = useCallback(
    (nextRaw: string[]) => {
      const next = mergeDevExColumnOrder(nextRaw, allColumnIds);
      if (columnOrderProp == null) {
        setInternalColumnOrder(next);
      }
      onColumnOrderChange?.(next);
      if (resolvedColumnOrderStorageKey) {
        saveColumnOrderToStorage(resolvedColumnOrderStorageKey, next);
      }
    },
    [allColumnIds, columnOrderProp, onColumnOrderChange, resolvedColumnOrderStorageKey],
  );

  const columnReorderEnabled = enableColumnReorder !== false && !isMobile;

  const columnReorderSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const handleColumnDragEnd = useCallback(
    (event: DragEndEvent) => {
      if (!columnReorderEnabled) return;
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const activeId = String(active.id);
      const overId = String(over.id);
      if (!isColumnReorderable(activeId) || !isColumnReorderable(overId)) return;
      const oldIndex = resolvedColumnOrder.indexOf(activeId);
      const newIndex = resolvedColumnOrder.indexOf(overId);
      if (oldIndex < 0 || newIndex < 0) return;
      applyColumnOrder(arrayMove(resolvedColumnOrder, oldIndex, newIndex));
    },
    [columnReorderEnabled, resolvedColumnOrder, applyColumnOrder],
  );

  const table = useReactTable({
    data: tableSourceData,
    columns: finalColumns,
    state: {
      sorting,
      columnFilters,
      rowSelection,
      columnVisibility: resolvedColumnVisibility,
      columnOrder: resolvedColumnOrder,
      pagination,
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onRowSelectionChange: setRowSelection,
    onColumnVisibilityChange: handleColumnVisibilityChange,
    onColumnOrderChange: (updater) => {
      const next =
        typeof updater === 'function' ? updater(resolvedColumnOrder) : updater;
      applyColumnOrder(next);
    },
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    ...(enablePagination ? { getPaginationRowModel: getPaginationRowModel() } : {}),
    autoResetPageIndex: false,
    enableRowSelection: true,
    getRowId: (row, index) => {
      const metaId = (row as Record<string, unknown>)[DEVEX_GRID_ROW_ID];
      if (metaId != null && String(metaId).trim()) return String(metaId);
      const id = (row as Record<string, unknown>).id;
      if (id != null && String(id).trim()) return String(id);
      return String(index);
    },
    filterFns: {
      gridColumnFilter: gridColumnFilterFn,
    },
    defaultColumn: {
      filterFn: 'gridColumnFilter',
      enableColumnFilter: enableFiltering,
    },
  });

  const localeCode = safeGridLocale(tm('localeCode'));
  const activeFilterChips: ActiveFilterChip[] = useMemo(() => {
    if (!enableFiltering) return [];
    return columnFilters
      .filter((f) => isGridFilterActive(f.value))
      .map((f) => {
        const col = table.getColumn(f.id);
        const payload = f.value as GridFilterPayload | undefined;
        const mode = gridFilterOperatorMode(payload);
        const opKey = filterOperatorI18nKey(mode);
        const opLabel = tm(opKey);
        return {
          id: f.id,
          columnLabel: gridColumnHeaderLabel(col, f.id),
          operatorLabel: opLabel && opLabel !== opKey ? opLabel : tm(mode === 'notContains' ? 'reportColumnFiltersOpDoesNotContain' : mode),
          valueLabel: gridFilterChipValueLabel(payload, f.id, tm, localeCode),
        };
      });
  }, [columnFilters, enableFiltering, table, tm, localeCode]);

  const renderActiveFilterChips = () => (
    <ActiveFiltersBar
      chips={activeFilterChips}
      onRemove={(id) => {
        table.getColumn(id)?.setFilterValue(undefined);
        closeFilterMenu();
      }}
      onClearAll={() => {
        table.resetColumnFilters();
        closeFilterMenu();
      }}
      title={tm('activeFiltersBarTitle')}
      clearAllLabel={tm('reportColumnFiltersClearAll')}
      removeAriaLabel={tm('removeFilter')}
    />
  );

  // Notify parent of selection changes
  useEffect(() => {
    if (onSelectionChange) {
      const selectedRows = table.getSelectedRowModel().rows.map((row) => row.original);
      onSelectionChange(selectedRows);
    }
  }, [rowSelection]);

  const maxPageSizeOption = resolvedPageSizeOptions[resolvedPageSizeOptions.length - 1] ?? pagination.pageSize;

  const openFilterForHeader = useCallback(
    (headerId: string, anchorEl: HTMLElement, column: Column<any, unknown>) => {
      if (openFilterColumn === headerId) {
        closeFilterMenu();
        return;
      }
      filterColumnsRef.current.set(headerId, column);
      const rect = anchorEl.getBoundingClientRect();
      const menuWidth = 300;
      const menuHeight = 440;
      let top = rect.bottom + 4;
      if (top + menuHeight > window.innerHeight - 8) {
        top = Math.max(8, rect.top - menuHeight - 4);
      }
      const left = Math.max(8, Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 8));
      setFilterMenuAnchor({ top, left });
      setOpenFilterColumn(headerId);
    },
    [openFilterColumn, closeFilterMenu]
  );

  const filteredRowsForFooter = table.getFilteredRowModel().rows;
  const detailRowsForFooter = useMemo(
    () =>
      filteredRowsForFooter.filter(
        (r) => resolveDevExGridRowKind(r.original, getRowKind) === 'detail',
      ),
    [filteredRowsForFooter, getRowKind],
  );
  const resolvedFooterLabel = footerLabel ?? (mergedFooterSumColumns.length > 0 ? (tm('total') || 'Toplam') : undefined);
  const showFooterRow = Boolean(resolvedFooterLabel) || Boolean(mergedFooterSumColumns.length);
  const footerSumByColumnId = useMemo(() => {
    if (!mergedFooterSumColumns.length) return new Map<string, ReactNode>();
    const originals = detailRowsForFooter.map((r) => r.original);
    const map = new Map<string, ReactNode>();
    for (const def of mergedFooterSumColumns) {
      const sum = originals.reduce((acc, row) => acc + (Number(def.getValue(row)) || 0), 0);
      map.set(def.columnId, def.format ? def.format(sum, originals) : sum);
    }
    return map;
  }, [mergedFooterSumColumns, detailRowsForFooter]);

  const resolveRowVisualClass = useCallback(
    (row: T, idx: number, isSelected: boolean) => {
      const kind = resolveDevExGridRowKind(row, getRowKind);
      const kindClass = devExGridRowKindClass(kind, darkMode);
      const custom = getRowClassName?.(row, idx) ?? '';
      if (kindClass) {
        const selectedCls =
          enableSelection && isSelected ? (darkMode ? 'ring-1 ring-inset ring-blue-400/50' : 'ring-1 ring-inset ring-blue-300') : '';
        return `${kindClass} ${selectedCls} ${custom}`.trim();
      }
      const stripe = idx % 2 === 0 ? rowStripeEven : rowStripeOdd;
      const selectedCls =
        enableSelection && isSelected ? (darkMode ? 'bg-blue-900/50' : 'bg-blue-100') : '';
      return `${rowHover} ${stripe} ${selectedCls} ${custom}`.trim();
    },
    [getRowKind, getRowClassName, darkMode, rowHover, rowStripeEven, rowStripeOdd, enableSelection],
  );


  // Mobile Card View
  if (isMobile) {
    return (
      <div className={`flex flex-col h-full ${darkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
        {enableFiltering && activeFilterChips.length > 0 && (
          <div className={`shrink-0 px-3 py-2 border-b ${darkMode ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-white'}`}>
            {renderActiveFilterChips()}
          </div>
        )}
        {/* Mobile Cards */}
        <div className="flex-1 overflow-auto p-3 space-y-3">
          {table.getRowModel().rows.length === 0 ? (
            <div className="text-center py-12 text-gray-400">{tm('noDataFound')}</div>
          ) : (
            table.getRowModel().rows.map((row) => (
              <div
                key={row.id}
                className="bg-white border border-gray-200 shadow-sm rounded-lg p-3 sm:p-4 space-y-2 sm:space-y-3 active:scale-[0.98] transition-transform cursor-pointer"
                onClick={() => onRowClick?.(row.original)}
                onDoubleClick={() => onRowDoubleClick?.(row.original)}
                onContextMenu={(e) => onRowContextMenu?.(e, row.original)}
              >
                {/* Card Content */}
                {row.getVisibleCells().map((cell) => {
                  const header = cell.column.columnDef.header;
                  if (cell.column.id === 'select' || cell.column.id === 'actions') return null;

                  return (
                    <div key={cell.id} className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-1 sm:gap-2 py-1 sm:py-0">
                      <span className="text-xs sm:text-sm text-gray-500 font-medium sm:min-w-[100px]">
                        {typeof header === 'function' ? '' : header}
                      </span>
                      <span className="text-sm sm:text-base text-gray-900 sm:text-right flex-1 break-words">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </span>
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {showFooterRow && (
          <div className={`shrink-0 border-t-2 px-3 py-2 text-xs font-bold ${darkMode ? 'bg-gray-900 border-blue-500 text-blue-100' : 'bg-blue-50 border-blue-300 text-blue-900'}`}>
            {resolvedFooterLabel != null && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span>{resolvedFooterLabel}</span>
                <span className={darkMode ? 'text-gray-400' : 'text-blue-600/80'}>({detailRowsForFooter.length})</span>
              </div>
            )}
            {mergedFooterSumColumns.length > 0 && (
              <div className="mt-1 space-y-0.5">
                {mergedFooterSumColumns.map((def) => {
                  const node = footerSumByColumnId.get(def.columnId);
                  if (node == null) return null;
                  const col = table.getColumn(def.columnId);
                  return (
                    <div key={def.columnId} className="flex justify-between gap-3 tabular-nums">
                      <span className="font-semibold truncate">{gridColumnHeaderLabel(col, def.columnId)}</span>
                      <span>{node}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Mobile Pagination */}
        {enablePagination && (
          <div className="bg-white border-t border-gray-200 p-3 sm:p-4 space-y-2">
            <div className="text-xs sm:text-sm text-gray-600 text-center">
              {tm('page')} {table.getState().pagination.pageIndex + 1} {tm('of')} {table.getPageCount()} • {table.getFilteredRowModel().rows.length} {tm('records')}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
                className="flex-1 px-3 sm:px-4 py-2.5 sm:py-3 border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all text-sm sm:text-base font-medium rounded-lg min-h-[44px] active:scale-95"
              >
                {tm('previous')}
              </button>
              <button
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
                className="flex-1 px-3 sm:px-4 py-2.5 sm:py-3 border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all text-sm sm:text-base font-medium rounded-lg min-h-[44px] active:scale-95"
              >
                {tm('next')}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  const portalFilterColumn =
    openFilterColumn != null ? filterColumnsRef.current.get(openFilterColumn) : undefined;

  // Desktop Table View
  const visibleLeafColumns = table.getVisibleLeafColumns();
  const tableMinWidth = visibleLeafColumns.reduce((acc, col) => acc + col.getSize(), 0);
  const leafColumnsForVisibility = table
    .getAllLeafColumns()
    .filter((col) => col.id !== 'select' && col.getCanHide());

  return (
    <div
      className="flex flex-col h-full outline-none"
      style={{ height: height }}
      data-datagrid-root
      tabIndex={enableSelection ? 0 : undefined}
      onKeyDown={
        enableSelection
          ? (e) => {
              if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
                e.preventDefault();
                const rows = table.getFilteredRowModel().rows;
                setRowSelection(Object.fromEntries(rows.map((row) => [row.id, true])));
              }
            }
          : undefined
      }
    >
      {((enableColumnVisibility && showColumnVisibilityToolbar) || enableExcelExport || printEnabled || Boolean(resolvedGroupByColumnId)) && (
        <div className="flex items-center justify-end gap-1.5 px-3 py-1.5 bg-gray-50 border border-gray-300 border-b-0 shrink-0">
          {resolvedGroupByColumnId && (
            <button
              type="button"
              onClick={() => setGroupPivotOpen(true)}
              className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-indigo-800 bg-indigo-50 border border-indigo-200 rounded hover:bg-indigo-100"
              title={tm('gridPivotChartOpen') || 'Pivot / grafik göster'}
            >
              <BarChart3 className="w-3 h-3" />
              {tm('gridPivotChartShort') || 'Pivot / Grafik'}
            </button>
          )}
          {enableExcelExport && (
            <button
              type="button"
              onClick={() =>
                exportDataGridToExcel(
                  table.getFilteredRowModel().rows.map((r) => r.original),
                  columns,
                  excelFileName,
                )
              }
              className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 rounded hover:bg-emerald-100"
              title={tm('exportExcel') || 'Excel'}
            >
              <Download className="w-3 h-3" />
              Excel
            </button>
          )}
          {printEnabled && (
            <button
              type="button"
              disabled={printDisabled}
              onClick={() => {
                if (onPrint) {
                  onPrint();
                  return;
                }
                void printDataGridHtml(
                  table.getFilteredRowModel().rows.map((r) => r.original),
                  columns,
                  printTitle || excelFileName || tm('print') || 'Rapor',
                );
              }}
              className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-blue-800 bg-blue-50 border border-blue-200 rounded hover:bg-blue-100 disabled:opacity-40"
              title={tm('print') || 'Yazdır'}
            >
              <Printer className="w-3 h-3" />
              {tm('print') || 'Yazdır'}
            </button>
          )}
          {enableColumnVisibility && showColumnVisibilityToolbar && (
          <ColumnVisibilityMenu
            variant="grid"
            columns={leafColumnsForVisibility.map((col) => {
              const header = col.columnDef.header;
              const label = typeof header === 'string' ? header : col.id;
              return {
                id: col.id,
                label,
                visible: col.getIsVisible(),
              };
            })}
            onToggle={(columnId) => {
              handleColumnVisibilityChange((prev: Record<string, boolean>) => ({
                ...prev,
                [columnId]: !(prev[columnId] !== false),
              }));
            }}
            onShowAll={() => {
              handleColumnVisibilityChange(
                Object.fromEntries(leafColumnsForVisibility.map((col) => [col.id, true]))
              );
            }}
            onHideAll={() => {
              handleColumnVisibilityChange(
                Object.fromEntries(leafColumnsForVisibility.map((col) => [col.id, false]))
              );
            }}
          />
          )}
        </div>
      )}

      {enableFiltering && activeFilterChips.length > 0 && (
        <div className={`shrink-0 px-3 py-1.5 border border-b-0 ${darkMode ? 'border-gray-600 bg-gray-800' : 'border-gray-300 bg-sky-50/80'}`}>
          {renderActiveFilterChips()}
        </div>
      )}

      {/* Table Container */}
      <div className={`relative z-0 flex-1 overflow-auto border isolate ${darkMode ? 'border-gray-600 bg-gray-800' : 'border-gray-300 bg-white'}`}>
        <DndContext
          sensors={columnReorderSensors}
          collisionDetection={closestCenter}
          onDragEnd={handleColumnDragEnd}
        >
        <table
          className="border-collapse"
          style={{ tableLayout: 'fixed', width: '100%', minWidth: tableMinWidth }}
        >
          <colgroup>
            {visibleLeafColumns.map((col) => (
              <col key={col.id} style={gridColumnWidthStyle(col.getSize())} />
            ))}
          </colgroup>
          <thead className={`sticky top-0 z-[1] shadow-[0_1px_0_0_rgba(0,0,0,0.08)] ${headerBg}`}>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} className={`border-b ${darkMode ? 'border-gray-600' : 'border-gray-300'} ${headerBg}`}>
                <SortableContext
                  items={headerGroup.headers.map((h) => h.column.id)}
                  strategy={horizontalListSortingStrategy}
                >
                {headerGroup.headers.map((header) => (
                  <SortableHeaderTh
                    key={header.id}
                    header={header}
                    enableReorder={columnReorderEnabled}
                    headerClassName={`px-2 py-1 text-left border-r last:border-r-0 relative box-border ${headerBg} ${darkMode ? 'text-gray-100 border-gray-600' : 'text-gray-800 border-gray-300'} ${density === 'comfortable' ? 'text-xs font-semibold py-1.5' : 'text-[10px] font-medium'}`}
                    headerStyle={gridColumnWidthStyle(header.getSize())}
                    darkMode={darkMode}
                    groupingEnabled={groupingEnabled}
                    enableFiltering={enableFiltering}
                    resolvedGroupByColumnId={resolvedGroupByColumnId}
                    dragTitle={tm('dragAndDropToReorder') || 'Sürükle ve bırak ile yer değiştirebilirsiniz'}
                    filterTitle={tm('filterType')}
                    groupByTitle={tm('gridGroupByThisColumn') || 'Bu kolona göre grupla'}
                    groupClearTitle={tm('gridGroupClear') || 'Gruplamayı kaldır'}
                    onContextMenu={(e) => {
                      if (!groupingEnabled) return;
                      if (header.id === 'select' || header.id === 'actions') return;
                      e.preventDefault();
                      e.stopPropagation();
                      closeFilterMenu();
                      const menuW = 220;
                      const left = Math.max(8, Math.min(e.clientX, window.innerWidth - menuW - 8));
                      const top = Math.max(8, Math.min(e.clientY, window.innerHeight - 120));
                      setColumnHeaderMenu({ columnId: header.column.id, top, left });
                    }}
                    onGroupToggle={(id) => {
                      setGroupByColumnId(resolvedGroupByColumnId === id ? null : id);
                    }}
                    onOpenFilter={openFilterForHeader}
                  />
                ))}
                </SortableContext>
              </tr>
            ))}
          </thead>

          <tbody>
            {table.getRowModel().rows.map((row, idx) => {
              const kind = resolveDevExGridRowKind(row.original, getRowKind);
              const isChromeRow = kind === 'group' || kind === 'subtotal';
              return (
              <tr
                key={row.id}
                onClick={(e) => {
                  if (isChromeRow) return;
                  if (enableSelection && (e.ctrlKey || e.metaKey)) {
                    row.toggleSelected(!row.getIsSelected());
                    return;
                  }
                  onRowClick?.(row.original);
                }}
                onDoubleClick={() => {
                  if (isChromeRow) return;
                  onRowDoubleClick?.(row.original);
                }}
                onContextMenu={(e) => {
                  if (isChromeRow) return;
                  onRowContextMenu?.(e, row.original);
                }}
                className={`border-b transition-colors ${isChromeRow ? '' : 'cursor-pointer'} ${darkMode ? 'border-gray-700' : 'border-gray-200'} ${resolveRowVisualClass(row.original, idx, row.getIsSelected())}`}
              >
                {row.getVisibleCells().map((cell) => {
                  const align = resolveGridColumnAlign(cell.column, footerSumByColumnId.has(cell.column.id));
                  const cellKindBg =
                    kind === 'group'
                      ? darkMode
                        ? 'bg-indigo-900/85'
                        : 'bg-indigo-100'
                      : kind === 'subtotal'
                        ? darkMode
                          ? 'bg-amber-900/75'
                          : 'bg-amber-100'
                        : '';
                  return (
                    <td
                      key={cell.id}
                      className={`px-2 py-1 border-r last:border-r-0 box-border overflow-hidden ${cellTextSize} ${
                        kind === 'group' ? 'font-bold' : kind === 'subtotal' ? 'font-semibold' : cellWeight
                      } ${cellColor} ${cellBorder} ${gridColumnAlignClass(align)} ${cellKindBg}`}
                      style={gridColumnWidthStyle(cell.column.getSize())}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  );
                })}
              </tr>
              );
            })}
          </tbody>
          {showFooterRow && (() => {
            const footerBg = darkMode ? 'bg-gray-900' : 'bg-blue-50';
            const labelStart = visibleLeafColumns.findIndex(
              (c) => c.id !== 'select' && c.id !== 'actions' && !footerSumByColumnId.has(c.id),
            );
            const firstSumIdx = visibleLeafColumns.findIndex((c) => footerSumByColumnId.has(c.id));
            const labelEnd =
              labelStart >= 0
                ? firstSumIdx > labelStart
                  ? firstSumIdx
                  : visibleLeafColumns.length
                : -1;
            const labelColId = labelStart >= 0 ? visibleLeafColumns[labelStart]?.id : undefined;
            return (
              <tfoot className={`sticky bottom-0 z-[1] ${footerBg} shadow-[0_-1px_0_0_rgba(0,0,0,0.12)]`}>
                <tr
                  className={`border-t-2 ${footerBg} ${
                    darkMode ? 'border-blue-500' : 'border-blue-300'
                  }`}
                >
                  {visibleLeafColumns.map((col, idx) => {
                    if (labelStart >= 0 && idx > labelStart && idx < labelEnd) return null;
                    const sumNode = footerSumByColumnId.get(col.id);
                    const align = resolveGridColumnAlign(col, sumNode != null);
                    const colSpan = col.id === labelColId && labelEnd > labelStart + 1 ? labelEnd - labelStart : undefined;
                    return (
                      <td
                        key={`footer-${col.id}`}
                        colSpan={colSpan}
                        className={`px-2 py-1.5 border-r last:border-r-0 box-border ${cellTextSize} font-bold ${footerBg} ${gridColumnAlignClass(align)} ${
                          darkMode ? 'text-blue-200 border-gray-600' : 'text-blue-900 border-blue-200'
                        } ${sumNode != null ? 'whitespace-nowrap' : ''}`}
                        style={gridColumnWidthStyle(colSpan ? visibleLeafColumns.slice(labelStart, labelEnd).reduce((w, c) => w + c.getSize(), 0) : col.getSize())}
                      >
                        {sumNode != null ? (
                          sumNode
                        ) : col.id === labelColId && resolvedFooterLabel != null ? (
                          <span className={darkMode ? 'text-blue-100' : 'text-blue-800'}>
                            {resolvedFooterLabel}
                            <span className={`ml-1 font-semibold ${darkMode ? 'text-gray-400' : 'text-blue-600/80'}`}>
                              ({detailRowsForFooter.length})
                            </span>
                          </span>
                        ) : null}
                      </td>
                    );
                  })}
                </tr>
              </tfoot>
            );
          })()}
        </table>
        </DndContext>

        {/* No Data */}
        {table.getRowModel().rows.length === 0 && (
          <div className="text-center py-12 text-gray-400">
            {tm('noDataFound')}
          </div>
        )}
      </div>

      {openFilterColumn && filterMenuAnchor && portalFilterColumn &&
        createPortal(
          <div
            className="fixed inset-0"
            style={{ zIndex: FILTER_MENU_Z_INDEX, isolation: 'isolate', transform: 'translateZ(0)' }}
            onMouseDown={closeFilterMenu}
          >
            <div
              className="absolute"
              style={{ top: filterMenuAnchor.top, left: filterMenuAnchor.left }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <FilterMenu key={openFilterColumn} column={portalFilterColumn} onClose={closeFilterMenu} />
            </div>
          </div>,
          document.body
        )}

      {columnHeaderMenu &&
        createPortal(
          <div
            className="fixed inset-0"
            style={{ zIndex: FILTER_MENU_Z_INDEX, isolation: 'isolate', transform: 'translateZ(0)' }}
            onMouseDown={closeColumnHeaderMenu}
          >
            <div
              role="menu"
              aria-label={tm('gridGroupColumnMenuTitle') || 'Kolon menüsü'}
              className={`absolute min-w-[12rem] rounded-md border shadow-lg py-1 text-[11px] ${
                darkMode ? 'bg-gray-800 border-gray-600 text-gray-100' : 'bg-white border-gray-200 text-gray-800'
              }`}
              style={{ top: columnHeaderMenu.top, left: columnHeaderMenu.left }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                role="menuitem"
                className={`w-full text-left px-3 py-2 flex items-center gap-2 ${
                  darkMode ? 'hover:bg-gray-700' : 'hover:bg-sky-50'
                }`}
                onClick={() => setGroupByColumnId(columnHeaderMenu.columnId)}
              >
                <Layers className="w-3.5 h-3.5 text-indigo-600 shrink-0" aria-hidden />
                {tm('gridGroupByThisColumn') || 'Bu kolona göre grupla'}
              </button>
              {resolvedGroupByColumnId && (
                <button
                  type="button"
                  role="menuitem"
                  className={`w-full text-left px-3 py-2 ${
                    darkMode ? 'hover:bg-gray-700' : 'hover:bg-amber-50'
                  }`}
                  onClick={() => setGroupByColumnId(null)}
                >
                  {tm('gridGroupClear') || tm('gridClearGrouping') || 'Gruplamayı kaldır'}
                </button>
              )}
              {resolvedGroupByColumnId && (
                <button
                  type="button"
                  role="menuitem"
                  className={`w-full text-left px-3 py-2 flex items-center gap-2 ${
                    darkMode ? 'hover:bg-gray-700' : 'hover:bg-indigo-50'
                  }`}
                  onClick={() => {
                    setColumnHeaderMenu(null);
                    setGroupPivotOpen(true);
                  }}
                >
                  <BarChart3 className="w-3.5 h-3.5 text-indigo-600 shrink-0" aria-hidden />
                  {tm('gridPivotChartOpen') || 'Pivot / grafik göster'}
                </button>
              )}
            </div>
          </div>,
          document.body
        )}

      {groupPivotOpen && resolvedGroupByColumnId && (
        <DevExGroupPivotChartModal
          onClose={() => setGroupPivotOpen(false)}
          groupColumnLabel={groupPivotColumnLabel}
          rows={groupPivotRows}
          metrics={groupPivotMetrics.map(({ id, label }) => ({ id, label }))}
          defaultMetricId={groupPivotMetrics[0]?.id}
          storageNamespace={storageNamespace || excelFileName || 'default'}
          reportTitle={printTitle || excelFileName}
        />
      )}

      {/* Pagination */}
      {enablePagination && (
        <div
          className="relative flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-white border-t border-gray-200"
          style={{ zIndex: GRID_CHROME_Z_INDEX }}
        >
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <span>
              {tm('page')} {table.getState().pagination.pageIndex + 1} {tm('of')} {table.getPageCount()}
            </span>
            <span className="text-gray-400">|</span>
            <span>
              {table.getRowModel().rows.length} / {table.getFilteredRowModel().rows.length} {tm('records')}
            </span>
            <span className="text-gray-400">|</span>
            <span>
              {tm('show')} {pagination.pageSize}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => table.setPageIndex(0)}
              disabled={!table.getCanPreviousPage()}
              className="px-3 py-1.5 border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all text-sm"
            >
              {tm('first')}
            </button>
            <button
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              className="px-3 py-1.5 border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all text-sm"
            >
              {tm('previous')}
            </button>
            <button
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              className="px-3 py-1.5 border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all text-sm"
            >
              {tm('next')}
            </button>
            <button
              onClick={() => table.setPageIndex(table.getPageCount() - 1)}
              disabled={!table.getCanNextPage()}
              className="px-3 py-1.5 border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all text-sm"
            >
              {tm('last')}
            </button>

            <select
              value={pagination.pageSize}
              onChange={(e) => {
                const nextSize = Number(e.target.value);
                if (!Number.isFinite(nextSize) || nextSize <= 0) return;
                setPagination({ pageIndex: 0, pageSize: nextSize });
              }}
              className="px-3 py-1.5 border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            >
              {resolvedPageSizeOptions.map((size) => (
                <option key={size} value={size}>
                  {size === data.length && size === maxPageSizeOption && size > 100
                    ? `${tm('showAllColumns')} (${size})`
                    : `${tm('show')} ${size}`}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}
    </div>
  );
}
