import React, { useEffect, useState, useMemo } from 'react';
import { X, Loader2, ImageIcon, RefreshCw, CheckSquare, Square } from 'lucide-react';
import { toast } from 'sonner';
import type { Product } from '../../../core/types';
import { imageSearchService } from '../../../services/imageSearchService';

export type BulkImageRow = {
  product: Product;
  status: 'idle' | 'loading' | 'ok' | 'error';
  previewBase64: string | null;
  errorMessage: string | null;
  /** Kullanıcı bu satırı güncellemek istiyor mu (yalnızca ok için anlamlı) */
  include: boolean;
};

function currentImageSrc(p: Product): string | null {
  const cdn = p.image_url_cdn?.trim();
  if (cdn) return cdn;
  const raw = p.image_url?.trim();
  if (!raw) return null;
  if (raw.startsWith('data:') || raw.startsWith('http')) return raw;
  if (raw.length > 80) return `data:image/jpeg;base64,${raw}`;
  return null;
}

async function fetchFirstImageBase64(productName: string): Promise<string> {
  const q = productName.trim().slice(0, 100);
  if (!q) throw new Error('Ürün adı boş');
  const results = await imageSearchService.searchImages(q, 1, 1);
  if (!results.length) throw new Error('Sonuç yok');
  return imageSearchService.downloadAndConvertToBase64(results[0].fullUrl, 800, 0.7);
}

