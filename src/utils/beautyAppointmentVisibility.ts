/**
 * Takvim, cihaz/personel ızgarası ve sıra listelerinde gösterilecek randevular.
 * İptal ve gelmedi kayıtları çizelgede yer tutmaz ve kart olarak görünmez.
 */
export function beautyAptVisibleOnSchedule(apt: { status?: string }): boolean {
    const s = String(apt?.status ?? '').trim().toLowerCase();
    return s !== 'cancelled' && s !== 'canceled' && s !== 'no_show';
}
