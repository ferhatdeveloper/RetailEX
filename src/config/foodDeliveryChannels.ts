/**
 * Yemek platformları — paket servis sipariş kaynağı (note.channel ile saklanır).
 * Resmi REST API’ler çoğunlukla iş ortağı paneli / aracı firma ile verilir; uygulama tarafında ortak kanal kimliği kullanılır.
 */

export type FoodDeliveryChannelId =
    | 'manual'
    | 'yemeksepeti'
    | 'getir_yemek'
    | 'trendyol_yemek'
    | 'migros_yemek'
    | 'fuudy'
    | 'other';

export type FoodDeliveryChannelMeta = {
    id: FoodDeliveryChannelId;
    label: string;
    shortLabel: string;
    /** Tailwind-friendly accent (border / text) */
    accentClass: string;
    /** Açıklama / entegrasyon notu */
    description: string;
};

export const FOOD_DELIVERY_CHANNELS: FoodDeliveryChannelMeta[] = [
    {
        id: 'manual',
        label: 'Manuel / Telefon',
        shortLabel: 'Manuel',
        accentClass: 'bg-slate-100 text-slate-700 border-slate-200',
        description: 'Restoran içinden veya telefonla girilen siparişler.',
    },
    {
        id: 'yemeksepeti',
        label: 'Yemeksepeti',
        shortLabel: 'YS',
        accentClass: 'bg-orange-50 text-orange-800 border-orange-200',
        description: 'Yemeksepeti iş ortağı API veya aracı entegrasyon (Posentegra vb.) ile webhook.',
    },
    {
        id: 'getir_yemek',
        label: 'Getir Yemek',
        shortLabel: 'Getir',
        accentClass: 'bg-purple-50 text-purple-800 border-purple-200',
        description: 'Getir Yemek iş ortağı kanalı veya orta katman webhook.',
    },
    {
        id: 'trendyol_yemek',
        label: 'Trendyol Yemek',
        shortLabel: 'Trendyol',
        accentClass: 'bg-orange-50 text-orange-900 border-orange-300',
        description: 'Trendyol Yemek panel / entegratör üzerinden gelen siparişler.',
    },
    {
        id: 'migros_yemek',
        label: 'Migros Yemek',
        shortLabel: 'Migros',
        accentClass: 'bg-yellow-50 text-yellow-900 border-yellow-300',
        description: 'Migros Yemek kanalı.',
    },
    {
        id: 'fuudy',
        label: 'Fuudy',
        shortLabel: 'Fuudy',
        accentClass: 'bg-rose-50 text-rose-800 border-rose-200',
        description: 'Fuudy ve benzeri kanallar.',
    },
    {
        id: 'other',
        label: 'Diğer platform',
        shortLabel: 'Diğer',
        accentClass: 'bg-sky-50 text-sky-800 border-sky-200',
        description: 'Diğer üçüncü parti veya özel entegrasyon.',
    },
];

const byId = Object.fromEntries(FOOD_DELIVERY_CHANNELS.map((c) => [c.id, c])) as Record<
    FoodDeliveryChannelId,
    FoodDeliveryChannelMeta
>;

export function getFoodDeliveryChannelMeta(id: string | undefined | null): FoodDeliveryChannelMeta {
    if (id && id in byId) return byId[id as FoodDeliveryChannelId];
    return byId.manual;
}

/** Webhook / dış sistemden gelen serbest string kanal adını güvenli kimliğe çevirir */
export function normalizeFoodDeliveryChannel(raw: string | undefined | null): FoodDeliveryChannelId {
    const s = (raw ?? '').trim().toLowerCase();
    if (!s) return 'manual';
    if (s.includes('yemeksepeti') || s === 'ys' || s === 'ys_pro') return 'yemeksepeti';
    if (s.includes('getir')) return 'getir_yemek';
    if (s.includes('trendyol')) return 'trendyol_yemek';
    if (s.includes('migros')) return 'migros_yemek';
    if (s.includes('fuudy')) return 'fuudy';
    if (
        FOOD_DELIVERY_CHANNELS.some((c) => c.id === s)
    ) {
        return s as FoodDeliveryChannelId;
    }
    return 'other';
}
