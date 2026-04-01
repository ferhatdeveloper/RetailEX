/**
 * Meta Cloud API — whatshapp `lib/whatsapp/meta.ts` ile uyumlu (fetch).
 */
import type { WhatsAppMessage } from './whatsappTypes';

export class MetaProvider {
    private version = 'v19.0';

    constructor(
        private phoneId: string,
        private token: string
    ) {}

    async sendMessage(message: WhatsAppMessage): Promise<void> {
        const url = `https://graph.facebook.com/${this.version}/${this.phoneId}/messages`;
        const payload: Record<string, unknown> = {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: message.to,
        };
        if (message.mediaUrl) {
            payload.type = 'document';
            payload.document = {
                link: message.mediaUrl,
                filename: message.fileName || 'document.pdf',
            };
        } else {
            payload.type = 'text';
            payload.text = { body: message.text ?? '' };
        }
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${this.token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(60_000),
        });
        if (!res.ok) {
            const err = await res.text();
            throw new Error(`Meta WA: ${res.status} ${err}`);
        }
    }

    async checkHealth(): Promise<boolean> {
        return true;
    }
}
