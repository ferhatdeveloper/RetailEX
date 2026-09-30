/**
 * POS ödeme ekranından satışa geri dönüş izni.
 * Parametre: system_settings.report_menu_params → `allow-pos-payment-back-to-sale`
 * (varsayılan: açık = geri dönüşe izin, fiş iptal neden modalı ile).
 *
 * POS ödeme ekranı kapatma sorusunu atlama izni.
 * Parametre: system_settings.report_menu_params → `pos-payment-cancel-without-reason`
 * (varsayılan: açık = İptal/X basınca soru modalı açılmadan direkt kapat).
 */
import {
  getRuntimeReportMenuParams,
  isReportMenuParamEnabled,
  type ReportMenuParams,
} from '../services/reportMenuParamsService';

export const ALLOW_POS_PAYMENT_BACK_TO_SALE_PARAM = 'allow-pos-payment-back-to-sale' as const;
export const POS_PAYMENT_CANCEL_WITHOUT_REASON_PARAM = 'pos-payment-cancel-without-reason' as const;

/** true = ödeme → satış geri dönüşüne izin (varsayılan). */
export function isPosPaymentBackToSaleAllowed(params?: ReportMenuParams): boolean {
  return isReportMenuParamEnabled(
    ALLOW_POS_PAYMENT_BACK_TO_SALE_PARAM,
    params ?? getRuntimeReportMenuParams(),
  );
}

/**
 * true = POS ödeme ekranı kapatılırken "iptal nedeni" soru modalı AÇILMAZ,
 * doğrudan `onClose` çağrılır (varsayılan: açık).
 *
 * Yönetici `pos-payment-cancel-without-reason` parametresini kapatırsa eski
 * davranışa (soru modalı) geri dönülür.
 */
export function isPosPaymentCancelWithoutReasonAllowed(params?: ReportMenuParams): boolean {
  return isReportMenuParamEnabled(
    POS_PAYMENT_CANCEL_WITHOUT_REASON_PARAM,
    params ?? getRuntimeReportMenuParams(),
  );
}
