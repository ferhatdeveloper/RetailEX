import type { Sale, SaleItem } from '../../core/types';
import type { ReceiptSettings } from '../../services/receiptSettingsService';
import { formatMoneyWithCode } from '../../utils/currency';
import { formatNumber } from '../../utils/formatNumber';
import { receiptNotesForDisplay } from '../../utils/receiptNotes';
import { customerReceiptRows } from '../../utils/saleCustomerSnapshot';
import { RECEIPT_A4_DOCUMENT_CSS } from '../../utils/receiptA4DocumentCss';
import { RECEIPT_A5_DOCUMENT_CSS } from '../../utils/receiptA5DocumentCss';

export type ReceiptStandardPaymentRow = {
  method?: string;
  amount?: number;
  currency?: string;
};

export type ReceiptPaperFormat = 'A4' | 'A5';

export type ReceiptStandardDocumentProps = {
  sale: Sale;
  paymentData: {
    payments?: ReceiptStandardPaymentRow[];
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
  paperFormat?: ReceiptPaperFormat;
};

function paymentMethodLabel(
  method: string | undefined,
  t: ReceiptStandardDocumentProps['translations']
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

export function ReceiptStandardDocument({
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
  paperFormat = 'A4',
}: ReceiptStandardDocumentProps) {
  const isA5 = paperFormat === 'A5';
  const rx = (part: string) => (isA5 ? `rx-a5-${part}` : `rx-a4-${part}`);
  const docCss = isA5 ? RECEIPT_A5_DOCUMENT_CSS : RECEIPT_A4_DOCUMENT_CSS;
  const barcodeW = isA5 ? 150 : 180;
  const barcodeH = isA5 ? 34 : 40;

  const r = translations.receipt;
  const companyName = receiptSettings?.companyName?.trim() || 'Asin';
  const logo = receiptSettings?.logoDataUrl?.trim();
  const logoSafe = logo && logo.startsWith('data:image/') ? logo : undefined;
  const noteText = receiptNotesForDisplay(sale.notes);
  const payments = paymentData.payments?.length
    ? paymentData.payments
    : [{ method: sale.paymentMethod, amount: sale.total, currency: baseCurrency }];

  const lbl = (key: string, fallback: string) => r[key] || fallback;
  const productLabel = lbl('productLabel', 'Ürün');
  const codeLabel = lbl('productCodeLabel', 'Kod');
  const unitPriceLabel = lbl('unitPriceLabel', 'Birim Fiyat');
  const qtyLabel = lbl('qtyLabel', 'Adet');
  const amountLabel = lbl('amountLabel', 'Tutar');

  return (
    <>
      <style>{docCss}</style>
      <div className={rx('doc')} dir={isRTL ? 'rtl' : 'ltr'}>
        <div className={rx('accent-bar')} />
        <div className={rx('sheet')}>
          <header className={rx('header')}>
            <div className={rx('brand')}>
              {logoSafe ? <img src={logoSafe} alt="" className={rx('logo')} /> : null}
              <div>
                <h1 className={rx('company-name')}>{companyName}</h1>
                <div className={rx('company-meta')}>
                  {receiptSettings?.companyAddress ? <div>{receiptSettings.companyAddress}</div> : null}
                  {receiptSettings?.companyPhone ? <div>{receiptSettings.companyPhone}</div> : null}
                  {receiptSettings?.companyTaxNumber ? (
                    <div>
                      {receiptSettings.companyTaxOffice ? `${receiptSettings.companyTaxOffice}: ` : ''}
                      {receiptSettings.companyTaxNumber}
                    </div>
                  ) : null}
                  {firmTitle?.trim() ? <div style={{ marginTop: 4, fontWeight: 700 }}>{firmTitle.trim()}</div> : null}
                </div>
              </div>
            </div>
            <div className={rx('title-block')}>
              <h2 className={rx('doc-title')}>{lbl('title', 'SATIŞ FİŞİ')}</h2>
              <div className={rx('doc-subtitle')}>{lbl('footer', 'Profesyonel ERP Çözümleri')}</div>
            </div>
          </header>

          {headerBanner?.trim() ? <div className={rx('banner')}>{headerBanner.trim()}</div> : null}

          <div className={rx('info-grid')}>
            <div className={rx('info-card')}>
              <h3>{lbl('customer', 'MÜŞTERİ')}</h3>
              {customerReceiptRows(sale).map((row) => (
                <div className={rx('info-row')} key={row.label}>
                  <span>{row.label}</span>
                  <span>{row.value}</span>
                </div>
              ))}
              {sale.table ? (
                <div className={rx('info-row')}>
                  <span>{lbl('table', 'Masa')}</span>
                  <span>{sale.table}</span>
                </div>
              ) : null}
              {receiptDeviceName ? (
                <div className={rx('info-row')}>
                  <span>{lbl('device', 'Cihaz')}</span>
                  <span>{receiptDeviceName}</span>
                </div>
              ) : null}
            </div>
            <div className={rx('info-card')}>
              <h3>{lbl('receiptNo', 'FİŞ BİLGİLERİ')}</h3>
              <div className={rx('info-row')}>
                <span>{lbl('receiptNo', 'Fiş No')}</span>
                <span>{sale.receiptNumber}</span>
              </div>
              <div className={rx('info-row')}>
                <span>{lbl('date', 'Tarih')}</span>
                <span>{formatDate(sale.date)}</span>
              </div>
              <div className={rx('info-row')}>
                <span>{lbl('cashier', 'Kasiyer')}</span>
                <span>{sale.cashier}</span>
              </div>
            </div>
          </div>

          {noteText ? (
            <div className={rx('info-card')} style={{ marginBottom: isA5 ? 10 : 14 }}>
              <h3>{lbl('noteLabel', 'NOT')}</h3>
              <div style={{ whiteSpace: 'pre-wrap', fontSize: isA5 ? '8.5pt' : '10pt', color: '#334155' }}>{noteText}</div>
            </div>
          ) : null}

          <div className={rx('table-wrap')} data-section="items">
            <table className={rx('table')}>
              <thead>
                <tr>
                  <th className={rx('num')}>#</th>
                  <th className={rx('code')}>{codeLabel}</th>
                  <th className={rx('desc')}>{productLabel}</th>
                  <th className={rx('unit')}>{unitPriceLabel}</th>
                  <th className={rx('qty')}>{qtyLabel}</th>
                  <th className={rx('money')}>{amountLabel}</th>
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
                  const productCode = (si.productCode || '').trim() || '—';
                  return (
                    <tr key={`${item.productId}-${index}`}>
                      <td className={rx('num')}>{index + 1}</td>
                      <td className={rx('code')}>{productCode}</td>
                      <td className={rx('desc')}>
                        <div className={rx('item-name')}>{lineProductName(item)}</div>
                        <div className={rx('item-sub')}>
                          {variant ? <div>{variant}</div> : null}
                          {staff ? (
                            <div>
                              {lbl('staff', 'Personel')}: {staff}
                            </div>
                          ) : null}
                        </div>
                      </td>
                      <td className={rx('unit')}>{lineUnitPrice(item, moneyDecimals)}</td>
                      <td className={rx('qty')}>{item.quantity}</td>
                      <td className={rx('money')}>{fmtMoney(item.total)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className={rx('bottom')}>
            <div className={rx('payments')} data-section="payments">
              <h3>{lbl('paymentDetails', 'ÖDEME DETAYLARI')}</h3>
              {payments.map((payment, index) => {
                const payCode = (payment.currency || baseCurrency).trim().toUpperCase();
                const amount =
                  payCode === baseCurrency
                    ? fmtMoney(payment.amount ?? 0)
                    : formatMoneyWithCode(payment.amount ?? 0, payCode);
                return (
                  <div className={rx('pay-row')} key={index}>
                    <span>{paymentMethodLabel(payment.method, translations)}</span>
                    <span>{amount}</span>
                  </div>
                );
              })}
              {(paymentData.totalPaid ?? 0) > 0 ? (
                <div className={rx('pay-row')} style={{ marginTop: 8, fontWeight: 800 }}>
                  <span>{lbl('paid', 'Ödenen')}</span>
                  <span>{fmtMoney(paymentData.totalPaid || 0)}</span>
                </div>
              ) : null}
              {(paymentData.change ?? 0) > 0 ? (
                <div className={rx('pay-row')} style={{ color: '#15803d', fontWeight: 800 }}>
                  <span>{lbl('change', 'Para Üstü')}</span>
                  <span>{fmtMoney(paymentData.change || 0)}</span>
                </div>
              ) : null}
            </div>

            <div className={rx('totals')} data-section="totals">
              <div className={rx('total-row')}>
                <span>{lbl('subtotal', 'Ara Toplam')}</span>
                <span>{fmtMoney(sale.subtotal)}</span>
              </div>
              {sale.discount > 0 ? (
                <div className={`${rx('total-row')} discount`}>
                  <span>{lbl('discount', 'İndirim')}</span>
                  <span>-{fmtMoney(sale.discount)}</span>
                </div>
              ) : null}
              {(sale.campaignDiscount && sale.campaignDiscount > 0) || sale.campaignName ? (
                <div className={`${rx('total-row')} campaign`}>
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
                <div className={rx('total-row')}>
                  <span>KDV</span>
                  <span>{fmtMoney(sale.tax)}</span>
                </div>
              ) : null}
              <div className={rx('grand-total')}>
                <span>{lbl('total', 'TOPLAM')}</span>
                <span>{fmtMoney(sale.total)}</span>
              </div>
            </div>
          </div>

          <footer className={rx('footer')} data-section="footer">
            <div className={rx('thanks')}>*** {lbl('thanks', 'Bizi Tercih Ettiğiniz İçin Teşekkürler')} ***</div>
            <div className={rx('barcode-box')}>
              <svg width={barcodeW} height={barcodeH} viewBox={`0 0 ${barcodeW} ${barcodeH}`} aria-hidden>
                {Array.from({ length: isA5 ? 18 : 22 }).map((_, i) => (
                  <rect
                    key={i}
                    x={i * (isA5 ? 8 : 8)}
                    y={0}
                    width={i % 3 === 0 ? (isA5 ? 4 : 5) : isA5 ? 2 : 3}
                    height={barcodeH}
                    fill="#0f172a"
                  />
                ))}
              </svg>
              <div className={rx('barcode-no')}>{sale.receiptNumber}</div>
            </div>
          </footer>

          <div className={rx('legal')}>{lbl('returnPolicy', 'Bu fiş iade ve değişim işlemlerinde gereklidir.')}</div>
        </div>
      </div>
    </>
  );
}
