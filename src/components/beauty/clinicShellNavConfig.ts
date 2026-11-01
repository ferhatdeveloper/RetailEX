import type { ClinicErpSpecialty } from '../../types/beauty';
import { isCashierRoleIdentity } from '../../services/rbacRolePresets';

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
 * | Ayarlar / çok şube     | `clinic_ops` (V2 kabuk, V1 ClinicOperationsHub) |
 * | Personel               | `staff`                                       |
 *
 * `dental` uzmanlığı seçildiğinde sol menü bu sıraya yaklaşır (randevu önce, tedavi şeması vurgulu).
 */

type BeautyPermCheck = (module: string, action?: string) => boolean;

/** Klinik kabuğunda kasiyerin açtığı kasa ekranı (randevu + ödeme). Anket sekmesi değil. */
export const BEAUTY_CASHIER_POS_TAB = 'product_sales';

/** Klinik kabuğu sekmesi → RBAC modülü (anket operatörü yalnızca surveys görür) */
export function getBeautyTabRbacModule(tabId: string): string {
    if (tabId === 'surveys') return 'beauty.surveys';
    return 'beauty';
}

function hasPosCashierPermission(hasPermission: BeautyPermCheck): boolean {
    return (
        hasPermission('pos', 'READ')
        || hasPermission('pos', 'EXECUTE')
        || hasPermission('pos', 'CREATE')
    );
}

export function canAccessBeautyTab(hasPermission: BeautyPermCheck, tabId: string): boolean {
    const module = getBeautyTabRbacModule(tabId);
    if (module === 'beauty.surveys') {
        return hasPermission('beauty.surveys', 'READ') || hasPermission('beauty.surveys', 'EXECUTE');
    }
    if (tabId === BEAUTY_CASHIER_POS_TAB && hasPosCashierPermission(hasPermission)) return true;
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
    role?: { name?: string | null; id?: string | null } | null,
): string {
    const cashier = role ? isCashierRoleIdentity(role.name, role.id) : false;
    const fullBeauty = hasPermission('beauty', 'READ');
    const posCashier = hasPosCashierPermission(hasPermission);
    const surveysOnly =
        !fullBeauty
        && !cashier
        && !posCashier
        && (hasPermission('beauty.surveys', 'READ') || hasPermission('beauty.surveys', 'EXECUTE'));
    if (surveysOnly) return 'surveys';
    if (cashier || (posCashier && !fullBeauty)) return BEAUTY_CASHIER_POS_TAB;
    return getLandingTabForSpecialty(specialty);
}

/**
 * Açık sekmenin yetkisi yoksa menüdeki ilk izinli sekmeye geç.
 * İzinli sekme yoksa anket sayfasına zorlama.
 */
export function nextBeautyTabWhenDenied(
    hasPermission: BeautyPermCheck,
    activeTab: string,
    visibleTabIds: readonly string[],
): string | null {
    if (canAccessBeautyTab(hasPermission, activeTab)) return null;
    return visibleTabIds.find((id) => canAccessBeautyTab(hasPermission, id)) ?? null;
}
