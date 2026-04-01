/**
 * Klinik hatırlatma / bildirim — Atak SMS + Evolution / Meta WhatsApp (whatshapp yapısı).
 * Baileys (gömülü) için ayrı Node süreci gerekir; burada HTTP tabanlı sağlayıcılar.
 */
import { AtakSmsService, type AtakSmsConfig } from './atakSms';
import { EvolutionProvider } from './whatsappEvolution';
import { MetaProvider } from './whatsappMeta';
import { sendViaEmbeddedBridge } from './whatsappEmbeddedBridge';
import type { WhatsAppProviderKind } from './whatsappTypes';

export type { AtakSmsConfig };

export interface ClinicMessagingPortalConfig {
    sms_user?: string | null;
    sms_password?: string | null;
    sms_sender?: string | null;
    sms_template?: string | null;
    whatsapp_template?: string | null;
    whatsapp_provider?: WhatsAppProviderKind | string | null;
    whatsapp_base_url?: string | null;
    whatsapp_token?: string | null;
    whatsapp_instance_id?: string | null;
    whatsapp_phone_id?: string | null;
    /** sms | whatsapp | both */
    default_reminder_channel?: string | null;
}

export interface ReminderTemplateContext {
    name: string;
    date: string;
    time: string;
    service: string;
}

export function buildReminderText(
    template: string | undefined,
    channel: 'sms' | 'whatsapp',
    ctx: ReminderTemplateContext
): string {
    const base =
        template?.trim() ||
        (channel === 'whatsapp'
            ? 'Merhaba {name}, {date} {time} — {service} randevu hatırlatması.'
            : 'Sayin {name}, {date} {time} {service} randeviniz icin hatirlatma.');
    return base.replace(/\{(\w+)\}/g, (_, k: string) => {
        const v = ctx[k as keyof ReminderTemplateContext];
        return v != null ? String(v) : '';
    });
}

/** Uluslararası format: 90XXXXXXXXXX (rakam) */
export function normalizePhoneDigits(raw: string): string {
    let p = raw.replace(/\D/g, '');
    if (p.length === 10) p = '90' + p;
    return p;
}

export async function sendAtakSms(
    cfg: ClinicMessagingPortalConfig,
    to: string,
    text: string
): Promise<{ success: boolean; error?: string }> {
    const svc = new AtakSmsService({
        smsUser: cfg.sms_user,
        smsPassword: cfg.sms_password,
        smsSender: cfg.sms_sender,
    });
    const r = await svc.sendSms(to, text);
    return r.success ? { success: true } : { success: false, error: r.error };
}

export async function sendWhatsAppText(
    cfg: ClinicMessagingPortalConfig,
    to: string,
    text: string
): Promise<{ success: boolean; error?: string }> {
    const kind = (cfg.whatsapp_provider || 'NONE').toString().toUpperCase();
    const digits = normalizePhoneDigits(to);
    if (kind === 'NONE') {
        return { success: false, error: 'WhatsApp kapalı.' };
    }
    try {
        /** Yerel QR köprüsü (Baileys / whatshapp HTTP) — token isteğe bağlı */
        if (kind === 'EMBEDDED') {
            const base = (cfg.whatsapp_base_url || '').trim();
            if (!base) return { success: false, error: 'Köprü URL (WhatsApp base URL) girin.' };
            return sendViaEmbeddedBridge(cfg, to, text);
        }
        if (!cfg.whatsapp_token) {
            return { success: false, error: 'WhatsApp API token gerekli (Evolution/Meta).' };
        }
        if (kind === 'EVOLUTION') {
            const base = cfg.whatsapp_base_url || '';
            const inst = cfg.whatsapp_instance_id || '';
            if (!base || !inst) return { success: false, error: 'Evolution URL veya instance eksik.' };
            const ev = new EvolutionProvider(base, cfg.whatsapp_token, inst);
            await ev.sendMessage({ to: digits, text });
            return { success: true };
        }
        if (kind === 'META') {
            const pid = cfg.whatsapp_phone_id || '';
            if (!pid) return { success: false, error: 'Meta Phone ID eksik.' };
            const meta = new MetaProvider(pid, cfg.whatsapp_token);
            await meta.sendMessage({ to: digits, text });
            return { success: true };
        }
        return { success: false, error: `Desteklenmeyen sağlayıcı: ${kind}` };
    } catch (e: unknown) {
        return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
}

export async function getAtakBalance(cfg: ClinicMessagingPortalConfig): Promise<{ success: boolean; credit?: number; error?: string }> {
    const svc = new AtakSmsService({
        smsUser: cfg.sms_user,
        smsPassword: cfg.sms_password,
    });
    return svc.getBalance();
}
