import { describe, expect, it } from 'vitest';
import { buildWhatsAppDesktopDeepLink } from './openWhatsAppDesktop';

describe('buildWhatsAppDesktopDeepLink', () => {
  it('builds whatsapp:// and api.whatsapp.com URLs for Iraqi local phone', () => {
    const built = buildWhatsAppDesktopDeepLink('0750 495 7894', 'Hello test', '964');
    expect(built).not.toBeNull();
    expect(built!.phone).toMatch(/^9647504957894$/);
    expect(built!.desktopUrl.startsWith('whatsapp://send?phone=9647504957894')).toBe(true);
    expect(built!.desktopUrl).toContain('text=Hello%20test');
    expect(built!.webFallbackUrl.startsWith('https://api.whatsapp.com/send?phone=9647504957894')).toBe(true);
  });

  it('returns null for short phone', () => {
    expect(buildWhatsAppDesktopDeepLink('123', 'Hi')).toBeNull();
  });
});
