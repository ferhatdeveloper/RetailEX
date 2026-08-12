/** whatshapp `lib/whatsapp/types.ts` ile uyumlu */
export interface WhatsAppMessage {
    to: string;
    text?: string;
    mediaUrl?: string;
    media?: Buffer | Uint8Array;
    mimetype?: string;
    fileName?: string;
    /** Meta Cloud API onaylı şablon */
    template?: {
        name: string;
        language: string;
        bodyParameters: string[];
    };
}

export type WhatsAppProviderKind = 'EVOLUTION' | 'META' | 'EMBEDDED' | 'NONE';
