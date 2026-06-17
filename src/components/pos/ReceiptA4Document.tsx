import type { Sale, SaleItem } from '../../core/types';
import type { ReceiptSettings } from '../../services/receiptSettingsService';
import { formatMoneyWithCode } from '../../utils/currency';
import { formatNumber } from '../../utils/formatNumber';
import { receiptNotesForDisplay } from '../../utils/receiptNotes';
import { RECEIPT_A4_DOCUMENT_CSS } from '../../utils/receiptA4DocumentCss';

export type ReceiptA4PaymentRow = {
  method?: string;
  amount?: number;
  currency?: string;
};

export type ReceiptA4DocumentProps = {
  sale: Sale;
  paymentData: {
    payments?: ReceiptA4PaymentRow[];
    totalPaid?: number;
    change?: number;
    remaining?: number;
  };
  receiptSettings?: ReceiptSettings | null;
  firmTitle?: string;
  translations: {
    receipt: Record<string, string | undefined>;
    cash?: string;
    card?: string;
    qrScanCode?: string;
  };
  fmtMoney: (amount: number) => string;
  baseCurrency: string;
  moneyDecimals: number;
  lineProductName: (item: SaleItem) => string;
  receiptDeviceName: string;
  headerBanner?: string;
  isRTL: boolean;
  formatDate: (date: string) => string;
};

function paymentMethodLabel(
  method: string | undefined,
  t: ReceiptA4DocumentProps['translations']
): string {
  const m = String(method || 'cash').toLowerCase();
  if (m === 'cash' || m === 'nakit') return t.cash || 'Nakit';
  if (m === 'card' || m === 'gateway' || m === 'kredi kartı') return t.card || 'Kart';
  if (m === 'veresiye') return 'Veresiye';
  return t.qrScanCode || method || 'Ödeme';
}

function lineUnitPrice(item: SaleItem, moneyDecimals: number): string {
  const mult = (item as any).multiplier && (item as any).multiplier > 1 ? (item as any).multiplier : 1;
  const price = mult > 1 ? item.price / mult : item.price;
  return formatNumber(price, moneyDecimals, moneyDecimals > 0);
}

