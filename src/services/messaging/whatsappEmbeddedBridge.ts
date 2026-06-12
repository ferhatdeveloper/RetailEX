import { IS_TAURI } from '../../utils/env';

/**
 * Doğrudan WhatsApp (QR / Baileys) — tarayıcıda Baileys çalışmaz; yerel HTTP köprüsü gerekir.
 *
 * Köprü sözleşmesi (whatshapp veya kendi sunucunuz):
 *   GET  {baseUrl}/status
 *        → { "status": "scanning" | "connected" | "disconnected", "qr"?: string }
 *        `qr`: PNG data URL (image/png;base64,...) veya ham metin (UI ham ise gösterilmez)
 *   POST {baseUrl}/send
 *        Body: { "to": "905551234567", "text": "..." }
 *        İsteğe bağlı: Authorization: Bearer {token}
 */

export interface EmbeddedBridgeConfig {
    whatsapp_base_url?: string | null;
    whatsapp_token?: string | null;
}

/**
 * Sadece başka origin’deki yerel HTTP köprüsü için Tauri kullan.
 * Aynı origin (ör. Vite `/__wa_bridge` proxy) → normal `fetch` (CORS yok).
 */
function shouldUseTauriFetch(url: string): boolean {
    if (!IS_TAURI || typeof window === 'undefined') return false;
    try {
        const u = new URL(url);
        const page = new URL(window.location.href);
        if (u.origin === page.origin) return false;
        return (
            u.protocol === 'http:' &&
            (u.hostname === 'localhost' || u.hostname === '127.0.0.1')
        );
    } catch {
        return false;
    }
}

/** Geliştirmede whatshapp :3000 → Vite proxy; canlıda `/__wa_bridge` aynı origin. */
function resolveBridgeBaseUrl(cfg: EmbeddedBridgeConfig): string {
    let base = baseUrl(cfg);
    if (!base) return '';
    if (typeof window !== 'undefined' && isStaleEmbeddedBridgeUrl(base)) {
        base = '/__wa_bridge';
    }
    if (typeof window !== 'undefined') {
        if (base.startsWith('/')) {
            return `${window.location.origin}${base}`.replace(/\/$/, '');
        }
        try {
            const u = new URL(base);
            const isLoopback = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
            const p = u.port || (u.protocol === 'https:' ? '443' : '80');
            if (isLoopback && p === '3000') {
                return `${window.location.origin}/__wa_bridge`.replace(/\/$/, '');
            }
        } catch {
            /* ignore */
        }
    }
    return base;
}

async function bridgeFetch(url: string, init?: RequestInit): Promise<Response> {
    if (shouldUseTauriFetch(url)) {
        try {
            const { fetch: tauriFetch } = await import('@tauri-apps/plugin-http');
            const { signal: _s, ...rest } = init ?? {};
            return await tauriFetch(url, {
                ...rest,
                connectTimeout: 30_000,
            });
        } catch (e) {
            console.warn('[embedded-wa] Tauri HTTP başarısız, tarayıcı fetch deneniyor:', e);
        }
    }
    return fetch(url, init);
}

function normalizePhoneDigits(raw: string): string {
    let p = raw.replace(/\D/g, '');
    if (p.length === 10) p = '90' + p;
    return p;
}

export type EmbeddedBridgeStatus = 'scanning' | 'connected' | 'disconnected' | string;

export interface EmbeddedBridgeStatusResponse {
    ok: boolean;
    status?: EmbeddedBridgeStatus;
    /** PNG data URL veya boş */
    qr?: string | null;
    error?: string;
}

/** Canlıda geçersiz / geçici harici köprü URL'lerini aynı origin yoluna çevir. */
export function isStaleEmbeddedBridgeUrl(url: string | null | undefined): boolean {
    const u = (url || '').trim().toLowerCase();
    if (!u) return false;
    return (
        u.includes('trycloudflare') ||
        u.includes('ngrok') ||
        u.includes('loca.lt') ||
        (!import.meta.env.DEV && u.startsWith('http://') && !u.includes('127.0.0.1') && !u.includes('localhost'))
    );
}

function baseUrl(cfg: EmbeddedBridgeConfig): string {
    return (cfg.whatsapp_base_url || '').trim().replace(/\/$/, '');
}

