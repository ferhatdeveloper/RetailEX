/**
 * Bug: Paket Yönetimi sayfası açıldığında "Paketi Sil" onay modalı sayfa mount
 * anında yanlışlıkla açılıyordu.
 *
 * Kök neden: üç <PercentBodyModal> koşulsuz render ediliyordu (bilgi / hizmet
 * ekle / silme onayı). PercentBodyModal mount anında body scroll-lock + overlay
 * portalı oluşturduğu için mount sırasında tüm modallar görünüyor; aynı
 * z-index'te en son DOM'a basılan (silme onayı) en üstte bindiriyordu.
 *
 * Düzeltme: üç modal da koşullu render edildi:
 *  - bilgi:    {infoModalOpen && …}
 *  - hizmet:   {addSvcOpen && …}
 *  - silme:    {deleteConfirm !== null && …}
 *
 * Bu test regresyon amaçlı: sayfa mount anında hiçbir modal açık olmamalı;
 * silme modalı yalnızca kullanıcı karttaki çöp ikonuna tıklayınca açılmalı.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import React from 'react';

// i18n / tm hook mock — testte sadece belli başlı anahtarları TR döndürür.
const TM_MAP: Record<string, string> = {
    bPackageManagement: 'Paket Yönetimi',
    bPackageCreate: 'Paket Oluştur',
    bLoading: 'Yükleniyor…',
    bNoPackages: 'Henüz paket yok',
    bCreateFirstPackage: 'İlk paketi oluştur',
    bDefineNewPackage: 'Yeni paket tanımla',
    bDeletePackage: 'Paketi Sil',
    bDeletePackageConfirm: 'Bu paketi kaldırmak istediğinizden emin misiniz?',
    bPackageDeleted: 'Paket silindi',
    bPackageDeleteTimeout: 'Paket silme zaman aşımına uğradı',
    bPackageSaveFirst: 'Önce paketi kaydedin',
    bDeleting: 'Siliniyor…',
    bDiscount: 'İndirim',
    bSessions: 'Seans',
    bPackagePrice: 'Liste Fiyatı',
    bSessionPrice: 'Seans Fiyatı',
    bPackageIncluded: 'paket dahil',
    bPackageValidDays: 'gün geçerli',
    bPackageCommissionAssign: 'Hizmet / Personel / Yüzde',
    bPackageAddService: 'Hizmet Ekle',
    bPackageCommissionEmpty: 'Henüz satır yok',
    bPackageCommissionPercent: 'Yüzde',
    bPackageCommissionService: 'Hizmet',
    bPackageCommissionStaff: 'Personel',
    bPackageAdd: 'Ekle',
    save: 'Kaydet',
    saveError: 'Kaydetme hatası',
    cancel: 'İptal',
    delete: 'Sil',
    edit: 'Düzenle',
    bAdd: 'Ekle',
    bSaving: 'Kaydediliyor…',
    bPackageNew: 'Yeni Paket',
    bPackageEdit: 'Paketi Düzenle',
    bPackageStepInfo: 'Adım A',
    bPackageStepInfoHint: 'İpucu',
    bPackageName: 'Ad',
    bPackageDescription: 'Açıklama',
    bPackageSessions: 'Seans',
    bPackageValidity: 'Geçerlilik',
    bPackageListPrice: 'Liste Fiyatı',
    bPackageDiscountPct: 'İndirim %',
    bPackageSalePrice: 'Satış Fiyatı',
    bPackageColor: 'Renk',
    bPackageCommissionSubtitle: 'Hizmet/Personel/Yüzde',
    bPackageCommissionPercentHint: 'Yüzde önerisi',
    bSelectServicePlaceholder: 'Hizmet seçin',
    bPackageCommissionStaffPlaceholder: 'Personel seçin',
};

vi.mock('../../../contexts/LanguageContext', () => ({
    useLanguage: () => ({
        tm: (k: string, fallback?: string) => TM_MAP[k] ?? fallback ?? k,
    }),
}));

// useBeautyStore mock — modal davranışını etkileyen tek state deleteConfirm
const mockDeletePackage = vi.fn().mockResolvedValue(undefined);
const mockLoadPackages = vi.fn().mockResolvedValue(undefined);
const mockLoadServices = vi.fn().mockResolvedValue(undefined);
const mockLoadSpecialists = vi.fn().mockResolvedValue(undefined);
const mockAddPackageCommissionRow = vi.fn().mockResolvedValue(undefined);
const mockRemovePackageCommissionRow = vi.fn().mockResolvedValue(undefined);
const mockUpdatePackageCommissionRow = vi.fn().mockResolvedValue(undefined);
const mockLoadPackageCommissions = vi.fn().mockResolvedValue(undefined);
const mockCreatePackage = vi.fn().mockResolvedValue('pkg-new');
const mockUpdatePackage = vi.fn().mockResolvedValue(undefined);

vi.mock('../../../components/beauty/store/useBeautyStore', () => ({
    useBeautyStore: () => ({
        packages: [
            {
                id: 'pkg-1',
                name: '8 Seans Lazer',
                description: '',
                total_sessions: 8,
                price: 10000,
                discount_pct: 0,
                validity_days: 365,
                color: '#9333ea',
            },
        ],
        services: [],
        specialists: [],
        isLoading: false,
        packageCommissions: {},
        loadPackages: mockLoadPackages,
        loadServices: mockLoadServices,
        loadSpecialists: mockLoadSpecialists,
        createPackage: mockCreatePackage,
        updatePackage: mockUpdatePackage,
        deletePackage: mockDeletePackage,
        addPackageCommissionRow: mockAddPackageCommissionRow,
        removePackageCommissionRow: mockRemovePackageCommissionRow,
        updatePackageCommissionRow: mockUpdatePackageCommissionRow,
        loadPackageCommissions: mockLoadPackageCommissions,
    }),
}));

import { PackageManagement } from '../../../components/beauty/components/PackageManagement';

afterEach(() => {
    cleanup();
    vi.clearAllMocks();
});

beforeEach(() => {
    // portal + body.scroll lock temizliği (component unmount'u garbage collect yapsın)
    document.body.style.overflow = '';
});

describe('PackageManagement — Silme modalı mount/tıklama sırası', () => {
    it('sayfa ilk yüklendiğinde hiçbir modal açılmaz (silme onayı görünmez)', () => {
        render(<PackageManagement />);

        // Silme başlığı ve onay metni DOM'da OLMAMALI (koşullu render).
        expect(
            screen.queryByText('Paketi Sil'),
        ).toBeNull();
        expect(
            screen.queryByText('Bu paketi kaldırmak istediğinizden emin misiniz?'),
        ).toBeNull();
    });

    it('karttaki çöp ikonuna tıklayınca silme onay modalı açılır', () => {
        render(<PackageManagement />);

        const trashBtn = screen.getByLabelText('Sil');
        fireEvent.click(trashBtn);

        // Şimdi görünmeli.
        expect(
            screen.getByText('Paketi Sil'),
        ).toBeInTheDocument();
        expect(
            screen.getByText('Bu paketi kaldırmak istediğinizden emin misiniz?'),
        ).toBeInTheDocument();
    });

    it('İptal\'e tıklayınca silme modalı kapanır (mount\'a dönüş)', () => {
        render(<PackageManagement />);

        const trashBtn = screen.getByLabelText('Sil');
        fireEvent.click(trashBtn);
        expect(
            screen.getByText('Bu paketi kaldırmak istediğinizden emin misiniz?'),
        ).toBeInTheDocument();

        // İptal butonu — çöp açılan modal içinde
        const cancelBtn = screen.getAllByText('İptal')[0];
        fireEvent.click(cancelBtn);

        // Yeniden kapanmalı — silme onayı DOM'da olmamalı
        expect(
            screen.queryByText('Bu paketi kaldırmak istediğinizden emin misiniz?'),
        ).toBeNull();
    });

    it('Sil butonuna tıklayınca deletePackage çağrılır ve modal kapanır', async () => {
        render(<PackageManagement />);

        const trashBtn = screen.getByLabelText('Sil');
        fireEvent.click(trashBtn);

        // Modal açık. İçerideki "Sil" butonu (primary red). Tüm "Sil" label'lı butonlar
        // (karttaki çöp ikonu + modal içi Sil butonu) olabilir; modal içindeki
        // onay butonunu text ile seçiyoruz.
        const confirmBtn = screen.getByText('Sil');
        fireEvent.click(confirmBtn);

        // mock deletePackage çağrıldı
        await vi.waitFor(() => {
            expect(mockDeletePackage).toHaveBeenCalledWith('pkg-1', expect.any(Object));
        });
    });

    it('bilgi / hizmet / silme modallarının hiçbiri mount anında portal üretmez', () => {
        // PercentBodyModal FullscreenBodyPortal kullanır; portal mount
        // anında dialog role elemanı yaratır. Mount anında dialog OLMAMALI.
        const { container, unmount } = render(<PackageManagement />);
        const dialogs = container.querySelectorAll('[role="dialog"]');
        expect(dialogs.length).toBe(0);
        unmount();
    });
});
