import type { ClinicErpSpecialty } from '../../types/beauty';
import {
    CASHIER_EXCLUDED_CLINIC_NAV_MODULE_IDS,
    isCashierRoleIdentity,
} from '../../services/rbacRolePresets';

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

type BeautyRoleHint = { name?: string | null; id?: string | null } | null | undefined;

/**
 * Güzellik okuması olmayan, kasiyer de olmayan POS kullanıcısının ürün satış sekmesi.
 * Klinik kasiyer buraya düşmez; klinik özeti (panel) açılır.
 */
export const BEAUTY_CASHIER_POS_TAB = 'product_sales';

/**
 * Klinik kasiyerinin göreceği sekmeler (güzellik varsayılan sırası).
 * Leads & CRM (`leads`) ve Klinik operasyon (`clinic_ops`) yoktur.
 * Ekranlar durur; yönetici menüsünde kalır. İniş `dashboard`. Anket satırı menüdedir, ilk sayfa değildir.
 */
export const CLINIC_OPERATIONAL_MENU_TABS = [
    'dashboard',
    'clinic_board',
    'clients',
    'calendar',
    'services',
    'product_sales',
    'service_recipes',
    'packages',
    'devices',
    'surveys',
    'staff',
    'expenses',
    'reports',
] as const;

/** Kasiyer sol menüsünden gizlenen klinik sekmeleri. Yönetici görür. */
export const CASHIER_EXCLUDED_CLINIC_NAV_TABS = ['leads', 'clinic_ops'] as const;

export function isCashierExcludedClinicNavTab(tabId: string): boolean {
    return (CASHIER_EXCLUDED_CLINIC_NAV_TABS as readonly string[]).includes(tabId)
        || (CASHIER_EXCLUDED_CLINIC_NAV_MODULE_IDS as readonly string[]).includes(tabId);
}

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
        || hasPermission('pos.view', 'READ')
        || hasPermission('pos.sell', 'READ')
        || hasPermission('pos.sell', 'EXECUTE')
    );
}

export function canAccessBeautyTab(
    hasPermission: BeautyPermCheck,
    tabId: string,
    role?: BeautyRoleHint,
): boolean {
    const cashier = role ? isCashierRoleIdentity(role.name, role.id) : false;
    // Leads & CRM ve Klinik operasyon kasiyerde kapalıdır. Yönetici bu kuralın dışındadır.
    if (cashier && isCashierExcludedClinicNavTab(tabId)) return false;
    const module = getBeautyTabRbacModule(tabId);
    if (module === 'beauty.surveys') {
        return hasPermission('beauty.surveys', 'READ') || hasPermission('beauty.surveys', 'EXECUTE');
    }
    if (hasPermission('beauty', 'READ')) return true;
    // Klinik kasiyer kimliği kalan operasyon sekmelerini açık tutar. Anket ayrı yetki ister.
    if (cashier) return true;
    if (tabId === BEAUTY_CASHIER_POS_TAB && hasPosCashierPermission(hasPermission)) return true;
    return false;
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

/**
 * Rol / yetkiye göre ilk açılacak sekme.
 * Klinik kasiyer güzellik okusa da okumasa da uzmanlık ana sayfasını açar
 * (varsayılan: özet / Klinik Paneli). Ürün satışı ve memnuniyet anketi ilk sayfa değildir.
 */
export function getLandingTabForBeautyAccess(
    hasPermission: BeautyPermCheck,
    specialty: ClinicErpSpecialty,
    role?: BeautyRoleHint,
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
    if (cashier || fullBeauty) return getLandingTabForSpecialty(specialty);
    if (posCashier) return BEAUTY_CASHIER_POS_TAB;
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
    role?: BeautyRoleHint,
): string | null {
    if (canAccessBeautyTab(hasPermission, activeTab, role)) return null;
    return visibleTabIds.find((id) => canAccessBeautyTab(hasPermission, id, role)) ?? null;
}
