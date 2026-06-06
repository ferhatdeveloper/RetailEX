import type { ClinicErpSpecialty } from '../../types/beauty';

/**
 * Yaygın diş pratiği yazılımları (Dentrix, Open Dental, Curve, Dental Asistanım vb.)
 * tipik modül eşlemesi — RetailEX Clinic kabuğu sekmeleri ile karşılaştırma.
 *
 * | Endüstri modülü        | Bu kabukta karşılığı                          |
 * |------------------------|-----------------------------------------------|
 * | Özet / gün özeti       | `dashboard` (ClinicDashboard)                 |
 * | Randevu defteri        | `calendar` (SmartScheduler)                   |
 * | Hasta kartı / CRM      | `clients` (ClientCRM)                         |
 * | Tedavi planı / FDI     | `dental_chart` (DentalChartScreen)            |
 * | Tarife / hizmet kataloğu | `services`, `packages`                      |
 * | Ünite / cihaz          | `devices`                                     |
 * | Raporlar               | `reports`                                     |
 * | Ayarlar / çok şube     | `clinic_ops` (ClinicOperationsHub)            |
 * | Personel               | `staff`                                       |
 *
 * `dental` uzmanlığı seçildiğinde sol menü bu sıraya yaklaşır (randevu önce, tedavi şeması vurgulu).
 */

type BeautyPermCheck = (module: string, action?: string) => boolean;

/** Klinik kabuğu sekmesi → RBAC modülü (anket operatörü yalnızca surveys görür) */
export function getBeautyTabRbacModule(tabId: string): string {
    if (tabId === 'surveys') return 'beauty.surveys';
    return 'beauty';
}

export function canAccessBeautyTab(hasPermission: BeautyPermCheck, tabId: string): boolean {
    const module = getBeautyTabRbacModule(tabId);
    if (module === 'beauty.surveys') {
        return hasPermission('beauty.surveys', 'READ') || hasPermission('beauty', 'READ');
    }
    return hasPermission('beauty', 'READ');
}

export function hasBeautyModuleAccess(hasPermission: BeautyPermCheck): boolean {
    return hasPermission('beauty', 'READ') || hasPermission('beauty.surveys', 'READ');
}

/** Uzmanlık değişince açılacak varsayılan çalışma sekmesi */
export function getLandingTabForSpecialty(s: ClinicErpSpecialty): string {
    switch (s) {
        case 'dental':
            return 'dental_chart';
        case 'physiotherapy':
            return 'physio_body';
        case 'obstetrics':
            return 'obstetrics';
        case 'dietitian':
            return 'dietitian';
        default:
            return 'dashboard';
    }
}

/** Rol / yetkiye göre ilk açılacak sekme */
export function getLandingTabForBeautyAccess(
    hasPermission: BeautyPermCheck,
    specialty: ClinicErpSpecialty,
): string {
    const fullBeauty = hasPermission('beauty', 'READ');
    const surveysOnly =
        !fullBeauty && (hasPermission('beauty.surveys', 'READ') || hasPermission('beauty.surveys', 'EXECUTE'));
    if (surveysOnly) return 'surveys';
    return getLandingTabForSpecialty(specialty);
}
