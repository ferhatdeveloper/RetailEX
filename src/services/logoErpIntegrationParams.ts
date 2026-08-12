/**
 * Logo ERP entegrasyon — Parametreler sekmesi (ek ayarlar).
 */

const STORAGE_KEY = 'retailex_logo_erp_integration_params';

export type LogoErpIntegrationParams = {
  /** Ürün kartları otomatik gönderilsin */
  autoSendProducts: boolean;
  /** Hizmet kartları otomatik gönderilsin */
  autoSendServices: boolean;
  /** Cari hesap kartları otomatik gönderilsin */
  autoSendCari: boolean;
  /** Belge aktarım gün sayısı */
  documentTransferDays: number;
  /** Muhasebe kodları doldurulsun */
  fillAccountingCodes: boolean;
  /** Banka — hesap kodu boşluk sayısı */
  bankAccountCodeSpaces: number;
};

const DEFAULT_PARAMS: LogoErpIntegrationParams = {
  autoSendProducts: false,
  autoSendServices: false,
  autoSendCari: false,
  documentTransferDays: 0,
  fillAccountingCodes: false,
  bankAccountCodeSpaces: 0,
};

export function loadLogoErpIntegrationParams(): LogoErpIntegrationParams {
  if (typeof window === 'undefined') return { ...DEFAULT_PARAMS };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PARAMS };
    const parsed = JSON.parse(raw) as Partial<LogoErpIntegrationParams>;
    return {
      ...DEFAULT_PARAMS,
      ...parsed,
      documentTransferDays: Math.max(0, Number(parsed.documentTransferDays) || 0),
      bankAccountCodeSpaces: Math.max(0, Number(parsed.bankAccountCodeSpaces) || 0),
    };
  } catch {
    return { ...DEFAULT_PARAMS };
  }
}

export function saveLogoErpIntegrationParams(
  patch: Partial<LogoErpIntegrationParams>,
): LogoErpIntegrationParams {
  const next = { ...loadLogoErpIntegrationParams(), ...patch };
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent('retailex:logo-erp-params-saved'));
  }
  return next;
}
