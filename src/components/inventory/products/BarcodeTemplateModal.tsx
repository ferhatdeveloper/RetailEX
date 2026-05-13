/**
 * BarcodeTemplateModal — Otomatik barkod numarası şablonunu yönetir.
 *
 * Şablon yapısı (public.barcode_templates):
 *  - prefix:         Sabit ön ek (örn. "869", "BRZ")
 *  - current_value:  Üretilen son barkod numarası (BIGINT, sayısal kısım)
 *  - length:         Toplam barkod uzunluğu — prefix dahil
 *  - is_active:      Aktif şablon (aynı anda yalnızca bir tane)
 *
 * UI: kullanıcı "sıradaki üretilecek numara"yı girer; servis tarafı bunu
 * `current_value = start - 1` olarak saklar.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { X, Hash, RefreshCcw, Save } from 'lucide-react';
import { toast } from 'sonner';
import { productAPI } from '../../../services/api/products';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useTheme } from '../../../contexts/ThemeContext';

interface BarcodeTemplateModalProps {
  onClose: () => void;
  /** Şablon kaydedildikten sonra çağrılır — çağıran taraf peek'i yenileyebilir. */
  onSaved?: () => void;
}

export function BarcodeTemplateModal({ onClose, onSaved }: BarcodeTemplateModalProps) {
  const { tm } = useLanguage();
  const { darkMode } = useTheme();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [id, setId] = useState<string | undefined>(undefined);
  const [name, setName] = useState('Varsayilan Sablon');
  const [prefix, setPrefix] = useState('');
  const [start, setStart] = useState<string>('1000001');
  const [length, setLength] = useState<number>(13);
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const t = await productAPI.getActiveBarcodeTemplate();
        if (t) {
          setId(t.id);
          setName(t.name || 'Varsayilan Sablon');
          setPrefix(t.prefix || '');
          // current_value en son ÜRETİLEN değer; sıradaki üretilecek = current_value + 1
          try {
            const next = (BigInt(String(t.current_value || '0')) + 1n).toString();
            setStart(next);
          } catch {
            setStart(String(t.current_value || '1'));
          }
          setLength(Number(t.length) || 13);
          setIsActive(t.is_active !== false);
        }
      } catch (err) {
        console.warn('[BarcodeTemplateModal] load failed', err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  /** Kullanıcının seçimine göre üretilecek "ilk barkodun" önizlemesi. */
  const preview = useMemo(() => {
    try {
      const startBig = BigInt(String(start || '0'));
      const digitsLen = Math.max(0, length - (prefix?.length || 0));
      const digits = startBig.toString().padStart(digitsLen, '0');
      return `${prefix}${digits}`;
    } catch {
      return '';
    }
  }, [prefix, start, length]);

  /** Toplam uzunluk önerisi: prefix + start basamak sayısı. */
  const recommendedLength = useMemo(() => {
    try {
      const startBig = BigInt(String(start || '0'));
      return (prefix?.length || 0) + Math.max(1, startBig.toString().length);
    } catch {
      return (prefix?.length || 0) + 1;
    }
  }, [prefix, start]);

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error('Şablon adı zorunludur');
      return;
    }
    if (length <= (prefix?.length || 0)) {
      toast.error('Toplam uzunluk, ön ek uzunluğundan büyük olmalı');
      return;
    }
    try {
      setSaving(true);
      const ok = await productAPI.upsertBarcodeTemplate({
        id,
        name: name.trim(),
        prefix: prefix.trim(),
        start: BigInt(String(start || '0')),
        length: Number(length),
        is_active: isActive,
      });
      if (!ok) throw new Error('save failed');
      toast.success('Barkod şablonu kaydedildi');
      onSaved?.();
      onClose();
    } catch (err) {
      console.error('[BarcodeTemplateModal] save error', err);
      toast.error('Şablon kaydedilemedi');
    } finally {
      setSaving(false);
    }
  };

  const inputBase = `w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
    darkMode ? 'bg-gray-800 border-gray-600 text-white placeholder-gray-400' : 'bg-white border-gray-300'
  }`;

  return (
    <div className="fixed inset-0 z-[200] bg-black/40 flex items-center justify-center p-4">
      <div
        className={`w-full max-w-lg rounded-xl shadow-2xl overflow-hidden ${
          darkMode ? 'bg-gray-900 text-gray-100' : 'bg-white text-gray-900'
        }`}
      >
        <div className={`flex items-center justify-between px-5 py-4 border-b ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${darkMode ? 'bg-blue-900/40 text-blue-300' : 'bg-blue-100 text-blue-700'}`}>
              <Hash className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold">{tm('barcodeFormatSettings') || 'Barkod Format Ayarları'}</h2>
              <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                {tm('barcodeFormatSettingsDesc') || 'Otomatik üretilecek barkod numarası şablonunu ayarlayın.'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className={`p-1.5 rounded-lg ${darkMode ? 'hover:bg-gray-800' : 'hover:bg-gray-100'}`}>
            <X className="w-5 h-5" />
          </button>
        </div>

        {loading ? (
          <div className="p-10 text-center text-sm text-gray-500">{tm('loading') || 'Yükleniyor...'}</div>
        ) : (
          <div className="p-5 space-y-4">
            <div>
              <label className="block text-xs font-medium mb-1">{tm('templateName') || 'Şablon Adı'}</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={inputBase}
                placeholder="Varsayilan Sablon"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium mb-1">{tm('barcodePrefix') || 'Ön Ek (Prefix)'}</label>
                <input
                  type="text"
                  value={prefix}
                  onChange={(e) => setPrefix(e.target.value)}
                  className={inputBase}
                  placeholder="869 / BRZ / TR"
                  maxLength={20}
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">{tm('barcodeTotalLength') || 'Toplam Uzunluk'}</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={64}
                    value={length}
                    onChange={(e) => setLength(Number(e.target.value || 0))}
                    className={inputBase}
                  />
                  {recommendedLength !== length && (
                    <button
                      type="button"
                      onClick={() => setLength(recommendedLength)}
                      title={tm('useRecommended') || 'Öneriyi kullan'}
                      className={`shrink-0 p-2 rounded-lg border text-xs ${
                        darkMode
                          ? 'border-gray-700 hover:bg-gray-800 text-gray-300'
                          : 'border-gray-300 hover:bg-gray-50 text-gray-600'
                      }`}
                    >
                      <RefreshCcw className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <p className={`mt-1 text-[10px] ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                  {tm('barcodeLengthHint') || 'Prefix dahil toplam karakter sayısı (örn. EAN13 = 13).'}
                </p>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium mb-1">{tm('barcodeStartNumber') || 'Sıradaki Başlangıç Numarası'}</label>
              <input
                type="text"
                inputMode="numeric"
                value={start}
                onChange={(e) => setStart(e.target.value.replace(/[^\d]/g, ''))}
                className={`${inputBase} font-mono`}
                placeholder="1000001"
              />
              <p className={`mt-1 text-[10px] ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                {tm('barcodeStartHint') || 'Bir sonraki ürün için üretilecek numara. Mevcut numaralarla çakışmaması önerilir.'}
              </p>
            </div>

            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="w-4 h-4 accent-blue-600"
              />
              <span>{tm('templateActive') || 'Bu şablonu aktif yap (diğerleri pasifleşir)'}</span>
            </label>

            <div className={`rounded-lg p-3 border ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-blue-50 border-blue-100'}`}>
              <div className={`text-[10px] uppercase tracking-wide mb-1 ${darkMode ? 'text-gray-400' : 'text-blue-700'}`}>
                {tm('preview') || 'Önizleme'}
              </div>
              <div className={`font-mono text-base ${darkMode ? 'text-blue-300' : 'text-blue-800'}`}>
                {preview || '—'}
              </div>
            </div>
          </div>
        )}

        <div className={`flex items-center justify-end gap-2 px-5 py-3 border-t ${darkMode ? 'border-gray-700 bg-gray-900' : 'border-gray-200 bg-gray-50'}`}>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className={`px-4 py-2 rounded-lg text-sm border ${
              darkMode ? 'border-gray-700 hover:bg-gray-800' : 'border-gray-300 hover:bg-white'
            }`}
          >
            {tm('cancel') || 'İptal'}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || loading}
            className="px-4 py-2 rounded-lg text-sm bg-blue-600 hover:bg-blue-700 text-white inline-flex items-center gap-2 disabled:opacity-60"
          >
            <Save className="w-4 h-4" />
            {saving ? (tm('saving') || 'Kaydediliyor...') : (tm('save') || 'Kaydet')}
          </button>
        </div>
      </div>
    </div>
  );
}
