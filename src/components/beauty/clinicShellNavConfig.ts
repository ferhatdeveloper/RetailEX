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
