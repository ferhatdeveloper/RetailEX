/**
 * Atak SMS API — whatshapp projesindeki `lib/sms/atak-sms.ts` ile uyumlu (fetch tabanlı).
 * Panel: https://panel.ataksms.com:9588
 */

export interface AtakSmsConfig {
    smsUser?: string | null;
    smsPassword?: string | null;
    smsSender?: string | null;
}

function basicAuthHeader(user: string, password: string): string {
    const raw = `${user}:${password}`;
    if (typeof Buffer !== 'undefined' && typeof Buffer.from === 'function') {
        return 'Basic ' + Buffer.from(raw, 'utf8').toString('base64');
    }
    return 'Basic ' + btoa(unescape(encodeURIComponent(raw)));
}

export class AtakSmsService {
    private baseUrl = 'https://panel.ataksms.com:9588';
    private config: AtakSmsConfig;

    constructor(config: AtakSmsConfig) {
        this.config = config;
    }

    async getBalance(): Promise<{ success: boolean; credit?: number; error?: string; rawData?: unknown }> {
        try {
            const u = this.config.smsUser || '';
            const p = this.config.smsPassword || '';
            if (!u || !p) return { success: false, error: 'SMS kullanıcı/şifre yok' };

            const authHeader = basicAuthHeader(u, p);
            const response = await fetch(`${this.baseUrl}/user/credit`, {
                method: 'GET',
                headers: {
                    Authorization: authHeader,
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                },
                signal: AbortSignal.timeout(15_000),
            });
            const root = await response.json().catch(() => ({}));

            const payload =
                root && typeof root === 'object' && root.data !== undefined && typeof root.data === 'object'
                    ? root.data
                    : root && typeof root === 'object' && (root as { result?: unknown }).result && typeof (root as { result: unknown }).result === 'object'
                      ? (root as { result: Record<string, unknown> }).result
                      : root;

            let rawCredit =
                (payload as Record<string, unknown>)?.credit ??
                (payload as Record<string, unknown>)?.balance ??
                (payload as Record<string, unknown>)?.amount ??
                (root as Record<string, unknown>)?.credit ??
                0;

            let credit = 0;
            if (typeof rawCredit === 'string') {
                const trimmed = rawCredit.trim();
                credit = trimmed.includes(',') && !trimmed.includes('.')
                    ? parseFloat(trimmed.replace(',', '.'))
                    : parseFloat(trimmed.replace(/\./g, '').replace(',', '.'));
            } else {
                credit = Number(rawCredit);
            }
            if (!Number.isFinite(credit)) credit = 0;

            return { success: true, credit, rawData: root };
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            return { success: false, error: msg };
        }
    }

    async sendSms(to: string, content: string): Promise<{ success: boolean; data?: unknown; error?: string }> {
        try {
            let phone = to.replace(/\D/g, '');
            if (phone.length < 10) {
                return { success: false, error: 'Geçersiz telefon: en az 10 hane gerekir.' };
            }
            if (phone.length === 10) phone = '90' + phone;

            const u = this.config.smsUser || '';
            const p = this.config.smsPassword || '';
            if (!u || !p) return { success: false, error: 'SMS kullanıcı/şifre ayarlı değil.' };

            const payload = {
                type: 1,
                sendingType: 0,
                title: 'Bilgilendirme Mesaji',
                content,
                number: phone,
                encoding: 0,
                sender: this.config.smsSender || 'BILGI',
                validity: 60,
            };

            const authHeader = basicAuthHeader(u, p);
            const response = await fetch(`${this.baseUrl}/sms/create`, {
                method: 'POST',
                headers: {
                    Authorization: authHeader,
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
                signal: AbortSignal.timeout(30_000),
            });

            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                return {
                    success: false,
                    error: (data as { message?: string })?.message || `HTTP ${response.status}`,
                    data,
                };
            }
            return { success: true, data };
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            return { success: false, error: msg };
        }
    }
}
