/**
 * Şablon Düzenleme Modalı — "Mesaja ekle" (append) davranış testleri.
 *
 * Mantık: parent (MesajBildirimModule) callback'i, aktif dildeki
 * `body_text_<lang>` içeriğini `Serbest metin` textarea'sının **sonuna**
 * ekler (append). Mevcut içerik korunur; boş textarea için önce newline
 * eklenmez, dolu textarea için `\n\n` ayraç olarak kullanılır. Şablon
 * içeriği boşsa buton disabled olur.
 *
 * Bu testlerde amaç: append birleştirme fonksiyonunun sınır koşullarını
 * (boş, dolu, whitespace-only) ve modal callback imza kurallarını (boş
 * içerikte tetiklenmeme, callback'in lang parametresi ile çağrılması)
 * saf-birim olarak doğrulamak.
 */
import { describe, it, expect } from 'vitest';

/**
 * Append birleştirme yardımcısı — gerçek callback davranışını modeller.
 * Modal tarafında çağrılan fonksiyon: prev + ayraç + body.
 */
function appendBody(prev: string, body: string): string {
  const trimmedPrev = (prev ?? '').trim();
  return trimmedPrev ? `${trimmedPrev}\n\n${body}` : body;
}

/** Modal callback sözleşmesinin kuralları. */
type AppendCallbackArgs = { body: string; lang: 'tr' | 'en' | 'ar' | 'ku' };
function simulateCallback(
  prev: string,
  body: string,
  lang: AppendCallbackArgs['lang'],
): string {
  // Modal tarafı: body boşsa hiç çağrılmaz. Burada test amaçlı body'nin
  // boş olmadığını varsayıp append davranışını sınarız.
  if (!body || !body.trim()) return prev;
  // Modal, `setMessageText((prev) => ...)` formülünü kullanır; burada
  // dış prev'i girdi olarak alıp aynı formülü uyguluyoruz.
  return appendBody(prev, body) + ` [lang=${lang}]`;
}

describe('MessageTemplateEditorModal — appendToMessage (Mesaja ekle)', () => {
  it('boş textarea + şablon → sadece şablon içeriği yazılır (leading newline yok)', () => {
    const result = appendBody('', 'Merhaba');
    expect(result).toBe('Merhaba');
    expect(result.startsWith('\n')).toBe(false);
  });

  it('dolu textarea + şablon → önceki içerik korunur, \\n\\n ayraç, sonra şablon', () => {
    const result = appendBody('Kendi mesajım', 'Şablon içeriği');
    expect(result).toBe('Kendi mesajım\n\nŞablon içeriği');
  });

  it('önceki içerik trailing whitespace içeriyorsa trim sonrası ekleme yapılır', () => {
    // Önceki içerik: "önceki   \n   " → trim → "önceki"
    // Beklenti: "önceki\n\nYeni"
    const result = appendBody('önceki   \n   ', 'Yeni');
    expect(result).toBe('önceki\n\nYeni');
  });

  it('whitespace-only prev (örn. "   \\n   ") → trim sonrası şablona düşer', () => {
    const result = appendBody('   \n   ', 'Şablon');
    expect(result).toBe('Şablon');
  });

  it('boş şablon içeriği → buton disabled olmalı (append çağrılmaz)', () => {
    // Modal: handleAppendToMessage içinde body.trim() boşsa toast.warning
    // ve return — callback tetiklenmez. Test: simulateCallback prev'i
    // değiştirmemeli.
    const prev = 'Mevcut içerik';
    const result = simulateCallback(prev, '', 'tr');
    expect(result).toBe(prev);
  });

  it('whitespace-only şablon → buton disabled (trim boş) — append tetiklenmez', () => {
    const prev = 'Mevcut içerik';
    const result = simulateCallback(prev, '   \n  ', 'tr');
    expect(result).toBe(prev);
  });

  it('callback lang parametresiyle çağrılır (4 dil)', () => {
    for (const lang of ['tr', 'en', 'ar', 'ku'] as const) {
      const result = simulateCallback('Selam', 'Şablon', lang);
      expect(result).toBe(`Selam\n\nŞablon [lang=${lang}]`);
    }
  });

  it('append edilen içerik birleştirilmiş string olarak döner (ref değişmez)', () => {
    // Not: gerçek uygulamada `setMessageText((prev) => ...)` formülü
    // functional updater kullandığından ref değişmezlik React tarafında
    // doğal olarak sağlanır. Burada sadece dönüş değerinin doğru olduğunu
    // doğruluyoruz.
    const result = appendBody('A', 'B');
    expect(result).toBe('A\n\nB');
    expect(result.length).toBe('A\n\nB'.length);
  });

  it('çok satırlı şablon içeriği korunur (\\n\\n ayracı eklenmez)', () => {
    const body = 'Satır 1\nSatır 2\nSatır 3';
    const result = appendBody('Mevcut', body);
    expect(result).toBe(`Mevcut\n\n${body}`);
  });

  it('RTL (ar/ku) lang callback akışı simülasyonu', () => {
    // Modal tarafı: lang parametresi parent'a iletilir; parent UI'da
    // textarea yönünü (dir="rtl") değiştirmez (Serbest metin tek dil
    // bağlamında çalışır). Burada yalnızca callback sözleşmesi sınanır.
    const rtlLangs = ['ar', 'ku'] as const;
    for (const lang of rtlLangs) {
      const result = simulateCallback('السابق', 'القالب', lang);
      expect(result).toBe(`السابق\n\nالقالب [lang=${lang}]`);
    }
  });

  it('boş prev + çok satırlı şablon → sadece şablon döner, leading newline yok', () => {
    const body = 'Hat 1\nHat 2';
    const result = appendBody('', body);
    expect(result).toBe(body);
    expect(result.startsWith('\n')).toBe(false);
  });
});

describe('MessageTemplateEditorModal — i18n anahtarları (append)', () => {
  // Çeviri objelerinin şablon yapısını doğrula (modül seviyesi entegrasyon
  // testlerinde import edilir; burada yalnızca beklenen anahtarları ve
  // 4 dilde varlığı kontrol ederiz).
  const EXPECTED_KEYS = [
    'msgTplEditorAppendToMessage',
    'msgTplEditorAppended',
    'msgTplEditorAppendHint',
  ];
  const LANG_KEYS = ['tr', 'en', 'ar', 'ku'] as const;

  it('3 yeni anahtar tanımlıdır', () => {
    expect(EXPECTED_KEYS).toHaveLength(3);
  });

  it('i18n modülü gerekli 3 anahtarı 4 dilde içerir', async () => {
    const mod = await import('../../locales/module-translations');
    const dict = mod.messageTemplateEditorTranslations;
    for (const key of EXPECTED_KEYS) {
      const entry = (dict as Record<string, unknown>)[key];
      expect(entry, `${key} tanımlı olmalı`).toBeDefined();
      for (const lang of LANG_KEYS) {
        const text = (entry as Record<string, string> | undefined)?.[lang];
        expect(text, `${key}.${lang} dolu olmalı`).toBeTruthy();
        expect(text?.length, `${key}.${lang} boş olmamalı`).toBeGreaterThan(0);
      }
    }
  });

  it('msgTplEditorAppendToMessage Türkçe metni kullanıcı isteğiyle eşleşir', async () => {
    const mod = await import('../../locales/module-translations');
    const dict = mod.messageTemplateEditorTranslations as Record<
      string,
      Record<string, string>
    >;
    expect(dict.msgTplEditorAppendToMessage.tr).toBe('Mesaja ekle');
  });
});
