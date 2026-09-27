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

/**
 * Uluslararası rakam formatı.
 * @param defaultCountryCode — ülke kodu yoksa eklenir (ör. 90, 964). Zaten kodlu numaraya dokunulmaz.
 */
export function normalizePhoneDigits(raw: string, defaultCountryCode = '90'): string {
    let p = String(raw || '').replace(/\D/g, '');
    if (!p) return '';
    const cc = String(defaultCountryCode || '90').replace(/\D/g, '') || '90';
    // Zaten ülke kodu ile başlıyorsa (ve yerel kısımdan uzunsa) bırak
    if (p.startsWith(cc) && p.length >= cc.length + 7) return p;
    // Yaygın uluslararası kodlar (TR/IQ/…) — yanlışlıkla yeniden prefix ekleme
    if (/^(90|964|971|966|1|44|49|33|39)\d{7,}$/.test(p) && !p.startsWith(cc)) {
        return p;
    }
    // 0 ile başlayan yerel (05xx…)
    if (p.length === 11 && p.startsWith('0')) return cc + p.slice(1);
    // 10 haneli yerel
    if (p.length === 10) return cc + p;
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

export interface WhatsAppSendOptions {
    text: string;
    /** Meta Cloud API — onaylı şablon (proaktif bildirim) */
    metaTemplate?: {
        name: string;
        language: string;
        bodyParameters: string[];
    };
}

export async function sendWhatsAppText(
    cfg: ClinicMessagingPortalConfig,
    to: string,
    text: string,
    options?: Pick<WhatsAppSendOptions, 'metaTemplate'>
): Promise<{ success: boolean; error?: string }> {
    return sendWhatsAppNotification(cfg, to, { text, metaTemplate: options?.metaTemplate });
}

export async function sendWhatsAppNotification(
    cfg: ClinicMessagingPortalConfig,
    to: string,
    options: WhatsAppSendOptions
): Promise<{ success: boolean; error?: string }> {
    const kind = (cfg.whatsapp_provider || 'NONE').toString().toUpperCase();
    const digits = normalizePhoneDigits(to);
    const text = String(options.text || '').trim();
    if (kind === 'NONE') {
        return { success: false, error: 'WhatsApp kapalı.' };
    }
    try {
        if (kind === 'EMBEDDED') {
            const base = (cfg.whatsapp_base_url || '').trim();
            if (!base) return { success: false, error: 'Köprü URL (WhatsApp base URL) girin.' };
            if (!text) return { success: false, error: 'Mesaj metni eksik.' };
            return sendViaEmbeddedBridge(cfg, to, text);
        }
        if (!cfg.whatsapp_token) {
            return { success: false, error: 'WhatsApp API token gerekli (Evolution/Meta).' };
        }
        if (kind === 'EVOLUTION') {
            const base = cfg.whatsapp_base_url || '';
            const inst = cfg.whatsapp_instance_id || '';
            if (!base || !inst) return { success: false, error: 'Evolution URL veya instance eksik.' };
            if (!text) return { success: false, error: 'Mesaj metni eksik.' };
            const ev = new EvolutionProvider(base, cfg.whatsapp_token, inst);
            await ev.sendMessage({ to: digits, text });
            return { success: true };
        }
        if (kind === 'META') {
            const pid = cfg.whatsapp_phone_id || '';
            if (!pid) return { success: false, error: 'Meta Phone ID eksik.' };
            const meta = new MetaProvider(pid, cfg.whatsapp_token);
            if (options.metaTemplate?.name) {
                await meta.sendMessage({
                    to: digits,
                    template: {
                        name: options.metaTemplate.name,
                        language: options.metaTemplate.language,
                        bodyParameters: options.metaTemplate.bodyParameters,
                    },
                });
                return { success: true };
            }
            if (!text) {
                return {
                    success: false,
                    error: 'Meta için onaylı şablon gerekli (24 saat penceresi dışında serbest metin gönderilemez).',
                };
            }
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
