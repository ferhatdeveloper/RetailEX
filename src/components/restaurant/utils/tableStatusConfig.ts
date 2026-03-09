/**
 * Merkezi masa durum renk & etiket konfigürasyonu
 * Tüm restaurant bileşenleri buradan import etmeli.
 */

export type TableStatus =
    | 'empty'
    | 'occupied'
    | 'kitchen'
    | 'served'
    | 'billing'
    | 'reserved'
    | 'cleaning';

export interface StatusConfig {
    label: string;
    bg: string;          // Kart arka plan rengi
    text: string;        // Metin rengi (beyaz kontrast için)
    shadow: string;      // Tailwind shadow class
    badgeBg: string;     // Badge arka plan (açık ton)
    badgeText: string;   // Badge metin rengi
    borderColor: string; // Accent border
    emoji: string;       // Hızlı görsel
}

export const TABLE_STATUS_CONFIG: Record<TableStatus, StatusConfig> = {
    empty: {
        label: 'Boş',
        bg: '#10b981',
        text: '#ffffff',
        shadow: 'shadow-emerald-500/20',
        badgeBg: '#d1fae5',
        badgeText: '#065f46',
        borderColor: '#34d399',
        emoji: '🟢',
    },
    occupied: {
        label: 'Dolu',
        bg: '#3b82f6',
        text: '#ffffff',
        shadow: 'shadow-blue-500/30',
        badgeBg: '#dbeafe',
        badgeText: '#1e40af',
        borderColor: '#60a5fa',
        emoji: '🔵',
    },
    kitchen: {
        label: 'Mutfakta',
        bg: '#f59e0b',
        text: '#ffffff',
        shadow: 'shadow-amber-500/30',
        badgeBg: '#fef3c7',
        badgeText: '#92400e',
        borderColor: '#fcd34d',
        emoji: '🟡',
    },
    served: {
        label: 'Serviste',
        bg: '#8b5cf6',
        text: '#ffffff',
        shadow: 'shadow-purple-500/30',
        badgeBg: '#ede9fe',
        badgeText: '#5b21b6',
        borderColor: '#a78bfa',
        emoji: '🟣',
    },
    billing: {
        label: 'Hesap',
        bg: '#ef4444',
        text: '#ffffff',
        shadow: 'shadow-red-500/40',
        badgeBg: '#fee2e2',
        badgeText: '#991b1b',
        borderColor: '#f87171',
        emoji: '🔴',
    },
    reserved: {
        label: 'Rezerve',
        bg: '#f59e0b',
        text: '#ffffff',
        shadow: 'shadow-amber-500/20',
        badgeBg: '#fef3c7',
        badgeText: '#92400e',
        borderColor: '#fcd34d',
        emoji: '🟠',
    },
    cleaning: {
        label: 'Temizlik',
        bg: '#64748b',
        text: '#ffffff',
        shadow: 'shadow-slate-500/20',
        badgeBg: '#f1f5f9',
        badgeText: '#334155',
        borderColor: '#94a3b8',
        emoji: '⚫',
    },
};

export const getStatusConfig = (status?: string): StatusConfig =>
    TABLE_STATUS_CONFIG[(status as TableStatus) ?? 'empty'] ?? TABLE_STATUS_CONFIG.empty;