function authHeaders(cfg: EmbeddedBridgeConfig): Record<string, string> {
    const h: Record<string, string> = { Accept: 'application/json' };
    const t = cfg.whatsapp_token?.trim();
    if (t) h.Authorization = `Bearer ${t}`;
    return h;
}

export async function getEmbeddedBridgeStatus(
    cfg: EmbeddedBridgeConfig
): Promise<EmbeddedBridgeStatusResponse> {
    const base = resolveBridgeBaseUrl(cfg);
    if (!base) return { ok: false, error: 'Köprü URL (WhatsApp base URL) girilmedi.' };
    try {
        const res = await bridgeFetch(`${base}/status`, {
            method: 'GET',
            headers: authHeaders(cfg),
            signal: typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal
                ? AbortSignal.timeout(15_000)
                : undefined,
        });
        const text = await res.text();
        if (!res.ok) {
            return {
                ok: false,
                error: `HTTP ${res.status}${text ? `: ${text.slice(0, 200)}` : ''}`,
            };
        }
        let data: {
            status?: string;
            qr?: string | null;
            data?: { status?: string; qr?: string | null };
            success?: boolean;
        };
        try {
            data = JSON.parse(text) as typeof data;
        } catch {
            return {
                ok: false,
                error:
                    'Köprü JSON döndürmedi (HTML veya boş yanıt). whatshapp `npm run dev` ile açık mı, adres doğru mu?',
            };
        }
        const inner = data.data && typeof data.data === 'object' ? data.data : data;
        const status = inner.status ?? data.status;
        const qr = inner.qr ?? data.qr ?? null;
        if (status === undefined && qr == null && text.length < 5) {
            return { ok: false, error: 'Köprü boş yanıt döndü.' };
        }
        return {
            ok: true,
            status,
            qr,
        };
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        const hint =
            msg === 'Failed to fetch' || msg.includes('NetworkError')
                ? ' Ağ/CORS: köprü çalışıyor mu? Tauri masaüstünde yerel HTTP için izin gerekir.'
                : '';
        return { ok: false, error: msg + hint };
    }
}

/** Oturumu kapatır, köprü verisini siler ve yeni QR üretir (POST /reset). */
export async function resetEmbeddedBridgeSession(
    cfg: EmbeddedBridgeConfig
): Promise<{ ok: boolean; status?: string; qr?: string | null; error?: string; message?: string }> {
    const base = resolveBridgeBaseUrl(cfg);
    if (!base) return { ok: false, error: 'Köprü URL girilmedi.' };
    try {
        const res = await bridgeFetch(`${base}/reset`, {
            method: 'POST',
            headers: {
                ...authHeaders(cfg),
                'Content-Type': 'application/json',
            },
            body: '{}',
            signal: typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal
                ? AbortSignal.timeout(30_000)
                : undefined,
        });
        const text = await res.text();
        if (!res.ok) {
            return { ok: false, error: `HTTP ${res.status}${text ? `: ${text.slice(0, 200)}` : ''}` };
        }
        const data = JSON.parse(text) as { status?: string; qr?: string | null; error?: string; message?: string };
        return {
            ok: true,
            status: data.status,
            qr: data.qr ?? null,
            error: data.error,
            message: data.message,
        };
    } catch (e: unknown) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
}

export async function sendViaEmbeddedBridge(
    cfg: EmbeddedBridgeConfig,
    to: string,
    text: string
): Promise<{ success: boolean; error?: string }> {
    const base = resolveBridgeBaseUrl(cfg);
    if (!base) return { success: false, error: 'Köprü URL eksik.' };
    const digits = normalizePhoneDigits(to);
    try {
        const res = await bridgeFetch(`${base}/send`, {
            method: 'POST',
            headers: {
                ...authHeaders(cfg),
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ to: digits, text }),
            signal: typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal
                ? AbortSignal.timeout(60_000)
                : undefined,
        });
        if (!res.ok) {
            const t = await res.text().catch(() => '');
            try {
                const j = JSON.parse(t) as { error?: string; message?: string };
                return { success: false, error: j.error || j.message || t || `HTTP ${res.status}` };
            } catch {
                return { success: false, error: t || `HTTP ${res.status}` };
            }
        }
        return { success: true };
    } catch (e: unknown) {
        return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
}
