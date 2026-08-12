import type { Customer } from '../core/types';
import type { RestaurantCallerIdConfig, RestaurantCallerIdEvent } from '../components/restaurant/types';
import { getBridgeUrl } from '../utils/env';

const PHONE_KEYS = [
    'phone',
    'telefon',
    'caller',
    'caller_number',
    'callerid',
    'callerId',
    'from',
    'numara',
    'PhoneNumber',
    'gsm',
    'mobile',
] as const;

function onlyDigits(s: string): string {
    return s.replace(/\D/g, '');
}

function phoneMatchCandidates(raw: string): string[] {
    const d0 = onlyDigits(raw);
    if (!d0) return [];
    const set = new Set<string>();

    const push = (v: string) => {
        const x = onlyDigits(v);
        if (!x) return;
        set.add(x);
        if (x.length >= 10) set.add(x.slice(-10));
        if (x.length >= 7) set.add(x.slice(-7));
    };

    push(d0);

    // Sık görülen uluslararası ön ek varyasyonları
    if (d0.startsWith('00')) push(d0.slice(2));
    if (d0.startsWith('90') && d0.length > 10) push(d0.slice(2));
    if (d0.startsWith('964') && d0.length > 10) push(d0.slice(3));
    if (d0.startsWith('0') && d0.length > 10) push(d0.slice(1));

    return Array.from(set);
}

/** TR eşleştirme: son 10 haneyi karşılaştır (0 ile başlayan yerel / 90 uluslararası). */
export function phoneDigitsForMatch(raw: string): string {
    const d = onlyDigits(raw);
    if (d.length >= 10) {
        return d.slice(-10);
    }
    return d;
}

export function extractPhoneFromObject(o: Record<string, unknown>): string | null {
    for (const k of PHONE_KEYS) {
        const v = o[k];
        if (typeof v === 'string' && v.trim()) {
            return v.replace(/\s+/g, '').trim();
        }
    }
    return null;
}

export function parseCallerIdPollPayload(data: unknown): RestaurantCallerIdEvent | null {
    if (!data || typeof data !== 'object') return null;
    const o = data as Record<string, unknown>;
    const phone = extractPhoneFromObject(o);
    if (!phone) return null;
    const name =
        (typeof o.name === 'string' && o.name.trim()) ||
        (typeof o.caller_name === 'string' && o.caller_name.trim()) ||
        undefined;
    const receivedAt =
        (typeof o.receivedAt === 'string' && o.receivedAt) ||
        (typeof o.ts === 'string' && o.ts) ||
        new Date().toISOString();
    return { phone, name, receivedAt };
}

function withTokenQuery(url: string, apiToken: string): string {
    const t = apiToken.trim();
    if (!t) return url;
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}token=${encodeURIComponent(t)}`;
}

/**
 * Sanal: boş pollUrl → pg_bridge `/api/caller_id/last`.
 * Fiziksel: zorunlu özel URL (seri köprüsü, yerel HTTP vb.).
 */
/** FSK/DTMF Caller ID kutularının sık gönderdiği satırlardan numara çıkarır. */
export function parsePhoneFromCallerIdRawLine(raw: string): string | null {
    const s = raw.trim();
    if (!s) return null;
    const nmbr = s.match(/NMBR\s*[=:]\s*([+\d\s().-]+)/i);
    if (nmbr?.[1]) {
        const p = nmbr[1].replace(/\s+/g, '').trim();
        if (p) return p;
    }
    const digits = s.replace(/\D/g, '');
    if (digits.length >= 10) {
        return digits;
    }
    const loose = s.match(/(\+90|90|0)?([5][0-9]{9})\b/);
    if (loose) {
        return (loose[1] || '') + loose[2];
    }
    return null;
}

export function resolveCallerIdPollUrl(config: RestaurantCallerIdConfig): string | null {
    if (config.mode === 'off' || config.mode === 'physical_serial') return null;
    if (config.mode === 'virtual_pbx') {
        const base = config.pollUrl.trim()
            ? config.pollUrl.trim()
            : `${getBridgeUrl()}/api/caller_id/last`;
        return withTokenQuery(base, config.apiToken);
    }
    if (config.mode === 'physical_device') {
        const u = config.pollUrl.trim();
        if (!u) return null;
        return withTokenQuery(u, config.apiToken);
    }
    return null;
}

/** Adres satırı: adres, ilçe, şehir, posta kodu */
export function formatCustomerAddressLines(c: Customer): { singleLine: string; hasAny: boolean } {
    const parts = [c.address, c.district, c.city, c.postal_code]
        .map((p) => (typeof p === 'string' ? p.trim() : ''))
        .filter(Boolean);
    return {
        singleLine: parts.join(', '),
        hasAny: parts.length > 0,
    };
}

function lastNDigits(s: string, n: number): string {
    const d = onlyDigits(s);
    return d.length >= n ? d.slice(-n) : d;
}

export function findCustomerByCallerPhone(customers: Customer[], callerPhone: string): Customer | undefined {
    const targetCandidates = phoneMatchCandidates(callerPhone);
    const callerDigits = onlyDigits(callerPhone);
    const callerTail10 = callerDigits.length >= 10 ? callerDigits.slice(-10) : '';
    if (targetCandidates.length === 0 && !callerTail10) return undefined;

    return customers.find((c) => {
        const candidates = [c.phone, c.phone2].filter(Boolean) as string[];
        return candidates.some((p) => {
            const customerCandidates = phoneMatchCandidates(p);
            if (targetCandidates.length > 0) {
                const setHit = customerCandidates.some((cc) => targetCandidates.includes(cc));
                if (setHit) return true;
            }
            if (callerTail10.length === 10) {
                const pt = lastNDigits(p, 10);
                if (pt.length >= 10 && pt === callerTail10) return true;
            }
            return false;
        });
    });
}

export const defaultRestaurantCallerIdConfig = (): RestaurantCallerIdConfig => ({
    mode: 'off',
    pollUrl: '',
    pollIntervalMs: 2500,
    apiToken: '',
    serialPort: '',
    serialBaud: 9600,
});
