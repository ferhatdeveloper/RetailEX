/**
 * Üretim Tamamlama Dialog'u — PercentBodyModal compact
 * 1) Üretilen miktar + maliyet önizleme
 * 2) Tamamla → servis.completeOrder
 * 3) Sonrası: "Bu üretim için alış faturası oluştur?" (mevcut kasap akışıyla aynı)
 */

import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, FileText, Loader2, Receipt, Truck, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  PercentBodyModal,
  PercentBodyModalScrollBody,
} from '@/components/shared/PercentBodyModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/components/ui/utils';

import { unifiedProductionService } from '@/services/production/unifiedProductionService';
import { unifiedProductionAPI } from '@/services/production/unifiedProductionAPI';
import type {
  ProductionOrder,
  ButcherOrder,
  ProductionMode,
} from '@/services/production/types';
import {
  InvoiceCariSelectModal,
  type InvoiceCariItem,
} from '@/components/trading/invoices/InvoiceCariSelectModal';
import { supplierAPI } from '@/services/api/suppliers';

type AnyOrder =
  | { kind: 'general'; data: ProductionOrder }
  | { kind: 'butcher'; data: ButcherOrder };

type Props = {
  order: AnyOrder;
  onClose: () => void;
  onCompleted: () => void;
};

export function OrderCompleteDialog({ order, onClose, onCompleted }: Props) {
  const isGeneral = order.kind === 'general';
  const defaultQty = useMemo(() => {
    if (isGeneral) return order.data.plannedQty;
    return (order.data as ButcherOrder).inputQtyKg;
  }, [order, isGeneral]);

  const [producedQty, setProducedQty] = useState<number>(defaultQty);
  const [submitting, setSubmitting] = useState(false);
  const [askInvoice, setAskInvoice] = useState(false);
  const [completedOrder, setCompletedOrder] = useState<{ orderId: string; orderNo?: string } | null>(null);
  const [cariModalOpen, setCariModalOpen] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState<InvoiceCariItem | null>(null);
  const [suppliers, setSuppliers] = useState<InvoiceCariItem[]>([]);

  // Ön kontrol
  const expectedTotal = useMemo(() => {
    if (isGeneral) {
      // Maliyet = toplam üretim miktarı × 1 birim mamulün reçete maliyeti
      return null;
    }
    const bOrder = order.data as ButcherOrder;
    return bOrder.inputTotalCost;
  }, [isGeneral, order]);

  const handleSubmit = async () => {
    if (producedQty <= 0) {
      toast.error('Üretim miktarı 0 olamaz');
      return;
    }
    setSubmitting(true);
    try {
      const result = await unifiedProductionService.complete({
        mode: order.kind === 'general' ? 'general' : 'butcher',
        orderId: order.data.id!,
        producedQty,
      });
      if (!result.ok) {
        toast.error(result.error || 'Üretim tamamlanamadı');
        return;
      }
      toast.success(`Üretim tamamlandı${result.orderNo ? ` · ${result.orderNo}` : ''}`);
      setCompletedOrder({ orderId: result.orderId!, orderNo: result.orderNo });
      onCompleted();
      if (result.suggestPurchaseInvoice && !order.data.purchaseInvoiceId) {
        setAskInvoice(true);
      } else {
        onClose();
      }
    } catch (e) {
      console.error(e);
      toast.error('Beklenmeyen hata');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSkipInvoice = () => {
    setAskInvoice(false);
    onClose();
  };

  const handleConfirmInvoice = async () => {
    try {
      const list = await supplierAPI.getAll({ cardType: 'supplier' });
      setSuppliers(
        list.map((s) => ({ id: s.id, code: s.code, name: s.name, phone: s.phone, email: s.email })),
      );
    } catch (e) {
      console.warn('[OrderCompleteDialog] suppliers load failed:', e);
      setSuppliers([]);
    }
    setCariModalOpen(true);
  };

  const handleSupplierSelected = (item: InvoiceCariItem | null) => {
    if (!item) return;
    setSelectedSupplier(item);
    setCariModalOpen(false);
  };

  const handleCreateInvoice = async () => {
    if (!completedOrder || !selectedSupplier) {
      toast.error('Tedarikçi seçilmedi');
      return;
    }
    try {
      const mode: ProductionMode = order.kind === 'general' ? 'general' : 'butcher';
      const result = await unifiedProductionService.createPurchaseInvoiceFromOrder({
        mode,
        orderId: completedOrder.orderId,
        supplierId: selectedSupplier.id,
        supplierName: selectedSupplier.name,
        supplierCode: selectedSupplier.code,
      });
      if (!result.ok) {
        toast.error(result.error || 'Alış faturası oluşturulamadı');
        return;
      }
      toast.success(
        result.alreadyLinked
          ? 'Bu emre zaten bir alış faturası bağlıydı'
          : `Alış faturası oluşturuldu · ${result.invoiceNo || ''}`,
      );
      onCompleted();
      onClose();
    } catch (e) {
      console.error(e);
      toast.error('Fatura oluşturulamadı');
    }
  };

  return (
    <>
      <PercentBodyModal onClose={onClose} size="compact" ariaLabel="Üretimi Tamamla">
        <div className="px-6 py-5 text-white shrink-0 flex justify-between items-center bg-gradient-to-r from-green-600 to-emerald-600">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5" />
            <div>
              <h2 className="text-base font-bold tracking-tight">Üretimi Tamamla</h2>
              <p className="text-[11px] text-white/80 mt-0.5">
                {isGeneral ? 'Genel Üretim Emri' : 'Kasap Üretim Fişi'} ·{' '}
                <span className="font-mono">{order.data.orderNo}</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Kapat"
            disabled={submitting}
            className="text-white/80 hover:text-white hover:bg-white/10 rounded-lg p-2 transition-colors disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <PercentBodyModalScrollBody className="p-6 space-y-5">
          {!askInvoice ? (
            <>
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  {isGeneral ? 'Üretilen Miktar' : 'Tamamlanan Girdi (kg)'}
                </label>
                <Input
                  type="number"
                  min={0}
                  step="0.001"
                  value={producedQty}
                  onChange={(e) => setProducedQty(Number(e.target.value) || 0)}
                  className="h-11 text-base font-bold rounded-2xl border-slate-200"
                />
                <p className="text-[10px] text-slate-500">
                  Planlanan: {defaultQty} {isGeneral ? 'birim' : 'kg'}
                </p>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-2">
                <SummaryRow
                  label="Reçete / Mamul"
                  value={
                    isGeneral
                      ? order.data.recipeName || '—'
                      : (order.data as ButcherOrder).recipeName || '—'
                  }
                />
                <SummaryRow
                  label="Ürün"
                  value={
                    isGeneral
                      ? order.data.productName || '—'
                      : (order.data as ButcherOrder).inputProductName || '—'
                  }
                />
                {!isGeneral && expectedTotal != null && (
                  <SummaryRow
                    label="Toplam Girdi Maliyeti"
                    value={`${expectedTotal.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} IQD`}
                    bold
                  />
                )}
                {isGeneral && (
                  <SummaryRow
                    label="Üretilecek Stok"
                    value={order.data.productName || '—'}
                  />
                )}
              </div>

              <div className="bg-amber-50 border border-amber-100 rounded-2xl p-3 text-[11px] text-amber-800 leading-relaxed">
                {isGeneral
                  ? 'Stok kontrolü sıkıdır. Yetersiz hammaddede üretim tamamlanamaz. Tamamlayınca stoklar otomatik güncellenir.'
                  : 'Kasap fişinde fire ve maliyet dağılımı otomatik hesaplanır. Yetersiz girdi stoğu varsa firma ayarı kontrol edilir.'}
              </div>
            </>
          ) : (
            <div className="space-y-4 text-center py-4">
              <div className="inline-flex p-4 bg-blue-50 rounded-full">
                <Receipt className="w-10 h-10 text-blue-600" />
              </div>
              <h3 className="text-base font-bold text-slate-900">
                Alış Faturası Oluşturulsun mu?
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Bu üretim için bir tedarikçiden alış faturası oluşturmak ister misiniz?
                <br />
                Fatura, üretim emrine bağlanacak; stok etkisiz oluşturulur (çift yazım yok).
              </p>
              <div className="text-[10px] text-slate-400 italic">
                {completedOrder?.orderNo} · Tamamlandı
              </div>
            </div>
          )}
        </PercentBodyModalScrollBody>

        <div className="p-5 border-t border-slate-100 bg-slate-50/50 flex gap-3 shrink-0 justify-end">
          {!askInvoice ? (
            <>
              <Button
                variant="ghost"
                onClick={onClose}
                disabled={submitting}
                className="rounded-2xl border-2 border-slate-200 text-slate-600 font-bold uppercase text-xs tracking-wider hover:bg-slate-100"
              >
                İptal
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={submitting}
                className="rounded-2xl bg-green-600 hover:bg-green-700 text-white font-bold uppercase text-xs tracking-wider shadow-lg active:scale-[0.98] shadow-green-200/50"
              >
                {submitting ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                )}
                Onayla ve Tamamla
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="ghost"
                onClick={handleSkipInvoice}
                className="rounded-2xl border-2 border-slate-200 text-slate-600 font-bold uppercase text-xs tracking-wider hover:bg-slate-100"
              >
                Hayır
              </Button>
              <Button
                onClick={handleConfirmInvoice}
                className="rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-bold uppercase text-xs tracking-wider shadow-lg active:scale-[0.98] shadow-blue-200/50"
              >
                <Truck className="w-4 h-4 mr-2" /> Tedarikçi Seç
              </Button>
            </>
          )}
        </div>
      </PercentBodyModal>

      <InvoiceCariSelectModal
        mode="supplier"
        items={suppliers}
        onClose={() => setCariModalOpen(false)}
        onSelect={handleSupplierSelected}
      />

      {/* Tedarikçi seçildi → son onay modalı yerine inline confirm */}
      {selectedSupplier && (
        <PercentBodyModal onClose={() => setSelectedSupplier(null)} size="compact" ariaLabel="Faturayı Oluştur">
          <div className="px-6 py-5 text-white shrink-0 flex items-center gap-3 bg-gradient-to-r from-blue-600 to-indigo-600">
            <FileText className="w-5 h-5" />
            <h2 className="text-base font-bold tracking-tight">Faturayı Oluştur</h2>
          </div>
          <PercentBodyModalScrollBody className="p-6 space-y-4">
            <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 text-sm space-y-1">
              <div className="text-[11px] font-bold text-blue-700 uppercase">Tedarikçi</div>
              <div className="font-semibold text-slate-900">
                {selectedSupplier.name}{' '}
                {selectedSupplier.code && (
                  <span className="text-xs font-mono text-slate-500">({selectedSupplier.code})</span>
                )}
              </div>
            </div>
            <div className="bg-amber-50 border border-amber-100 rounded-2xl p-3 text-[11px] text-amber-800">
              Bu işlem yeni bir alış faturası oluşturacak ve mevcut üretim emrine bağlayacak.
              Stok etkisi yoktur (üretim zaten stok yazdı).
            </div>
          </PercentBodyModalScrollBody>
          <div className="p-5 border-t border-slate-100 bg-slate-50/50 flex gap-3 shrink-0 justify-end">
            <Button
              variant="ghost"
              onClick={() => setSelectedSupplier(null)}
              className="rounded-2xl border-2 border-slate-200 text-slate-600 font-bold uppercase text-xs tracking-wider"
            >
              Vazgeç
            </Button>
            <Button
              onClick={handleCreateInvoice}
              className={cn(
                'rounded-2xl text-white font-bold uppercase text-xs tracking-wider shadow-lg active:scale-[0.98]',
                'bg-blue-600 hover:bg-blue-700 shadow-blue-200/50',
              )}
            >
              <Receipt className="w-4 h-4 mr-2" /> Faturayı Oluştur
            </Button>
          </div>
        </PercentBodyModal>
      )}
    </>
  );
}

function SummaryRow({
  label,
  value,
  bold,
}: {
  label: string;
  value: string;
  bold?: boolean;
}) {
  return (
    <div className="flex justify-between items-center text-xs">
      <span className="text-slate-500">{label}</span>
      <span className={cn('text-slate-800', bold && 'font-bold text-green-700')}>{value}</span>
    </div>
  );
}