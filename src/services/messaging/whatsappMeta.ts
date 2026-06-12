/**
 * Meta Cloud API — whatshapp `lib/whatsapp/meta.ts` ile uyumlu (fetch).
 * Proaktif bildirimler için onaylı template mesajı zorunludur.
 */
import type { WhatsAppMessage } from './whatsappTypes';

export interface MetaTemplateSendOptions {
    name: string;
    language: string;
    bodyParameters: string[];
}

export class MetaProvider {
    private version = 'v21.0';

    constructor(
        private phoneId: string,
        private token: string
    ) {}

    async sendTemplateMessage(
        to: string,
        template: MetaTemplateSendOptions
    ): Promise<void> {
        const url = `https://graph.facebook.com/${this.version}/${this.phoneId}/messages`;
        const components: Record<string, unknown>[] = [];
        if (template.bodyParameters.length > 0) {
            components.push({
                type: 'body',
                parameters: template.bodyParameters.map((text) => ({
                    type: 'text',
                    text: String(text ?? '').slice(0, 1024),
                })),
            });
        }
        const payload: Record<string, unknown> = {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to,
            type: 'template',
            template: {
                name: template.name,
                language: { code: template.language },
                components,
            },
        };
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
            throw new Error(`Meta WA template: ${res.status} ${err}`);
        }
    }

    async sendMessage(message: WhatsAppMessage): Promise<void> {
        const digits = String(message.to || '').replace(/\D/g, '');
        if (message.template?.name) {
            await this.sendTemplateMessage(digits, {
                name: message.template.name,
                language: message.template.language,
                bodyParameters: message.template.bodyParameters,
            });
            return;
        }
        const url = `https://graph.facebook.com/${this.version}/${this.phoneId}/messages`;
        const payload: Record<string, unknown> = {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: digits,
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
        try {
            const url = `https://graph.facebook.com/${this.version}/${this.phoneId}`;
            const res = await fetch(url, {
                headers: { Authorization: `Bearer ${this.token}` },
                signal: AbortSignal.timeout(10_000),
            });
            return res.ok;
        } catch {
            return false;
        }
    }
}
