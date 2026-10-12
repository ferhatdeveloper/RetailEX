/**
 * Müşteri hücresi render helper regresyon testleri.
 *
 * Bug raporu:
 *   "Günlük Rapor'da 'Müşteri' kolonunda bazı satırlarda UUID görünüyor"
 *   Örnekler:
 *     - bae0608f-2f52-4f00-8367-0521f4434a76
 *     - 91fc92b4-910c-4c37-bf9f-1e9b650e491d
 *
 * Bu UUID'ler `customers` tablosunda eşleşmiyor; genellikle eski demo
 * verisi veya silinen müşteri. Hücre bunları "Silinmiş müşteri" olarak
 * göstermeli, gerçek müşteri adını ise olduğu gibi geçirmeli.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
    UUID_RE,
    customerNameText,
    renderCustomerCell,
} from '../../utils/customerDisplay';

function html(node: ReturnType<typeof renderCustomerCell>): string {
    return renderToStaticMarkup(node as React.ReactElement);
}

describe('customerDisplay', () => {
    describe('UUID_RE', () => {
        it('standart UUID formatını kabul eder', () => {
            expect(UUID_RE.test('bae0608f-2f52-4f00-8367-0521f4434a76')).toBe(true);
            expect(UUID_RE.test('91fc92b4-910c-4c37-bf9f-1e9b650e491d')).toBe(true);
        });

        it('case-insensitive çalışır', () => {
            expect(UUID_RE.test('BAE0608F-2F52-4F00-8367-0521F4434A76')).toBe(true);
            expect(UUID_RE.test('BAE0608f-2F52-4F00-8367-0521f4434a76')).toBe(true);
        });

        it('UUID olmayan stringleri reddeder', () => {
            expect(UUID_RE.test('NIHAT')).toBe(false);
            expect(UUID_RE.test('12345')).toBe(false);
            expect(UUID_RE.test('')).toBe(false);
            expect(UUID_RE.test('bae0608f-2f52-4f00-8367-0521f4434a7')).toBe(false); // eksik karakter
            expect(UUID_RE.test('bae0608f-2f52-4f00-8367-0521f4434a7g')).toBe(false); // geçersiz hex
        });
    });

    describe('renderCustomerCell', () => {
        it('null için "—" döner', () => {
            const out = html(renderCustomerCell(null));
            expect(out).toContain('—');
            expect(out).not.toContain('Silinmiş');
        });

        it('undefined için "—" döner', () => {
            const out = html(renderCustomerCell(undefined));
            expect(out).toContain('—');
        });

        it('boş string için "—" döner', () => {
            const out = html(renderCustomerCell(''));
            expect(out).toContain('—');
        });

        it('sadece boşluk içeren string için "—" döner', () => {
            const out = html(renderCustomerCell('   '));
            expect(out).toContain('—');
        });

        it('UUID formatlı isim "Silinmiş müşteri" döner ve tooltip orijinal UUID olur', () => {
            const out = html(renderCustomerCell('bae0608f-2f52-4f00-8367-0521f4434a76'));
            expect(out).toContain('Silinmiş');
            expect(out).toContain('title="bae0608f-2f52-4f00-8367-0521f4434a76"');
        });

        it('UUID büyük harfle yazılsa da "Silinmiş müşteri" döner', () => {
            const out = html(renderCustomerCell('91FC92B4-910C-4C37-BF9F-1E9B650E491D'));
            expect(out).toContain('Silinmiş');
            expect(out).toContain('title="91FC92B4-910C-4C37-BF9F-1E9B650E491D"');
        });

        it('UUID etrafındaki boşluklar yok sayılır', () => {
            const out = html(renderCustomerCell('  bae0608f-2f52-4f00-8367-0521f4434a76  '));
            expect(out).toContain('Silinmiş');
        });

        it('normal isim olduğu gibi döner', () => {
            const out = html(renderCustomerCell('NIHAT'));
            expect(out).toContain('NIHAT');
            expect(out).not.toContain('Silinmiş');
        });

        it('Türkçe karakterli isim bozulmadan döner (UTF-8)', () => {
            const out = html(renderCustomerCell('Şüheda Öncü Güneş İlkbahar Çiçeği'));
            expect(out).toContain('Şüheda Öncü Güneş İlkbahar Çiçeği');
            expect(out).not.toContain('Silinmiş');
        });
    });

    describe('customerNameText', () => {
        it('null için "—" döner', () => {
            expect(customerNameText(null)).toBe('—');
        });

        it('UUID için "Silinmiş müşteri" döner', () => {
            expect(customerNameText('bae0608f-2f52-4f00-8367-0521f4434a76')).toBe('Silinmiş müşteri');
        });

        it('normal ismi olduğu gibi döner', () => {
            expect(customerNameText('NIHAT')).toBe('NIHAT');
        });

        it('etrafındaki boşlukları kırpar', () => {
            expect(customerNameText('  Ayşe  ')).toBe('Ayşe');
        });
    });
});
