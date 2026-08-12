import type { NeonLogoProductLine } from '../components/ui/NeonLogo';

/** Üst şerit / splash markası — `retailex_active_module` ile hizalı */
export function neonProductLineFromModuleId(module: string | null | undefined): NeonLogoProductLine {
    const m = String(module || '').trim();
    if (m === 'restaurant') return 'restaurant';
    if (m === 'beauty') return 'clinic';
    return 'retail';
}

/** Oturumdaki ilk rol `landingRoute` / `landing_route` */
export function readLandingRouteFromSession(): string | null {
    try {
        const raw = localStorage.getItem('exretail_session');
        if (!raw) return null;
        const session = JSON.parse(raw);
        const roles = session?.user?.roles;
        if (!Array.isArray(roles)) return null;
        for (const r of roles) {
            const lr = r?.landingRoute ?? r?.landing_route;
            if (lr != null && String(lr).trim() !== '') {
                return String(lr).trim();
            }
        }
    } catch {
        /* ignore */
    }
    return null;
}

/**
 * Splash / giriş logosu:
 * — Son açık sekme beauty veya restoran ise doğrudan o marka
 * — Aksi halde oturum rolü iniş modülü (beauty/restaurant) öncelikli (klinik personeli POS’a uğradıysa bile ClinicEx)
 * — Diğer tüm durumlarda `retailex_active_module` veya iniş → RetailEx
 */
export function readNeonProductLineFromStorage(): NeonLogoProductLine {
    try {
        const mod = (localStorage.getItem('retailex_active_module') || '').trim();
        if (mod === 'beauty' || mod === 'restaurant') {
            return neonProductLineFromModuleId(mod);
        }
        const land = readLandingRouteFromSession();
        if (land === 'beauty' || land === 'restaurant') {
            return neonProductLineFromModuleId(land);
        }
        return neonProductLineFromModuleId(mod || land);
    } catch {
        return 'retail';
    }
}
