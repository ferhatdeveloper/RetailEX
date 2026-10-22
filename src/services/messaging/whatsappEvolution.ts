/**
 * Evolution API — whatshapp `lib/whatsapp/evolution.ts` ile uyumlu (fetch).
 */
import type { WhatsAppMessage } from './whatsappTypes';

/** Klinik Evolution kökü. Sohbet mesajı; durum ucu değil. */
export function evolutionMediaEndpoint(baseUrl: string, instance: string): string {
    const root = baseUrl.trim().replace(/\/+$/, '').replace(/\/status$/i, '');
    return `${root}/message/sendMedia/${encodeURIComponent(instance)}`;
}

export function evolutionMediaPayload(input: {
    to: string;
    mediatype: 'image' | 'video';
    media: string;
    caption?: string;
}): { number: string; options: { delay: number; presence: string }; mediaMessage: { mediatype: string; caption: string; media: string } } {
    return {
        number: input.to,
        options: { delay: 1200, presence: 'composing' },
        mediaMessage: {
            mediatype: input.mediatype,
            caption: input.caption || '',
            media: input.media,
        },
    };
}

export class EvolutionProvider {
    constructor(
        private baseUrl: string,
        private token: string,
        private instance: string
    ) {}

    async sendMessage(message: WhatsAppMessage): Promise<void> {
        const url = `${this.baseUrl.replace(/\/$/, '')}/message/sendText/${this.instance}`;
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                apikey: this.token,
                Accept: 'application/json',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                number: message.to,
                options: { delay: 1200, presence: 'composing' },
                textMessage: { text: message.text ?? '' },
            }),
            signal: AbortSignal.timeout(60_000),
        });
        if (!res.ok) {
            const err = await res.text();
            throw new Error(`Evolution: ${res.status} ${err}`);
        }
    }

    async checkHealth(): Promise<boolean> {
        try {
            const res = await fetch(
                `${this.baseUrl.replace(/\/$/, '')}/instance/connectionState/${this.instance}`,
                { headers: { apikey: this.token }, signal: AbortSignal.timeout(10_000) }
            );
            const data = await res.json().catch(() => ({}));
            return (data as { instance?: { state?: string } })?.instance?.state === 'open';
        } catch {
            return false;
        }
    }
}
