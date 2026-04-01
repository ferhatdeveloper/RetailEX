import React, { useState, useMemo } from 'react';
import { X, ImageIcon, Loader2, Search, List, Lightbulb, RefreshCw } from 'lucide-react';

export interface CdnGalleryImage {
  url: string;
  label?: string;
}

interface CdnGalleryModalProps {
  open: boolean;
  onClose: () => void;
  images: CdnGalleryImage[];
  onSelect: (url: string) => void;
  loading?: boolean;
  /** Tüm menü resimlerini listele */
  onLoadAll?: () => void;
  /** Ürün adı/koduna göre öner (menüden resim getir) */
  onSuggest?: () => void;
  /** Yenile = tekrar Tümünü listele çağrısı */
  onRefresh?: () => void;
  loadAllLabel?: string;
  suggestLabel?: string;
  title?: string;
}

export const CdnGalleryModal: React.FC<CdnGalleryModalProps> = ({
  open,
  onClose,
  images,
  onSelect,
  loading = false,
  onLoadAll,
  onSuggest,
  onRefresh,
  loadAllLabel = 'Tümünü listele',
  suggestLabel = 'Öner',
  title = 'CDN Galerisi',
}) => {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredImages = useMemo(() => {
    const list = images.flatMap((img) => (img.url ? [{ url: img.url, label: (img.label || '').toLowerCase() }] : []));
    if (!searchQuery.trim()) return list;
    const q = searchQuery.trim().toLowerCase();
    return list.filter((item) => item.label.includes(q));
  }, [images, searchQuery]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[10001] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-lg font-bold text-gray-900">{title}</h2>
            <p className="text-xs text-gray-500 mt-0.5">Resme tıklayarak seçin</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
            title="Kapat"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Ara + Tümünü listele + Öner + Yenile */}
        <div className="px-6 py-3 border-b border-gray-100 flex flex-wrap items-center gap-2">
          <div className="flex-1 min-w-[160px] relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Resim ara (ad, kod...)"
              className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          {(onRefresh || onLoadAll) && (
            <button
              type="button"
              onClick={onRefresh ?? onLoadAll}
              disabled={loading}
              className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50 flex items-center gap-2"
              title="Listeyi yenile"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Yenile
            </button>
          )}
          {onLoadAll && (
            <button
              type="button"
              onClick={onLoadAll}
              disabled={loading}
              className="px-4 py-2 bg-gray-100 text-gray-800 rounded-lg text-sm font-medium hover:bg-gray-200 disabled:opacity-50 flex items-center gap-2"
            >
              <List className="w-4 h-4" />
              {loadAllLabel}
            </button>
          )}
          {onSuggest && (
            <button
              type="button"
              onClick={onSuggest}
              disabled={loading}
              className="px-4 py-2 bg-amber-100 text-amber-800 rounded-lg text-sm font-medium hover:bg-amber-200 disabled:opacity-50 flex items-center gap-2"
            >
              <Lightbulb className="w-4 h-4" />
              {suggestLabel}
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {loading && (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="w-12 h-12 text-emerald-600 animate-spin mb-4" />
              <p className="text-sm font-medium text-gray-700">Resimler yükleniyor...</p>
            </div>
          )}

          {!loading && filteredImages.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="w-16 h-16 bg-gray-100 text-gray-400 rounded-full flex items-center justify-center mb-4">
                <ImageIcon className="w-8 h-8" />
              </div>
              <p className="text-sm font-medium text-gray-700 mb-1">
                {images.length === 0 ? 'Henüz resim yok' : 'Arama sonucu bulunamadı'}
              </p>
              <p className="text-xs text-gray-500 max-w-sm mb-4">
                {images.length === 0
                  ? 'Tümünü listele ile menü ve Storage resimlerini getirin. Boşsa Kurulum > Firma düzenle içinden Supabase Firma ID alanının doğru olduğundan emin olun.'
                  : 'Farklı bir arama terimi deneyin.'}
              </p>
              <div className="flex flex-wrap gap-2 justify-center">
                {onLoadAll && (
                  <button
                    type="button"
                    onClick={onLoadAll}
                    className="px-4 py-2 bg-gray-100 text-gray-800 rounded-lg text-sm font-medium hover:bg-gray-200 flex items-center gap-2"
                  >
                    <List className="w-4 h-4" />
                    {loadAllLabel}
                  </button>
                )}
                {onSuggest && (
                  <button
                    type="button"
                    onClick={onSuggest}
                    className="px-4 py-2 bg-amber-100 text-amber-800 rounded-lg text-sm font-medium hover:bg-amber-200 flex items-center gap-2"
                  >
                    <Lightbulb className="w-4 h-4" />
                    {suggestLabel}
                  </button>
                )}
              </div>
            </div>
          )}

          {!loading && filteredImages.length > 0 && (
            <>
              <p className="text-sm font-medium text-gray-700 mb-4">
                {filteredImages.length} resim
                {searchQuery.trim() ? ` (aranan: "${searchQuery}")` : ''} — seçmek için tıklayın
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                {filteredImages.map((item, idx) => (
                  <button
                    key={`${item.url}-${idx}`}
                    type="button"
                    onClick={() => {
                      onSelect(item.url);
                      onClose();
                    }}
                    className="rounded-lg overflow-hidden border-2 border-gray-200 hover:border-emerald-500 hover:ring-2 hover:ring-emerald-200 transition-all aspect-square bg-gray-50"
                  >
                    <img
                      src={item.url}
                      alt={item.label || ''}
                      className="w-full h-full object-cover"
                    />
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
