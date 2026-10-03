/**
 * Rapor filtreleri bağlamı — tüm raporlar arasında paylaşılan tarih aralığı,
 * müşteri filtresi ve görünürlük seçenekleri. Tüm rapor bileşenleri aynı
 * bağlamı okuyup yazarak "raporlar arasında bağlantı kopukluğu" sorununu
 * çözer: bir raporda tarih/müşteri değişince diğer raporlar otomatik
 * güncellenir.
 */
import React, { createContext, useContext, useMemo, useState, useCallback } from 'react';
import { localTodayDateKey, localCalendarDateKey } from '../utils/localCalendarDate';

export interface ReportFiltersValue {
  /** Tarih aralığı (YYYY-MM-DD, yerel) */
  dateStart: string;
  dateEnd: string;
  setDateRange: (start: string, end: string) => void;
  /** Müşteri filtresi (boş = tümü) */
  customerFilter: string;
  setCustomerFilter: (term: string) => void;
}

const ReportFiltersContext = createContext<ReportFiltersValue | null>(null);

function defaultStartDate(): string {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return localCalendarDateKey(d);
}

export function ReportFiltersProvider({ children }: { children: React.ReactNode }) {
  const [dateStart, setDateStart] = useState<string>(() => defaultStartDate());
  const [dateEnd, setDateEnd] = useState<string>(() => localTodayDateKey());
  const [customerFilter, setCustomerFilter] = useState<string>('');

  const setDateRange = useCallback((start: string, end: string) => {
    setDateStart(start);
    setDateEnd(end);
  }, []);

  const value = useMemo<ReportFiltersValue>(
    () => ({ dateStart, dateEnd, setDateRange, customerFilter, setCustomerFilter }),
    [dateStart, dateEnd, setDateRange, customerFilter],
  );

  return (
    <ReportFiltersContext.Provider value={value}>
      {children}
    </ReportFiltersContext.Provider>
  );
}

export function useReportFilters(): ReportFiltersValue {
  const ctx = useContext(ReportFiltersContext);
  if (!ctx) {
    // Provider yoksa sessizce boş default döner — geriye dönük uyumlu.
    return {
      dateStart: defaultStartDate(),
      dateEnd: localTodayDateKey(),
      setDateRange: () => undefined,
      customerFilter: '',
      setCustomerFilter: () => undefined,
    };
  }
  return ctx;
}
