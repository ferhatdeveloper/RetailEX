import React from 'react';
import { X, Receipt, User, ShoppingBag, CreditCard, StickyNote, Tag, Calculator, Banknote } from 'lucide-react';
import type { Sale } from '../../core/types';
import { useLanguage } from '../../contexts/LanguageContext';
import { formatCurrency, formatNumber } from '../../utils/formatNumber';
import { saleCollectedSplit } from '../../utils/saleCollectedAmounts';
import { PercentBodyModal, PercentBodyModalScrollBody } from '../shared/PercentBodyModal';

interface POSCreditSaleDetailModalProps {
  sale: Sale | null;
  onClose: () => void;
}

interface PaymentRow {
  method: string;
  amount: number;
}

/** Kıdemli muhasebe denetimi: bu modal salt okunur, herhangi bir
 *  borç-alacak yönünü DEĞİŞTİRMEZ. Yalnızca `sale` objesini görüntüler. */
export function POSCreditSaleDetailModal({ sale, onClose }: POSCreditSaleDetailModalProps) {
  const { t, tm } = useLanguage();

  /** Ödeme yöntemi ham değerini okunabilir etikete çevirir
   *  (nakit / kart / veresiye / havale / diğer). */
  const describePaymentMethod = (method: string): string => {
    const m = String(method || '').toLowerCase();
    if (m === 'cash' || m === 'nakit') return tm('posCreditDetailMethodCash');
    if (m === 'card' || m === 'kart' || m === 'credit_card') return tm('posCreditDetailMethodCard');
    if (m === 'veresiye' || m === 'credit' || m === 'open_account' || m.includes('cari')) return tm('posCreditDetailMethodCredit');
    if (m === 'transfer' || m === 'havale' || m === 'bank_transfer' || m === 'wire' || m === 'bank' || m === 'banka') return tm('posCreditDetailMethodTransfer');
    return method || tm('posCreditDetailMethodTransfer');
  };

  /** Satış durumu için kısa etiket ve renk. */
  const describeStatus = (status?: string): { label: string; cls: string } => {
    const s = String(status || '').toLowerCase();
    if (s === 'completed' || s === 'paid' || !s) {
      return { label: tm('posCreditDetailStatusCompleted'), cls: 'bg-green-100 text-green-800 border-green-200' };
    }
    if (s === 'refunded' || s.includes('refund') || s.includes('iade')) {
      return { label: tm('posCreditDetailStatusRefunded'), cls: 'bg-red-100 text-red-800 border-red-200' };
    }
    if (s === 'cancelled' || s.includes('cancel') || s.includes('iptal')) {
      return { label: tm('posCreditDetailStatusCancelled'), cls: 'bg-gray-200 text-gray-800 border-gray-300' };
    }
    if (s === 'pending') {
      return { label: tm('posCreditDetailStatusPending'), cls: 'bg-yellow-100 text-yellow-800 border-yellow-200' };
    }
    return { label: status || '—', cls: 'bg-gray-100 text-gray-700 border-gray-200' };
  };

  if (!sale) return null;

  const items = Array.isArray(sale.items) ? sale.items : [];
  const subtotal = Number(sale.subtotal) || 0;
  const discount = Number(sale.discount) || 0;
  const tax = Number(sale.tax) || 0;
  const total = Math.abs(Number(sale.total) || 0);
  const split = saleCollectedSplit(sale);
  const collected = Number(split.collected) || 0;
  const remaining = Number(split.remaining) || 0;
  const change = Number(sale.change) || 0;
  const status = describeStatus(sale.status);

  // Ödeme satırları: önce `payments` dizisi, yoksa `paymentMethod` + `sale.total` ya da split
  const paymentRows: PaymentRow[] = (() => {
    if (Array.isArray(sale.payments) && sale.payments.length > 0) {
      return sale.payments.map((p) => ({
        method: describePaymentMethod(p.method),
        amount: Math.abs(Number(p.amount) || 0),
      }));
    }
    const rows: PaymentRow[] = [];
    const cash = Math.abs(Number(split.cash) || 0);
    const card = Math.abs(Number(split.card) || 0);
    const credit = Math.abs(Number(split.credit) || 0);
    const other = Math.abs(Number(split.transfer) || 0);
    if (cash > 1e-9) rows.push({ method: 'Nakit', amount: cash });
    if (card > 1e-9) rows.push({ method: 'Kart', amount: card });
    if (credit > 1e-9) rows.push({ method: 'Veresiye', amount: credit });
    if (other > 1e-9) rows.push({ method: 'Havale / Diğer', amount: other });
    if (rows.length === 0 && sale.paymentMethod) {
      rows.push({ method: describePaymentMethod(sale.paymentMethod), amount: total });
    }
    return rows;
  })();

  const totalPayments = paymentRows.reduce((sum, r) => sum + r.amount, 0);

  return (
    <PercentBodyModal onClose={onClose} size="wide" ariaLabel={sale.receiptNumber || sale.id}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-2.5 border-b border-gray-200 dark:border-gray-700 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-md bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0">
            <Receipt className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-gray-900 truncate">
              {tm('posCreditDetailReceiptHeader')} — {sale.receiptNumber || sale.id}
            </h3>
            <p className="text-xs text-gray-500">
              {new Date(sale.date).toLocaleString()}
              {sale.cashier ? ` · ${sale.cashier}` : ''}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`px-2 py-0.5 text-xs font-medium border rounded ${status.cls}`}>
            {status.label}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-1"
            aria-label="close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      <PercentBodyModalScrollBody className="p-5 space-y-4 bg-gray-50 dark:bg-gray-900">
        {/* Müşteri */}
        <section className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center gap-2 mb-2">
            <User className="w-4 h-4 text-indigo-600" />
            <h4 className="text-sm font-semibold text-gray-900">{t.customer}</h4>
          </div>
          {sale.customerName || sale.customerCompany ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-sm">
              <div>
                <span className="text-gray-500 text-xs">{t.customer}:</span>{' '}
                <span className="font-medium text-gray-900">
                  {sale.customerName || sale.customerCompany}
                </span>
              </div>
              {sale.customerPhone && (
                <div>
                  <span className="text-gray-500 text-xs">{tm('posCreditDetailPhone')}:</span>{' '}
                  <span className="text-gray-800">{sale.customerPhone}</span>
                </div>
              )}
              {sale.customerCode && (
                <div>
                  <span className="text-gray-500 text-xs">{tm('posCreditDetailCode')}:</span>{' '}
                  <span className="font-mono text-gray-800">{sale.customerCode}</span>
                </div>
              )}
              {sale.customerTaxNumber && (
                <div>
                  <span className="text-gray-500 text-xs">{tm('posCreditDetailTaxNumber')}:</span>{' '}
                  <span className="font-mono text-gray-800">{sale.customerTaxNumber}</span>
                </div>
              )}
              {(sale.customerAddress || sale.customerCity) && (
                <div className="sm:col-span-2 text-gray-700">
                  {[sale.customerAddress, sale.customerDistrict, sale.customerCity, sale.customerCountry]
                    .filter(Boolean)
                    .join(', ')}
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-gray-500">—</p>
          )}
        </section>

        {/* Ürünler */}
        <section className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-200 dark:border-gray-700">
            <ShoppingBag className="w-4 h-4 text-indigo-600" />
            <h4 className="text-sm font-semibold text-gray-900">
              {tm('posCreditDetailItemCount') || 'Kalem'} ({items.length})
            </h4>
          </div>
          {items.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-gray-500">—</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-900/40 text-xs uppercase text-gray-600 dark:text-gray-300">
                <tr>
                  <th className="text-left py-2 px-3 font-semibold">Ürün</th>
                  <th className="text-right py-2 px-3 font-semibold">Miktar</th>
                  <th className="text-right py-2 px-3 font-semibold">Birim Fiyat</th>
                  <th className="text-right py-2 px-3 font-semibold">İndirim</th>
                  <th className="text-right py-2 px-3 font-semibold">Tutar</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, idx) => {
                  const qty = Number(it.quantity) || 0;
                  const price = Number(it.price) || 0;
                  const disc = Number(it.discount) || 0;
                  const lineTotal = Math.abs(Number(it.total) || qty * price);
                  return (
                    <tr
                      key={`${it.productId}-${idx}`}
                      className="border-b border-gray-100 dark:border-gray-700 last:border-0"
                    >
                      <td className="py-2 px-3 text-gray-900 dark:text-gray-100">
                        <div className="font-medium">{it.productName || it.product_name || '—'}</div>
                        {it.productCode && (
                          <div className="text-xs text-gray-500 font-mono">{it.productCode}</div>
                        )}
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums text-gray-800">
                        {formatNumber(qty)}
                        {it.unit ? <span className="text-xs text-gray-500 ml-0.5">{it.unit}</span> : null}
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums text-gray-800">
                        {formatCurrency(price)}
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums text-gray-700">
                        {disc > 0 ? formatCurrency(disc) : '—'}
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums font-medium text-gray-900">
                        {formatCurrency(lineTotal)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>

        {/* Tutar özet + Ödeme (yan yana) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <section className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Calculator className="w-4 h-4 text-indigo-600" />
              <h4 className="text-sm font-semibold text-gray-900">{t.amount || 'Tutar'}</h4>
            </div>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">{t.subtotal}</span>
                <span className="tabular-nums text-gray-900">{formatCurrency(subtotal)}</span>
              </div>
              {discount > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-600">{t.discount}</span>
                  <span className="tabular-nums text-red-700">-{formatCurrency(discount)}</span>
                </div>
              )}
              {tax > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-600">{tm('posCreditDetailTax')}</span>
                  <span className="tabular-nums text-gray-900">{formatCurrency(tax)}</span>
                </div>
              )}
              <div className="flex justify-between pt-2 border-t border-gray-200 dark:border-gray-700 mt-2">
                <span className="font-semibold text-gray-900">{t.total}</span>
                <span className="tabular-nums font-bold text-indigo-700">{formatCurrency(total)}</span>
              </div>
              {sale.profit !== undefined && sale.profit !== null && (
                <div className="flex justify-between text-xs text-gray-500">
                  <span>{tm('posCreditDetailProfit')}</span>
                  <span className="tabular-nums">{formatCurrency(Number(sale.profit) || 0)}</span>
                </div>
              )}
            </div>
          </section>

          <section className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-4">
            <div className="flex items-center gap-2 mb-2">
              <CreditCard className="w-4 h-4 text-indigo-600" />
              <h4 className="text-sm font-semibold text-gray-900">{tm('posCreditDetailPayment')}</h4>
            </div>
            {paymentRows.length === 0 ? (
              <p className="text-sm text-gray-500">—</p>
            ) : (
              <div className="space-y-1 text-sm">
                {paymentRows.map((p, idx) => (
                  <div key={idx} className="flex justify-between">
                    <span className="text-gray-700">{p.method}</span>
                    <span className="tabular-nums text-gray-900">{formatCurrency(p.amount)}</span>
                  </div>
                ))}
                <div className="flex justify-between pt-2 border-t border-gray-200 dark:border-gray-700 mt-2">
                  <span className="font-semibold text-gray-900">{t.total}</span>
                  <span className="tabular-nums font-bold text-indigo-700">
                    {formatCurrency(totalPayments)}
                  </span>
                </div>
                {change > 0 && (
                  <div className="flex justify-between text-xs text-gray-600">
                    <span className="flex items-center gap-1">
                      <Banknote className="w-3 h-3" />
                      {tm('posCreditDetailChange')}
                    </span>
                    <span className="tabular-nums">{formatCurrency(change)}</span>
                  </div>
                )}
                {remaining > 0 && (
                  <div className="flex justify-between text-xs text-red-700 font-medium">
                    <span>{t.veresiyeLabel} ({tm('posCreditDetailRemaining')})</span>
                    <span className="tabular-nums">{formatCurrency(remaining)}</span>
                  </div>
                )}
                {collected > 0 && (
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>{tm('posCreditDetailCollected')}</span>
                    <span className="tabular-nums">{formatCurrency(collected)}</span>
                  </div>
                )}
              </div>
            )}
          </section>
        </div>

        {/* Kampanya + Not */}
        {(sale.campaignName || sale.notes) && (
          <section className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-4 space-y-2">
            {sale.campaignName && (
              <div className="flex items-center gap-2 text-sm">
                <Tag className="w-4 h-4 text-pink-600" />
                <span className="text-gray-600">{tm('posCreditDetailCampaign')}:</span>
                <span className="font-medium text-gray-900">{sale.campaignName}</span>
                {sale.campaignDiscount ? (
                  <span className="text-xs text-pink-700">(-{formatCurrency(sale.campaignDiscount)})</span>
                ) : null}
              </div>
            )}
            {sale.notes && (
              <div className="flex items-start gap-2 text-sm">
                <StickyNote className="w-4 h-4 text-amber-600 mt-0.5" />
                <div>
                  <div className="text-gray-600 text-xs">{tm('posCreditDetailNotes')}</div>
                  <div className="text-gray-900 whitespace-pre-wrap">{sale.notes}</div>
                </div>
              </div>
            )}
          </section>
        )}
      </PercentBodyModalScrollBody>

      <div className="px-5 py-3 border-t border-gray-200 dark:border-gray-700 shrink-0 flex justify-end">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 text-sm bg-gray-100 text-gray-700 hover:bg-gray-200 rounded-md"
        >
          {t.close}
        </button>
      </div>
    </PercentBodyModal>
  );
}