export function BulkProductImageUpdateModal({
  products,
  onClose,
  onConfirm,
}: {
  products: Product[];
  onClose: () => void;
  onConfirm: (updates: { id: string; image_url: string }[]) => Promise<void>;
}) {
  const [rows, setRows] = useState<BulkImageRow[]>(() =>
    products.map((p) => ({
      product: p,
      status: 'idle',
      previewBase64: null,
      errorMessage: null,
      include: false,
    }))
  );
  const [loadingAll, setLoadingAll] = useState(true);
  const [saving, setSaving] = useState(false);

  const productsKey = useMemo(() => products.map((p) => p.id).join(','), [products]);

  const loadRow = async (index: number) => {
    setRows((prev) => {
      const next = [...prev];
      if (!next[index]) return prev;
      next[index] = { ...next[index], status: 'loading', errorMessage: null };
      return next;
    });
    const p = products[index];
    if (!p) return;
    try {
      const b64 = await fetchFirstImageBase64(p.name);
      setRows((prev) => {
        const next = [...prev];
        if (!next[index]) return prev;
        next[index] = {
          ...next[index],
          status: 'ok',
          previewBase64: b64,
          errorMessage: null,
          include: true,
        };
        return next;
      });
    } catch (e: any) {
      const msg = e?.message || 'Resim alınamadı';
      setRows((prev) => {
        const next = [...prev];
        if (!next[index]) return prev;
        next[index] = {
          ...next[index],
          status: 'error',
          previewBase64: null,
          errorMessage: msg,
          include: false,
        };
        return next;
      });
    }
  };

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoadingAll(true);
      const concurrency = 2;
      for (let i = 0; i < products.length; i += concurrency) {
        if (cancelled) break;
        const slice = products.slice(i, i + concurrency).map((_, j) => i + j);
        await Promise.all(slice.map((idx) => loadRow(idx)));
        await new Promise((r) => setTimeout(r, 350));
      }
      if (!cancelled) setLoadingAll(false);
    };
    void run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- yalnızca seçim değişince yeniden yükle
  }, [productsKey]);

  const toggleInclude = (index: number) => {
    setRows((prev) => {
      const next = [...prev];
      const row = next[index];
      if (!row || row.status !== 'ok') return prev;
      next[index] = { ...row, include: !row.include };
      return next;
    });
  };

  const selectAllOk = (value: boolean) => {
    setRows((prev) =>
      prev.map((r) => (r.status === 'ok' ? { ...r, include: value } : r))
    );
  };

  const handleSave = async () => {
    const updates = rows
      .filter((r) => r.status === 'ok' && r.include && r.previewBase64)
      .map((r) => ({ id: r.product.id, image_url: r.previewBase64! }));
    if (updates.length === 0) {
      toast.error('Güncellenecek ürün seçin (önizlemesi başarılı ve işaretli satırlar).');
      return;
    }
    setSaving(true);
    try {
      await onConfirm(updates);
      onClose();
    } catch (e: any) {
      toast.error(e?.message || 'Kayıt başarısız.');
    } finally {
      setSaving(false);
    }
  };

  const okCount = rows.filter((r) => r.status === 'ok').length;
  const selectedCount = rows.filter((r) => r.status === 'ok' && r.include).length;

  return (
    <div className="fixed inset-0 z-[11000] overflow-y-auto overflow-x-hidden bg-black/50 backdrop-blur-sm">
      <div className="flex min-h-[100dvh] min-h-screen w-full items-center justify-center p-3 sm:p-4 py-6">
        <div
          role="dialog"
          aria-modal="true"
          className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[min(90vh,100dvh)] flex flex-col min-h-0 overflow-hidden"
        >
        <div className="p-4 border-b bg-gradient-to-r from-violet-600 to-blue-600 text-white flex items-center justify-between shrink-0">
          <div>
            <h3 className="font-bold text-lg flex items-center gap-2">
              <ImageIcon className="w-5 h-5" />
              Toplu ürün resmi güncelleme
            </h3>
            <p className="text-xs text-white/80 mt-0.5">
              Ürün adına göre önerilen resimler listelenir; onayladığınız satırlar kaydedilir.
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-2 hover:bg-white/10 rounded-lg" disabled={saving}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-4 py-2 border-b bg-slate-50 flex flex-wrap items-center gap-3 text-sm shrink-0">
          <span className="text-slate-600">
            {loadingAll ? 'Önizlemeler yükleniyor…' : `${okCount} / ${rows.length} önizleme hazır`}
          </span>
          {okCount > 0 && (
            <>
              <button
                type="button"
                className="text-blue-600 font-medium hover:underline"
                onClick={() => selectAllOk(true)}
              >
                Tümünü seç
              </button>
              <span className="text-slate-300">|</span>
              <button
                type="button"
                className="text-slate-600 font-medium hover:underline"
                onClick={() => selectAllOk(false)}
              >
                Seçimi kaldır
              </button>
            </>
          )}
          <span className="ml-auto text-slate-500">Kayda gidecek: {selectedCount}</span>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-3 sm:p-4">
          <div className="space-y-2 sm:space-y-3">
            {rows.map((row, index) => {
              const cur = currentImageSrc(row.product);
              return (
                <div
                  key={row.product.id}
                  className="flex flex-wrap gap-3 sm:gap-4 items-center p-2.5 sm:p-3 rounded-xl border border-slate-200 bg-white shadow-sm"
                >
                  <button
                    type="button"
                    onClick={() => row.status === 'ok' && toggleInclude(index)}
                    className="shrink-0 p-1 disabled:opacity-40"
                    disabled={row.status !== 'ok'}
                    title={row.status === 'ok' ? 'Dahil et / çıkar' : ''}
                  >
                    {row.status === 'ok' && row.include ? (
                      <CheckSquare className="w-6 h-6 text-blue-600" />
                    ) : (
                      <Square className="w-6 h-6 text-slate-300" />
                    )}
                  </button>

                  <div className="flex-1 min-w-[180px]">
                    <p className="font-semibold text-slate-900 text-sm leading-snug">{row.product.name}</p>
                    {row.product.code && (
                      <p className="text-[11px] text-slate-400 font-mono mt-0.5">{row.product.code}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="text-center">
                      <p className="text-[10px] font-bold uppercase text-slate-400 mb-1">Mevcut</p>
                      <div className="w-20 h-20 rounded-lg border border-slate-200 bg-slate-100 overflow-hidden flex items-center justify-center">
                        {cur ? (
                          <img src={cur} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-[10px] text-slate-400 px-1">Yok</span>
                        )}
                      </div>
                    </div>

                    <div className="text-slate-300 text-xl">→</div>

                    <div className="text-center">
                      <p className="text-[10px] font-bold uppercase text-emerald-600 mb-1">Yeni</p>
                      <div className="w-20 h-20 rounded-lg border-2 border-emerald-200 bg-emerald-50 overflow-hidden flex items-center justify-center">
                        {row.status === 'loading' && <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />}
                        {row.status === 'ok' && row.previewBase64 && (
                          <img src={row.previewBase64} alt="" className="w-full h-full object-cover" />
                        )}
                        {row.status === 'error' && (
                          <span className="text-[8px] sm:text-[9px] text-red-500 px-0.5 text-center leading-tight line-clamp-6 break-words max-w-[5.5rem]">
                            {row.errorMessage}
                          </span>
                        )}
                        {row.status === 'idle' && <Loader2 className="w-6 h-6 animate-spin text-slate-300" />}
                      </div>
                    </div>

                    {row.status === 'error' && (
                      <button
                        type="button"
                        onClick={() => loadRow(index)}
                        className="flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        Tekrar dene
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="p-3 sm:p-4 border-t bg-slate-50 flex flex-wrap justify-end gap-2 sm:gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-200 rounded-xl"
            disabled={saving}
          >
            İptal
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || selectedCount === 0}
            className="px-6 py-2.5 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
          >
            {saving ? 'Kaydediliyor…' : `Onayla ve güncelle (${selectedCount})`}
          </button>
        </div>
        </div>
      </div>
    </div>
  );
}
