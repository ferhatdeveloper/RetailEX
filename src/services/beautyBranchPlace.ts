/** Şube adres metninin sonuna eklenen yer bilgisi. Yeni kolon açılmaz. */
export const BRANCH_PLACE_MARK = '\u001e';

export type BeautyBranchPlace = {
    country?: string;
    province?: string;
    district?: string;
    neighborhood?: string;
    outerDoor?: string;
    innerDoor?: string;
    directions?: string;
    dial?: string;
    logo?: string;
};

const PLACE_KEYS: (keyof BeautyBranchPlace)[] = [
    'country', 'province', 'district', 'neighborhood',
    'outerDoor', 'innerDoor', 'directions', 'dial', 'logo',
];

export const EMPTY_BRANCH_PLACE: Required<BeautyBranchPlace> = {
    country: '',
    province: '',
    district: '',
    neighborhood: '',
    outerDoor: '',
    innerDoor: '',
    directions: '',
    dial: '',
    logo: '',
};

function cleanPlace(place?: BeautyBranchPlace | null): BeautyBranchPlace {
    const next: BeautyBranchPlace = {};
    if (!place) return next;
    for (const key of PLACE_KEYS) {
        const value = String(place[key] ?? '').trim();
        if (!value) continue;
        if (key === 'logo' && !value.startsWith('data:image/')) continue;
        next[key] = value;
    }
    return next;
}

export function packBranchAddress(address?: string | null, place?: BeautyBranchPlace | null): string | null {
    const raw = String(address ?? '');
    const cut = raw.indexOf(BRANCH_PLACE_MARK);
    const line = (cut >= 0 ? raw.slice(0, cut) : raw).trim();
    const extra = cleanPlace(place);
    if (!Object.keys(extra).length) return line || null;
    return `${line}${BRANCH_PLACE_MARK}${JSON.stringify(extra)}`;
}

export function unpackBranchAddress(raw?: string | null): { address: string; place: BeautyBranchPlace } {
    const text = String(raw ?? '');
    const cut = text.indexOf(BRANCH_PLACE_MARK);
    if (cut < 0) return { address: text, place: {} };
    const address = text.slice(0, cut).trim();
    try {
        const parsed = JSON.parse(text.slice(cut + BRANCH_PLACE_MARK.length)) as BeautyBranchPlace;
        return { address, place: cleanPlace(parsed) };
    } catch {
        return { address, place: {} };
    }
}