export function ReceiptA4Document({
  sale,
  paymentData,
  receiptSettings,
  firmTitle = '',
  translations,
  fmtMoney,
  baseCurrency,
  moneyDecimals,
  lineProductName,
  receiptDeviceName,
  headerBanner,
  isRTL,
  formatDate,
}: ReceiptA4DocumentProps) {
  const r = translations.receipt;
  const companyName = receiptSettings?.companyName?.trim() || 'RetailEX';
  const logo = receiptSettings?.logoDataUrl?.trim();
  const logoSafe = logo && logo.startsWith('data:image/') ? logo : undefined;
  const noteText = receiptNotesForDisplay(sale.notes);
  const payments = paymentData.payments?.length
    ? paymentData.payments
    : [{ method: sale.paymentMethod, amount: sale.total, currency: baseCurrency }];

  const lbl = (key: string, fallback: string) => r[key] || fallback;
  const productLabel = lbl('productLabel', 'Ürün');
  const unitPriceLabel = lbl('unitPriceLabel', 'Birim Fiyat');
  const qtyLabel = lbl('qtyLabel', 'Adet');
  const amountLabel = lbl('amountLabel', 'Tutar');

  return (
    <>
      <style>{RECEIPT_A4_DOCUMENT_CSS}</style>
      <div className="rx-a4-doc" dir={isRTL ? 'rtl' : 'ltr'}>
        <div className="rx-a4-accent-bar" />
        <div className="rx-a4-sheet">
          <header className="rx-a4-header">
            <div className="rx-a4-brand">
              {logoSafe ? (
                <img src={logoSafe} alt="" className="rx-a4-logo" />
              ) : null}
              <div>
                <h1 className="rx-a4-company-name">{companyName}</h1>
                <div className="rx-a4-company-meta">
                  {receiptSettings?.companyAddress ? <div>{receiptSettings.companyAddress}</div> : null}
                  {receiptSettings?.companyPhone ? <div>{receiptSettings.companyPhone}</div> : null}
                  {receiptSettings?.companyTaxNumber ? (
                    <div>
                      {receiptSettings.companyTaxOffice
                        ? `${receiptSettings.companyTaxOffice}: `
                        : ''}
                      {receiptSettings.companyTaxNumber}
                    </div>
                  ) : null}
                  {firmTitle?.trim() ? <div style={{ marginTop: 4, fontWeight: 700 }}>{firmTitle.trim()}</div> : null}
                </div>
              </div>
            </div>
            <div className="rx-a4-title-block">
              <h2 className="rx-a4-doc-title">{lbl('title', 'SATIŞ FİŞİ')}</h2>
              <div className="rx-a4-doc-subtitle">{lbl('footer', 'Profesyonel ERP Çözümleri')}</div>
            </div>
          </header>

          {headerBanner?.trim() ? <div className="rx-a4-banner">{headerBanner.trim()}</div> : null}

          <div className="rx-a4-info-grid">
            <div className="rx-a4-info-card">
              <h3>{lbl('customer', 'MÜŞTERİ')}</h3>
              <div className="rx-a4-info-row">
                <span>{lbl('customer', 'Müşteri')}</span>
                <span>{sale.customerName?.trim() || '—'}</span>
              </div>
              {sale.customerPhone?.trim() ? (
                <div className="rx-a4-info-row">
                  <span>Tel</span>
                  <span>{sale.customerPhone.trim()}</span>
                </div>
              ) : null}
              {sale.table ? (
                <div className="rx-a4-info-row">
                  <span>{lbl('table', 'Masa')}</span>
                  <span>{sale.table}</span>
                </div>
              ) : null}
              {receiptDeviceName ? (
                <div className="rx-a4-info-row">
                  <span>{lbl('device', 'Cihaz')}</span>
                  <span>{receiptDeviceName}</span>
                </div>
              ) : null}
            </div>
            <div className="rx-a4-info-card">
              <h3>{lbl('receiptNo', 'FİŞ BİLGİLERİ')}</h3>
              <div className="rx-a4-info-row">
                <span>{lbl('receiptNo', 'Fiş No')}</span>
                <span>{sale.receiptNumber}</span>
              </div>
              <div className="rx-a4-info-row">
                <span>{lbl('date', 'Tarih')}</span>
                <span>{formatDate(sale.date)}</span>
              </div>
              <div className="rx-a4-info-row">
                <span>{lbl('cashier', 'Kasiyer')}</span>
                <span>{sale.cashier}</span>
              </div>
            </div>
          </div>

          {noteText ? (
            <div className="rx-a4-info-card" style={{ marginBottom: 14 }}>
              <h3>{lbl('noteLabel', 'NOT')}</h3>
              <div style={{ whiteSpace: 'pre-wrap', fontSize: '10pt', color: '#334155' }}>{noteText}</div>
            </div>
          ) : null}

          <div className="rx-a4-table-wrap" data-section="items">
            <table className="rx-a4-table">
              <thead>
                <tr>
                  <th className="rx-a4-num">#</th>
                  <th className="rx-a4-desc">{productLabel}</th>
                  <th className="rx-a4-unit">{unitPriceLabel}</th>
                  <th className="rx-a4-qty">{qtyLabel}</th>
                  <th className="rx-a4-money">{amountLabel}</th>
                </tr>
              </thead>
              <tbody>
                {sale.items.map((item, index) => {
                  const si = item as SaleItem;
                  const variant =
                    item.variant && ((item.variant as any).color || (item.variant as any).size)
                      ? `${(item.variant as any).color || ''} ${(item.variant as any).size || ''}`.trim()
                      : '';
                  const staff = si.beautyStaffName?.trim();
                  return (
                    <tr key={`${item.productId}-${index}`}>
                      <td className="rx-a4-num">{index + 1}</td>
                      <td className="rx-a4-desc">
                        <div className="rx-a4-item-name">{lineProductName(item)}</div>
                        <div className="rx-a4-item-sub">
                          {variant ? <div>{variant}</div> : null}
                          {staff ? (
                            <div>
                              {lbl('staff', 'Personel')}: {staff}
                            </div>
                          ) : null}
                        </div>
                      </td>
                      <td className="rx-a4-unit">{lineUnitPrice(item, moneyDecimals)}</td>
                      <td className="rx-a4-qty">{item.quantity}</td>
                      <td className="rx-a4-money">{fmtMoney(item.total)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="rx-a4-bottom">
            <div className="rx-a4-payments" data-section="payments">
              <h3>{lbl('paymentDetails', 'ÖDEME DETAYLARI')}</h3>
              {payments.map((payment, index) => {
                const payCode = (payment.currency || baseCurrency).trim().toUpperCase();
                const amount =
                  payCode === baseCurrency
                    ? fmtMoney(payment.amount ?? 0)
                    : formatMoneyWithCode(payment.amount ?? 0, payCode);
                return (
                  <div className="rx-a4-pay-row" key={index}>
                    <span>{paymentMethodLabel(payment.method, translations)}</span>
                    <span>{amount}</span>
                  </div>
                );
              })}
              {(paymentData.totalPaid ?? 0) > 0 ? (
                <div className="rx-a4-pay-row" style={{ marginTop: 8, fontWeight: 800 }}>
                  <span>{lbl('paid', 'Ödenen')}</span>
                  <span>{fmtMoney(paymentData.totalPaid || 0)}</span>
                </div>
              ) : null}
              {(paymentData.change ?? 0) > 0 ? (
                <div className="rx-a4-pay-row" style={{ color: '#15803d', fontWeight: 800 }}>
                  <span>{lbl('change', 'Para Üstü')}</span>
                  <span>{fmtMoney(paymentData.change || 0)}</span>
                </div>
              ) : null}
            </div>

            <div className="rx-a4-totals" data-section="totals">
              <div className="rx-a4-total-row">
                <span>{lbl('subtotal', 'Ara Toplam')}</span>
                <span>{fmtMoney(sale.subtotal)}</span>
              </div>
              {sale.discount > 0 ? (
                <div className="rx-a4-total-row discount">
                  <span>{lbl('discount', 'İndirim')}</span>
                  <span>-{fmtMoney(sale.discount)}</span>
                </div>
              ) : null}
              {(sale.campaignDiscount && sale.campaignDiscount > 0) || sale.campaignName ? (
                <div className="rx-a4-total-row campaign">
                  <span>
                    {lbl('campaign', 'Kampanya')}
                    {sale.campaignName ? ` (${sale.campaignName})` : ''}
                  </span>
                  <span>
                    {sale.campaignDiscount && sale.campaignDiscount > 0
                      ? `-${fmtMoney(sale.campaignDiscount)}`
                      : fmtMoney(0)}
                  </span>
                </div>
              ) : null}
              {sale.tax && sale.tax > 0 ? (
                <div className="rx-a4-total-row">
                  <span>KDV</span>
                  <span>{fmtMoney(sale.tax)}</span>
                </div>
              ) : null}
              <div className="rx-a4-grand-total">
                <span>{lbl('total', 'TOPLAM')}</span>
                <span>{fmtMoney(sale.total)}</span>
              </div>
            </div>
          </div>

          <footer className="rx-a4-footer" data-section="footer">
            <div className="rx-a4-thanks">*** {lbl('thanks', 'Bizi Tercih Ettiğiniz İçin Teşekkürler')} ***</div>
            <div className="rx-a4-barcode-box">
              <svg width="180" height="40" viewBox="0 0 180 40" aria-hidden>
                {Array.from({ length: 22 }).map((_, i) => (
                  <rect key={i} x={i * 8} y={0} width={i % 3 === 0 ? 5 : 3} height={40} fill="#0f172a" />
                ))}
              </svg>
              <div className="rx-a4-barcode-no">{sale.receiptNumber}</div>
            </div>
          </footer>

          <div className="rx-a4-legal">{lbl('returnPolicy', 'Bu fiş iade ve değişim işlemlerinde gereklidir.')}</div>
        </div>
      </div>
    </>
  );
}
