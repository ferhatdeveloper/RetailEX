/**
 * Web `src/components/restaurant/utils/tableStatusConfig.ts` ile aynı durum renkleri.
 */

export type TableStatus =
  | 'empty'
  | 'occupied'
  | 'kitchen'
  | 'served'
  | 'billing'
  | 'reserved'
  | 'cleaning';

export type StatusConfig = {
  label: string;
  bg: string;
  text: string;
  badgeBg: string;
  badgeText: string;
  borderColor: string;
};

export const TABLE_STATUS_CONFIG: Record<TableStatus, StatusConfig> = {
  empty: {
    label: 'Boş',
    bg: '#10b981',
    text: '#ffffff',
    badgeBg: '#d1fae5',
    badgeText: '#065f46',
    borderColor: '#34d399',
  },
  occupied: {
    label: 'Dolu',
    bg: '#3b82f6',
    text: '#ffffff',
    badgeBg: '#dbeafe',
    badgeText: '#1e40af',
    borderColor: '#60a5fa',
  },
  kitchen: {
    label: 'Mutfakta',
    bg: '#f59e0b',
    text: '#ffffff',
    badgeBg: '#fef3c7',
    badgeText: '#92400e',
    borderColor: '#fcd34d',
  },
  served: {
    label: 'Serviste',
    bg: '#8b5cf6',
    text: '#ffffff',
    badgeBg: '#ede9fe',
    badgeText: '#5b21b6',
    borderColor: '#a78bfa',
  },
  billing: {
    label: 'Hesap',
    bg: '#ef4444',
    text: '#ffffff',
    badgeBg: '#fee2e2',
    badgeText: '#991b1b',
    borderColor: '#f87171',
  },
  reserved: {
    label: 'Rezerve',
    bg: '#f59e0b',
    text: '#ffffff',
    badgeBg: '#fef3c7',
    badgeText: '#92400e',
    borderColor: '#fcd34d',
  },
  cleaning: {
    label: 'Temizlik',
    bg: '#64748b',
    text: '#ffffff',
    badgeBg: '#f1f5f9',
    badgeText: '#334155',
    borderColor: '#94a3b8',
  },
};

export const TABLE_STATUS_LEGEND: TableStatus[] = [
  'empty',
  'occupied',
  'kitchen',
  'served',
  'billing',
  'cleaning',
];

export function normalizeTableStatus(raw?: string | null): TableStatus {
  const s = String(raw || '')
    .toLocaleLowerCase('tr-TR')
    .trim();
  if (!s || s === 'empty' || s === 'boş' || s === 'bos' || s === 'free') return 'empty';
  if (s === 'occupied' || s === 'dolu' || s.includes('occ') || s === 'busy') return 'occupied';
  if (s === 'kitchen' || s.includes('mutfak') || s === 'cooking') return 'kitchen';
  if (s === 'served' || s.includes('servis') || s === 'ready') return 'served';
  if (s === 'billing' || s.includes('hesap') || s === 'bill') return 'billing';
  if (s === 'reserved' || s.includes('rezerv')) return 'reserved';
  if (s === 'cleaning' || s.includes('temiz')) return 'cleaning';
  return 'empty';
}

export function getStatusConfig(status?: string | null): StatusConfig {
  return TABLE_STATUS_CONFIG[normalizeTableStatus(status)];
}

export function formatCompactTotal(total: number): string {
  const n = Number(total) || 0;
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return String(Math.round(n));
}
