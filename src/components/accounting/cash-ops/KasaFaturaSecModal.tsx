/**
 * Kasa işlemleri — mevcut fatura seçimi (alış / satış / hizmet).
 * Yeni fatura oluşturmaz; fatura listesinden belge seçilir.
 */

import { useEffect, useState } from 'react';
import { X, Search, FileText, Loader2 } from 'lucide-react';
import { useLanguage } from '../../../contexts/LanguageContext';
import { PercentBodyModal, PercentBodyModalScrollBody } from '../../shared/PercentBodyModal';
import { invoicesAPI } from '../../../services/api/invoices';
import type { Invoice } from '../../../core/types/models';
import { formatCurrency } from '../../../utils/currency';
import type { KasaInvoiceIslemTipi } from '../../../services/api/kasa';
import { invoiceCategoryForKasaIslem } from '../../../services/api/kasa';

interface KasaFaturaSecModalProps {
  islemTipi: KasaInvoiceIslemTipi;
  onSelect: (invoice: Invoice) => void;
  onClose: () => void;
}

export function KasaFaturaSecModal({ islemTipi, onSelect, onClose }: KasaFaturaSecModalProps) {
  const { tm } = useLanguage();
  const category = invoiceCategoryForKasaIslem(islemTipi);
  const title =
    islemTipi === 'ALIS_FATURASI'
      ? tm('cashPurchaseInvoice')
      : islemTipi === 'HIZMET_FATURASI'
        ? tm('cashServiceInvoice')
        : tm('cashSalesInvoice');

  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Invoice[]>([]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      try {
        const page = await invoicesAPI.getPaginated({
          page: 1,
          pageSize: 80,
          search: search.trim() || undefined,
          invoiceCategory: category,
        });
        if (!cancelled) setRows(Array.isArray(page.data) ? page.data : []);
      } catch (err) {
        console.warn('[KasaFaturaSecModal] list:', err);
        if (!cancelled) setRows([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    const t = window.setTimeout(run, search.trim() ? 280 : 0);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [category, search]);

  const formatDate = (raw?: string) => {
    const d = String(raw || '').slice(0, 10);
    if (!d) return '—';
    try {
      return new Date(d).toLocaleDateString('tr-TR');
    } catch {
      return d;
    }
  };

  return (
    <PercentBodyModal onClose={onClose} size="list" ariaLabel={tm('selectInvoiceForCash')}>
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-5 text-white shrink-0 flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <FileText className="w-6 h-6 shrink-0" />
          <div className="min-w-0">
            <h3 className="text-lg font-semibold truncate">{tm('selectInvoiceForCash')}</h3>
            <p className="text-sm text-blue-100 truncate">{title}</p>
          </div>
        </div>
        <button type="button" onClick={onClose} className="p-1 hover:bg-white/10 rounded">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="px-6 py-3 border-b border-slate-100 shrink-0">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={tm('searchPlaceholder') || tm('searchTitle')}
            className="w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      <PercentBodyModalScrollBody className="p-4">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-slate-400 gap-2">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>{tm('loading') || '…'}</span>
          </div>
        ) : rows.length === 0 ? (
          <p className="text-center text-slate-400 py-16">{tm('noInvoicesFound')}</p>
        ) : (
          <div className="space-y-2">
            {rows.map((inv) => {
              const partner = inv.customer_name || inv.supplier_name || '—';
              return (
                <button
                  key={inv.id || inv.invoice_no}
                  type="button"
                  onClick={() => onSelect(inv)}
                  className="w-full text-left border border-slate-200 rounded-xl px-4 py-3 hover:border-blue-400 hover:bg-blue-50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-mono font-semibold text-slate-900 truncate">
                        {inv.invoice_no || '—'}
                      </div>
                      <div className="text-sm text-slate-600 truncate">{partner}</div>
                      <div className="text-xs text-slate-400 mt-0.5">{formatDate(inv.invoice_date || inv.created_at)}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-bold text-slate-900">{formatCurrency(Number(inv.total_amount || 0))}</div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </PercentBodyModalScrollBody>

      <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex justify-end shrink-0">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2.5 rounded-2xl border-2 border-slate-200 text-slate-600 font-bold uppercase text-sm tracking-wider hover:bg-slate-100"
        >
          {tm('cancel')}
        </button>
      </div>
    </PercentBodyModal>
  );
}
