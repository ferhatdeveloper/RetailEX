import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X, Check, Briefcase } from 'lucide-react';
import {
  PercentBodyModal,
  PercentBodyModalScrollBody,
} from '../../shared/PercentBodyModal';
import type { Service } from '../../../services/serviceAPI';
import { moduleTranslations } from '../../../locales/module-translations';
import { useLanguage } from '../../../contexts/LanguageContext';

interface ServiceCatalogModalProps {
  services: Service[];
  initialSearchQuery?: string;
  onClose: () => void;
  /** Tekli seçim (Ctrl basmadan tıklama). */
  onSelect: (service: Service) => void;
  /** Çoklu seçim: "Seçilenleri Ekle" butonuna basıldığında. */
  onAddMultiple?: (services: Service[]) => void;
}

function formatNumber(num: number | undefined, decimals = 2): string {
  if (num === undefined || num === null) return '0';
  return num.toLocaleString('tr-TR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function ServiceCatalogModal({
  services,
  initialSearchQuery = '',
  onClose,
  onSelect,
  onAddMultiple,
}: ServiceCatalogModalProps) {
  const { language } = useLanguage();
  const tm = (key: string) => moduleTranslations[key]?.[language] || key;

  const [searchQuery, setSearchQuery] = useState(initialSearchQuery);
  const [multiSelectedIds, setMultiSelectedIds] = useState<Set<string>>(new Set());
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => {
      searchInputRef.current?.focus();
    }, 60);
    return () => window.clearTimeout(t);
  }, []);

  const titleLabel = tm('serviceSelection') === 'serviceSelection'
    ? 'Hizmet Seçimi'
    : tm('serviceSelection');
  const placeholderLabel = tm('serviceSearchPlaceholder') === 'serviceSearchPlaceholder'
    ? 'Hizmet kodu, adı veya kategori ara...'
    : tm('serviceSearchPlaceholder');
  const hintLabel = tm('serviceCatalogMultiSelectHint') === 'serviceCatalogMultiSelectHint'
    ? 'Çoklu seçim · Ctrl+Click ile işaretleyin'
    : tm('serviceCatalogMultiSelectHint');
  const selectAllLabel = tm('catalogSelectAll') === 'catalogSelectAll'
    ? 'Tümünü Seç'
    : tm('catalogSelectAll');
  const clearSelectionLabel = tm('catalogClearSelection') === 'catalogClearSelection'
    ? 'Seçimi Kaldır'
    : tm('catalogClearSelection');
  const addSelectedTemplate = tm('catalogAddSelected') === 'catalogAddSelected'
    ? 'Seçilenleri Ekle ({count})'
    : tm('catalogAddSelected');
  const selectedTemplate = tm('catalogServicesSelected') === 'catalogServicesSelected'
    ? '{count} hizmet seçildi'
    : tm('catalogServicesSelected');
  const notFoundLabel = tm('noServicesFound') === 'noServicesFound'
    ? 'Hizmet bulunamadı'
    : tm('noServicesFound');
  const codeLabel = tm('itemCode') === 'itemCode' ? 'Kod' : tm('itemCode');

  const filteredServices = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return services;
    return services.filter((s) => {
      const code = (s.code || '').toLowerCase();
      const name = (s.name || '').toLowerCase();
      const category = (s.category || '').toLowerCase();
      const brand = (s.brand || '').toLowerCase();
      return code.includes(q) || name.includes(q) || category.includes(q) || brand.includes(q);
    });
  }, [services, searchQuery]);

  const toggleMultiSelect = (id: string) => {
    setMultiSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleServiceClick = (e: React.MouseEvent, service: Service) => {
    if (e.ctrlKey || e.metaKey) {
      toggleMultiSelect(service.id);
      return;
    }
    onSelect(service);
  };

  const allFilteredSelected = filteredServices.length > 0
    && filteredServices.every((s) => multiSelectedIds.has(s.id));

  const handleSelectAllToggle = () => {
    if (allFilteredSelected) {
      setMultiSelectedIds(new Set());
    } else {
      setMultiSelectedIds(new Set(filteredServices.map((s) => s.id)));
    }
  };

  const handleClearSelection = () => setMultiSelectedIds(new Set());

  const handleAddSelected = () => {
    if (!onAddMultiple) return;
    const selected = services.filter((s) => multiSelectedIds.has(s.id));
    if (selected.length === 0) return;
    onAddMultiple(selected);
    setMultiSelectedIds(new Set());
  };

  const selectedCount = multiSelectedIds.size;
  const canMulti = Boolean(onAddMultiple);

  return (
    <PercentBodyModal size="wide" onClose={onClose} ariaLabel={titleLabel}>
      <div className="flex flex-col min-h-0 h-full">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 shrink-0">
          <div className="flex items-center gap-2">
            <Briefcase className="w-5 h-5 text-indigo-600" />
            <h2 className="text-base font-semibold text-gray-900">{titleLabel}</h2>
            <span className="text-xs text-gray-500 ml-1">
              ({services.length})
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded hover:bg-gray-100 text-gray-500"
            aria-label="close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-4 py-2 border-b border-gray-200 shrink-0">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={placeholderLabel}
              className="w-full pl-8 pr-3 py-2 text-sm rounded-lg border border-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>
          {canMulti && (
            <div className="flex items-center justify-between mt-2 text-[11px] text-gray-500">
              <span>{hintLabel}</span>
              {selectedCount > 0 && (
                <span className="font-medium text-indigo-700">
                  {selectedTemplate.replace('{count}', String(selectedCount))}
                </span>
              )}
            </div>
          )}
        </div>

        {canMulti && (
          <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-100 shrink-0 bg-gray-50/60">
            <button
              type="button"
              onClick={handleSelectAllToggle}
              className="px-2.5 py-1 text-[11px] font-medium rounded-md border border-gray-300 bg-white hover:bg-gray-100 text-gray-700"
            >
              {allFilteredSelected ? clearSelectionLabel : selectAllLabel}
            </button>
            {selectedCount > 0 && (
              <>
                <button
                  type="button"
                  onClick={handleClearSelection}
                  className="px-2.5 py-1 text-[11px] font-medium rounded-md border border-gray-300 bg-white hover:bg-gray-100 text-gray-700"
                >
                  {clearSelectionLabel}
                </button>
                <div className="flex-1" />
                <button
                  type="button"
                  onClick={handleAddSelected}
                  className="px-3 py-1 text-[11px] font-semibold rounded-md bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm"
                >
                  {addSelectedTemplate.replace('{count}', String(selectedCount))}
                </button>
              </>
            )}
          </div>
        )}

        <PercentBodyModalScrollBody className="bg-gray-50/40">
          {filteredServices.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-gray-500">
              {notFoundLabel}
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {filteredServices.map((service) => {
                const isSelected = multiSelectedIds.has(service.id);
                return (
                  <li
                    key={service.id}
                    onClick={(e) => handleServiceClick(e, service)}
                    className={`px-4 py-2.5 cursor-pointer transition-colors flex items-center gap-3 ${
                      isSelected ? 'bg-indigo-50 hover:bg-indigo-100' : 'hover:bg-white'
                    }`}
                  >
                    <div
                      className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 ${
                        isSelected ? 'bg-indigo-600 border-indigo-600' : 'border-gray-300 bg-white'
                      }`}
                      aria-hidden
                    >
                      {isSelected && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2 min-w-0">
                        <span className="font-mono text-xs font-semibold text-indigo-700 shrink-0">
                          {codeLabel}: {service.code || '—'}
                        </span>
                        <span className="font-medium text-sm text-gray-900 truncate">
                          {service.name}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 text-[11px] text-gray-500">
                        {service.category && (
                          <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
                            {service.category}
                          </span>
                        )}
                        {service.unit && <span>{service.unit}</span>}
                        {typeof service.tax_rate === 'number' && service.tax_rate > 0 && (
                          <span>KDV %{service.tax_rate}</span>
                        )}
                        {service.withholding_rate ? (
                          <span>Stopaj %{service.withholding_rate}</span>
                        ) : null}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-bold text-sm tabular-nums text-indigo-700">
                        {formatNumber(service.unit_price)} IQD
                      </div>
                      {service.unit_price_usd ? (
                        <div className="text-[10px] text-gray-500 tabular-nums">
                          ${formatNumber(service.unit_price_usd, 2)}
                        </div>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </PercentBodyModalScrollBody>
      </div>
    </PercentBodyModal>
  );
}
