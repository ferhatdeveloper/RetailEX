/**
 * Kasa Virman formu: döviz seçici gizli, alan sırası sade.
 * Kayıt kaynak kasa biriminde (yoksa defter / IQD), aynı tutar, kur çevrimi yok.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import type { Kasa, KasaIslemi } from '../../../services/api/kasa';

const { createKasaIslemi, targetKasa, firmaState } = vi.hoisted(() => {
  const targetKasa = {
    id: 'kasa-2',
    firma_id: 'f1',
    kasa_kodu: '000002',
    kasa_adi: 'ZAIN CASH',
    bakiye: 0,
    id_bakiye: 0,
    id_doviz_kodu: 'IQD',
    aktif: true,
    olusturma_tarihi: '',
    guncelleme_tarihi: '',
  };
  const firmaState = {
    selectedFirma: { id: 'f1', firm_nr: '001', ana_para_birimi: 'IQD' },
    selectedDonem: { id: 'd1', baslangic_tarihi: '2026-01-01', bitis_tarihi: '2026-12-31' },
  };
  return {
    targetKasa,
    firmaState,
    createKasaIslemi: vi.fn(async () => ({ id: 'line-1' })),
  };
});

vi.mock('../../../contexts/FirmaDonemContext', () => ({
  useFirmaDonem: () => firmaState,
}));

vi.mock('../../../contexts/LanguageContext', async () => {
  const { translations } = await vi.importActual<any>('../../../locales/translations');
  return {
    useLanguage: () => ({
      t: translations.tr,
      tm: (key: string) => {
        if (key === 'cashModalDateRangeHint') return 'İşlem tarihi dönem aralığında olmalı: {beg} → {end}';
        return key;
      },
    }),
  };
});

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock('../../../services/api/kasa', async () => {
  const actual = await vi.importActual<typeof import('../../../services/api/kasa')>('../../../services/api/kasa');
  return {
    ...actual,
    createKasaIslemi: (...args: unknown[]) => createKasaIslemi(...args),
    updateKasaIslemi: vi.fn(),
    fetchKasalar: vi.fn(async () => [targetKasa]),
    cashLineExistsForFicheNo: vi.fn(async () => false),
  };
});

const sourceKasa: Kasa = {
  id: 'kasa-1',
  firma_id: 'f1',
  kasa_kodu: 'KASA.001',
  kasa_adi: 'MERKEZ KASA',
  bakiye: 100000,
  id_bakiye: 100000,
  id_doviz_kodu: 'IQD',
  aktif: true,
  olusturma_tarihi: '',
  guncelleme_tarihi: '',
};

async function renderVirman(editing?: Partial<KasaIslemi>) {
  const { KasaIslemModal } = await import('../../../components/accounting/cash-ops/KasaIslemModal');
  return render(
    <KasaIslemModal
      kasa={sourceKasa}
      islemTipi="VIRMAN"
      onClose={() => {}}
      onSuccess={() => {}}
      editingIslem={editing as KasaIslemi | undefined}
    />,
  );
}

function formLabels(): string[] {
  const form = document.querySelector('form');
  if (!form) return [];
  return Array.from(form.querySelectorAll('label')).map((label) => (label.textContent || '').trim());
}

describe('Kasa Virman formu', () => {
  beforeEach(() => {
    createKasaIslemi.mockClear();
    createKasaIslemi.mockResolvedValue({ id: 'line-1' });
  });

  it('döviz seçicisini gizler ve alanları istenen sırada gösterir', async () => {
    await renderVirman();
    await screen.findByRole('option', { name: /ZAIN CASH/ });

    expect(formLabels()).toEqual([
      'Tarih',
      'Fiş / Belge No',
      'Özel Kod',
      'Kasa',
      'Hedef Kasa',
      'İşlem Tutarı (IQD)',
      'Açıklama',
    ]);

    const selects = document.querySelectorAll('form select');
    expect(selects).toHaveLength(1);
    const values = Array.from(selects[0].querySelectorAll('option')).map((opt) => opt.getAttribute('value'));
    expect(values).not.toContain('USD');
    expect(values).not.toContain('EUR');
    expect(screen.getByDisplayValue('KASA.001 - MERKEZ KASA')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Vazgeç' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'İşlemi Kaydet' })).toBeInTheDocument();
    expect(document.querySelector('.fixed.inset-0.z-50')).toBeNull();
  });

  it('40.000 tutarını IQD ve kur çevirmeden kaydeder', async () => {
    await renderVirman({
      doviz_kodu: 'USD',
      tutar: 0,
      kasa_id: sourceKasa.id,
      islem_tipi: 'VIRMAN',
      islem_tarihi: '2026-10-25',
      firma_id: 'f1',
      donem_id: 'd1',
    });

    fireEvent.change(screen.getByPlaceholderText('0,00'), { target: { value: '40.000' } });
    const targetOption = await screen.findByRole('option', { name: /ZAIN CASH/ });
    fireEvent.change(targetOption.closest('select') as HTMLSelectElement, { target: { value: 'kasa-2' } });
    fireEvent.click(screen.getByRole('button', { name: 'İşlemi Kaydet' }));

    await waitFor(() => expect(createKasaIslemi).toHaveBeenCalledTimes(1));
    const payload = createKasaIslemi.mock.calls[0][0] as KasaIslemi;
    expect(payload.tutar).toBe(40000);
    expect(payload.dovizli_tutar).toBe(40000);
    expect(payload.doviz_kodu).toBe('IQD');
    expect(payload.islem_tipi).toBe('VIRMAN');
    expect(payload.kasa_id).toBe('kasa-1');
    expect(payload.target_register_id).toBe('kasa-2');
    expect((payload as { exchange_rate?: number }).exchange_rate).toBeUndefined();
  });

  it('diğer kasa işlemlerinde döviz seçici durur', async () => {
    const { KasaIslemModal } = await import('../../../components/accounting/cash-ops/KasaIslemModal');
    render(
      <KasaIslemModal
        kasa={sourceKasa}
        islemTipi="KASA_GIRIS"
        onClose={() => {}}
        onSuccess={() => {}}
      />,
    );

    expect(await screen.findByRole('option', { name: 'USD' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'EUR' })).toBeInTheDocument();
    expect(formLabels()).toContain('İşlem Tutarı (IQD)');
  });
});
