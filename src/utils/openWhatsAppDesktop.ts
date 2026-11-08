/**
 * WhatsApp Desktop / yerel uygulama üzerinden sohbet açma.
 * Önce whatsapp:// protokolü; Tauri shell veya tarayıcı ile açılır.
 * Yedek: https://api.whatsapp.com/send (Desktop yüklüyse uygulamaya yönlendirir).
 */
import { isTauriApp } from './env';
import { normalizePhoneDigits } from '../services/messaging/messagingCountryCodes';

export function buildWhatsAppDesktopDeepLink(
  phoneRaw: string,
  messageText: string,
  defaultCountryCode = '964',
): { phone: string; desktopUrl: string; webFallbackUrl: string } | null {
  const phone = normalizePhoneDigits(phoneRaw, defaultCountryCode);
  if (!phone || phone.length < 10) return null;
  const text = String(messageText || '').trim();
  const q = text ? `&text=${encodeURIComponent(text)}` : '';
  return {
    phone,
    desktopUrl: `whatsapp://send?phone=${phone}${q}`,
    webFallbackUrl: `https://api.whatsapp.com/send?phone=${phone}${text ? `&text=${encodeURIComponent(text)}` : ''}`,
  };
}

async function shellOpenUrl(url: string): Promise<boolean> {
  if (!isTauriApp()) return false;
  try {
    const { open } = await import('@tauri-apps/plugin-shell');
    await open(url);
    return true;
  } catch {
    return false;
  }
}

function browserOpenUrl(url: string): boolean {
  try {
    const w = window.open(url, '_blank', 'noopener,noreferrer');
    if (w) return true;
  } catch {
    /* ignore */
  }
  try {
    window.location.href = url;
    return true;
  } catch {
    return false;
  }
}

/**
 * WhatsApp Desktop’u (veya yüklü uygulamayı) hedef numara + metin ile açar.
 * @returns opened + kullanılan telefon (uluslararası rakam)
 */
export async function openWhatsAppDesktopChat(
  phoneRaw: string,
  messageText: string,
  options?: { defaultCountryCode?: string },
): Promise<{ ok: true; phone: string; usedDesktopProtocol: boolean } | { ok: false; error: 'invalid_phone' | 'open_failed' }> {
  const built = buildWhatsAppDesktopDeepLink(
    phoneRaw,
    messageText,
    options?.defaultCountryCode ?? '964',
  );
  if (!built) return { ok: false, error: 'invalid_phone' };

  // 1) Yerel protokol — Desktop uygulaması
  const viaDesktop =
    (await shellOpenUrl(built.desktopUrl)) || browserOpenUrl(built.desktopUrl);
  if (viaDesktop) {
    return { ok: true, phone: built.phone, usedDesktopProtocol: true };
  }

  // 2) HTTPS yedek — OS genelde Desktop’a verir
  const viaWeb =
    (await shellOpenUrl(built.webFallbackUrl)) || browserOpenUrl(built.webFallbackUrl);
  if (viaWeb) {
    return { ok: true, phone: built.phone, usedDesktopProtocol: false };
  }

  return { ok: false, error: 'open_failed' };
}
