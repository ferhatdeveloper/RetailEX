import { describe, expect, it } from 'vitest';
import { buildPatientFilePrintContext, interpolateTemplateText } from '../../services/templateRenderService';

describe('buildPatientFilePrintContext', () => {
  it('maps customer file_id and contact fields to template tokens', () => {
    const ctx = buildPatientFilePrintContext(
      {
        id: 'c1',
        code: 'M-42',
        name: 'Ayşe Yılmaz',
        phone: '0532 111 22 33',
        phone2: '0533 444 55 66',
        email: 'ayse@ornek.com',
        address: 'Bağdat Cad. No:1',
        city: 'İstanbul',
        file_id: '1248',
        age: 34,
        birth_date: '1992-03-12',
        occupation: 'Öğretmen',
        gender: 'female',
        customer_tier: 'vip',
        heard_from: 'Instagram',
        notes: 'Alerji: lateks',
        balance: 150.5,
        points: 250,
      },
      {
        storeName: 'Demo Klinik',
        storeAddress: 'Kadıköy',
        storePhone: '0212 000 00 00',
      },
    );

    expect(ctx.customerFileNo).toBe('1248');
    expect(ctx.fileId).toBe('1248');
    expect(ctx.customerName).toBe('Ayşe Yılmaz');
    expect(ctx.customerPhone).toBe('0532 111 22 33');
    expect(ctx.customerEmail).toBe('ayse@ornek.com');
    expect(ctx.customerGender).toBe('Kadın');
    expect(ctx.customerTier).toBe('VIP');
    expect(ctx.customerBirthDate).toBe('12.03.1992');
    expect(ctx.storeName).toBe('Demo Klinik');
    expect(ctx.reportTitle).toBe('Hasta Dosyası');

    const line = interpolateTemplateText(
      'Dosya No: {{customerFileNo}} — {{customerName}} / {{customerPhone}}',
      ctx,
    );
    expect(line).toBe('Dosya No: 1248 — Ayşe Yılmaz / 0532 111 22 33');
  });
});
