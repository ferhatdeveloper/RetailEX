/**
 * POS ödeme ekranından satışa geri dönüş izni.
 * Parametre: system_settings.report_menu_params → `allow-pos-payment-back-to-sale`
 * (varsayılan: açık = geri dönüşe izin, fiş iptal neden modalı ile).
 */
import {
  getRuntimeReportMenuParams,
  isReportMenuParamEnabled,
  type ReportMenuParams,
} from '../services/reportMenuParamsService';

export const ALLOW_POS_PAYMENT_BACK_TO_SALE_PARAM = 'allow-pos-payment-back-to-sale' as const;

/** true = ödeme → satış geri dönüşüne izin (varsayılan). */
export function isPosPaymentBackToSaleAllowed(params?: ReportMenuParams): boolean {
  return isReportMenuParamEnabled(
    ALLOW_POS_PAYMENT_BACK_TO_SALE_PARAM,
    params ?? getRuntimeReportMenuParams(),
  );
}
