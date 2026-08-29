/**
 * Paylaşılan Excel (xlsx) stil yardımcıları — RetailEX genelinde tutarlı, profesyonel görünüm.
 *
 * xlsx kütüphanesi `s` stil objesinde SheetJS stil şemasını kullanır.
 * Bilinen sınırlamalar: SheetJS "rich" stilleri (gradient, conditional vb.) yoktur;
 * burada sadece renk, kalın, kenarlık, hizalama ve sayı formatları kullanılır.
 */
import * as XLSX from 'xlsx';

/** SheetJS hücre stili (XLSX.Cell['s']) — gevşek tip tanımı */
type ExcelCellStyle = {
  font?: Record<string, unknown>;
  fill?: Record<string, unknown>;
  alignment?: Record<string, unknown>;
  border?: Record<string, unknown>;
  numFmt?: string;
  [key: string]: unknown;
};

// Renk paleti (hex, RGB, başında # olmadan)
export const EXCEL_COLORS = {
  primary: '1E40AF', // blue-700 — başlıklar
  secondary: '3B82F6', // blue-500 — alt başlıklar
  accent: '7C3AED', // violet-600 — grup başlıkları
  total: '059669', // emerald-600 — toplam satırları
  zebra: 'F1F5F9', // slate-100 — zebra satırlar
  borderLight: 'E5E7EB', // gray-200 — ince kenarlık
  borderDark: '1F2937', // gray-800 — başlık altı
  text: '1F2937', // gray-800 — ana metin
  textMuted: '64748B', // slate-500 — ikincil metin
  white: 'FFFFFF',
};

const thinBorder = { style: 'thin', color: { rgb: EXCEL_COLORS.borderLight } };
const mediumBorder = { style: 'medium', color: { rgb: EXCEL_COLORS.borderDark } };

/** Ana başlık stili (sheet başlığı — merged title) */
export const TITLE_STYLE = {
  font: { bold: true, sz: 16, color: { rgb: EXCEL_COLORS.white } },
  fill: { fgColor: { rgb: EXCEL_COLORS.primary } },
  alignment: { horizontal: 'center', vertical: 'center' },
};

/** Alt başlık (sheet açıklaması, meta bilgi) */
export const SUBTITLE_STYLE = {
  font: { bold: false, sz: 10, color: { rgb: EXCEL_COLORS.white }, italic: true },
  fill: { fgColor: { rgb: EXCEL_COLORS.secondary } },
  alignment: { horizontal: 'center', vertical: 'center' },
};

/** Meta bilgi satırı (tarih, kayıt sayısı, kullanıcı vb.) */
export const META_STYLE = {
  font: { sz: 10, color: { rgb: EXCEL_COLORS.text } },
  fill: { fgColor: { rgb: EXCEL_COLORS.zebra } },
  alignment: { horizontal: 'left', vertical: 'center' },
  border: {
    top: thinBorder,
    bottom: thinBorder,
    left: thinBorder,
    right: thinBorder,
  },
};

/** Veri başlığı (kolon isimleri) */
export const HEADER_STYLE = {
  font: { bold: true, sz: 11, color: { rgb: EXCEL_COLORS.white } },
  fill: { fgColor: { rgb: EXCEL_COLORS.primary } },
  alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
  border: {
    top: mediumBorder,
    bottom: mediumBorder,
    left: thinBorder,
    right: thinBorder,
  },
};

/** Alt başlık (kolon gruplama — müşteri/ürün modunda alt başlık) */
export const SUBHEADER_STYLE = {
  font: { bold: true, sz: 10, color: { rgb: EXCEL_COLORS.white } },
  fill: { fgColor: { rgb: EXCEL_COLORS.secondary } },
  alignment: { horizontal: 'left', vertical: 'center' },
  border: {
    top: thinBorder,
    bottom: thinBorder,
    left: thinBorder,
    right: thinBorder,
  },
};

/** Grup başlığı (müşteri/ürün modunda ana grup) */
export const GROUP_HEADER_STYLE = {
  font: { bold: true, sz: 11, color: { rgb: EXCEL_COLORS.white } },
  fill: { fgColor: { rgb: EXCEL_COLORS.accent } },
  alignment: { horizontal: 'left', vertical: 'center' },
  border: {
    top: mediumBorder,
    bottom: mediumBorder,
    left: thinBorder,
    right: thinBorder,
  },
};

/** Toplam satırı stili */
export const TOTAL_ROW_STYLE = {
  font: { bold: true, sz: 10, color: { rgb: EXCEL_COLORS.white } },
  fill: { fgColor: { rgb: EXCEL_COLORS.total } },
  alignment: { horizontal: 'right', vertical: 'center' },
  border: {
    top: mediumBorder,
    bottom: mediumBorder,
    left: thinBorder,
    right: thinBorder,
  },
};

/** Standart veri hücresi stili */
export const CELL_STYLE = {
  font: { sz: 10, color: { rgb: EXCEL_COLORS.text } },
  alignment: { vertical: 'center' },
  border: {
    top: thinBorder,
    bottom: thinBorder,
    left: thinBorder,
    right: thinBorder,
  },
};

/** Zebra (alternatif) satır stili */
export const ZEBRA_FILL = { fgColor: { rgb: EXCEL_COLORS.zebra } };

/** Para birimi hücresi stili */
export const CURRENCY_STYLE = {
  ...CELL_STYLE,
  numFmt: '#,##0.00',
  alignment: { vertical: 'center', horizontal: 'right' },
};

/** Tam sayı hücresi stili */
export const INTEGER_STYLE = {
  ...CELL_STYLE,
  numFmt: '#,##0',
  alignment: { vertical: 'center', horizontal: 'right' },
};

/** Tarih hücresi stili */
export const DATE_STYLE = {
  ...CELL_STYLE,
  numFmt: 'dd.mm.yyyy',
  alignment: { vertical: 'center', horizontal: 'center' },
};

/** Metin hücresi stili (sola yaslı) */
export const TEXT_STYLE = {
  ...CELL_STYLE,
  alignment: { vertical: 'center', horizontal: 'left' },
};

/** Merkez hizalı metin */
export const CENTER_TEXT_STYLE = {
  ...CELL_STYLE,
  alignment: { vertical: 'center', horizontal: 'center' },
};

// ----------- Hücre tipi tespiti -----------

/**
 * Hücre değerinin tipine göre uygun sayı formatını döndürür.
 * Para birimi sütunlarında currency bazlı ondalık basamağı uygulanır.
 */
export function detectCellStyle(
  value: unknown,
  columnKey?: string,
  currencyCode?: string,
): ExcelCellStyle {
  // Sayılar
  if (typeof value === 'number' && Number.isFinite(value)) {
    // Para birimi sütunu adı (kolon adında "Tutar", "Fiyat", "Toplam", "Harcama" vb. geçiyorsa)
    const isCurrency =
      typeof columnKey === 'string' &&
      /(tutar|fiyat|toplam|harcama|amount|price|total|borç|alacak|bakiye|debt|credit|balance)/i.test(
        columnKey,
      );
    // Para birimi bazlı ondalık (IQD → 0, USD → 2, KWD → 3)
    if (isCurrency && currencyCode) {
      const code = String(currencyCode).trim().toUpperCase();
      const decimals =
        code === 'IQD' || code === 'JPY' || code === 'KRW' || code === 'VND' || code === 'IDR'
          ? 0
          : code === 'KWD' || code === 'BHD' || code === 'OMR'
            ? 3
            : 2;
      const fmt =
        decimals === 0 ? '#,##0' : decimals === 3 ? '#,##0.000' : '#,##0.00';
      return {
        ...CELL_STYLE,
        numFmt: fmt,
        alignment: { vertical: 'center', horizontal: 'right' },
      };
    }
    return INTEGER_STYLE;
  }
  // Tarih string'i (görünüşe göre dd.mm.yyyy veya yyyy-mm-dd formatında)
  if (typeof value === 'string' && /^\d{1,2}[./-]\d{1,2}[./-]\d{2,4}$/.test(value.trim())) {
    return DATE_STYLE;
  }
  // ISO tarih
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value.trim())) {
    return DATE_STYLE;
  }
  // Boş hücre
  if (value == null || value === '') {
    return CELL_STYLE;
  }
  return TEXT_STYLE;
}

// ----------- Worksheet oluşturma yardımcıları -----------

export interface ColumnSpec {
  /** Kolon başlığı */
  header: string;
  /** Hücre değerinin para birimi kodu (opsiyonel — sayı/para stili için) */
  currency?: string;
}

/**
 * AOA verisini stilize edilmiş bir worksheet'e dönüştürür.
 * Yapı: başlık (1 satır merged) → alt başlık (1 satır merged) → meta (1 satır) → veri başlıkları → veri satırları → opsiyonel toplam satırı.
 *
 * @param aoa Tüm satırlar (başlık dahil) AOA formatında
 * @param options Stil seçenekleri
 */
export interface StyledWorksheetOptions {
  /** Sheet başlığı (merged title) */
  title?: string;
  /** Alt başlık (ör. "Tarih aralığı: 01.01.2025 - 31.12.2025") */
  subtitle?: string;
  /** Meta satırları (key-value veya tek metin) — başlık satırından sonra, veri başlıklarından önce */
  metaRows?: string[];
  /** Veri başlıklarının satır numarası (1-indexed, başlık + alt başlık + meta'dan sonra) */
  headerRowIndex: number;
  /** Veri başlıkları kolon sayısı */
  columnCount: number;
  /** Para birimi kolonları — kolon başlığına göre eşleşir (büyük küçük harf duyarsız) */
  currencyColumns?: string[];
  /** Toplam satırı (en altta) — başlık + ilk sütun "TOPLAM", kalanlar değer */
  totalRow?: unknown[];
  /** Grup başlığı satırları (müşteri/ürün modu için) — AOA'da hangi satır indeksleri (0-indexed) grup olduğunu belirtir */
  groupRowIndices?: number[];
  /** Grup alt başlık satır indeksleri */
  subHeaderRowIndices?: number[];
  /** Veri başlangıç satır indeksi (0-indexed) */
  dataStartIndex: number;
}

export function buildStyledWorksheet(
  aoa: unknown[][],
  options: StyledWorksheetOptions,
): XLSX.WorkSheet {
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
  const lastRow = range.e.r;
  const lastCol = range.e.c;
  const columnCount = options.columnCount;

  // Merge'leri en son toplu olarak ekleyeceğiz
  const merges: XLSX.Range[] = [];
  const addMerge = (row1: number, row2: number) => {
    if (columnCount <= 1) return;
    merges.push({
      s: { r: row1, c: 0 },
      e: { r: row2, c: columnCount - 1 },
    });
  };

  // 1) Sheet başlığı (ilk satır)
  if (options.title && lastRow >= 0) {
    const titleCellRef = XLSX.utils.encode_cell({ r: 0, c: 0 });
    if (ws[titleCellRef]) ws[titleCellRef].s = TITLE_STYLE;
    addMerge(0, 0);
  }

  // 2) Alt başlık
  if (options.subtitle) {
    const subtitleCellRef = XLSX.utils.encode_cell({ r: 1, c: 0 });
    if (ws[subtitleCellRef]) ws[subtitleCellRef].s = SUBTITLE_STYLE;
    addMerge(1, 1);
  }

  // 3) Meta satırları (subtitle'tan sonra)
  if (options.metaRows && options.metaRows.length > 0) {
    const metaStartRow = options.subtitle ? 2 : 1; // 0-indexed (3. satır = 2)
    options.metaRows.forEach((meta, idx) => {
      const r = metaStartRow + idx;
      for (let c = 0; c < columnCount; c++) {
        const ref = XLSX.utils.encode_cell({ r, c });
        if (ws[ref]) ws[ref].s = META_STYLE;
      }
      addMerge(r, r);
    });
  }

  // 4) Veri başlığı (header row — 1-indexed)
  const headerRowIdx = options.headerRowIndex - 1; // 0-indexed
  for (let c = 0; c < columnCount; c++) {
    const ref = XLSX.utils.encode_cell({ r: headerRowIdx, c });
    if (ws[ref]) ws[ref].s = HEADER_STYLE;
  }

  // 5) Veri satırları
  const dataStart = options.dataStartIndex;
  for (let r = dataStart; r <= lastRow; r++) {
    const isGroup = options.groupRowIndices?.includes(r);
    const isSubHeader = options.subHeaderRowIndices?.includes(r);

    for (let c = 0; c < columnCount; c++) {
      const ref = XLSX.utils.encode_cell({ r, c });
      if (!ws[ref]) continue;

      if (isGroup) {
        ws[ref].s = GROUP_HEADER_STYLE;
        addMerge(r, r);
      } else if (isSubHeader) {
        ws[ref].s = SUBHEADER_STYLE;
        addMerge(r, r);
      } else {
        // Zebra mı?
        const isZebra = (r - dataStart) % 2 === 1;
        const cellValue = aoa[r]?.[c];
        const headerName = String(aoa[headerRowIdx]?.[c] || '');
        const currencyCode = options.currencyColumns?.find((cc) =>
          headerName.toLowerCase().includes(cc.toLowerCase()),
        );

        const baseStyle = detectCellStyle(cellValue, headerName, currencyCode);
        if (isZebra) {
          ws[ref].s = {
            ...baseStyle,
            fill: ZEBRA_FILL,
          };
        } else {
          ws[ref].s = baseStyle;
        }
      }
    }
  }

  // 6) Toplam satırı
  if (options.totalRow) {
    const totalRowIdx = lastRow;
    for (let c = 0; c < columnCount; c++) {
      const ref = XLSX.utils.encode_cell({ r: totalRowIdx, c });
      if (!ws[ref]) continue;
      const baseStyle = TOTAL_ROW_STYLE;
      const cellValue = options.totalRow[c];
      if (typeof cellValue === 'number' && Number.isFinite(cellValue)) {
        const headerName = String(aoa[headerRowIdx]?.[c] || '');
        const currencyCode = options.currencyColumns?.find((cc) =>
          headerName.toLowerCase().includes(cc.toLowerCase()),
        );
        if (currencyCode) {
          const code = String(currencyCode).trim().toUpperCase();
          const decimals =
            code === 'IQD' || code === 'JPY' || code === 'KRW'
              ? 0
              : code === 'KWD' || code === 'BHD' || code === 'OMR'
                ? 3
                : 2;
          const fmt =
            decimals === 0 ? '#,##0' : decimals === 3 ? '#,##0.000' : '#,##0.00';
          ws[ref].s = {
            ...TOTAL_ROW_STYLE,
            numFmt: fmt,
            alignment: { horizontal: 'right', vertical: 'center' },
          };
          continue;
        }
      }
      ws[ref].s = baseStyle;
    }
  }

  // 7) Sütun genişlikleri (içeriğe göre)
  const colWidths: { wch: number }[] = [];
  for (let c = 0; c < columnCount; c++) {
    let maxLen = 8;
    for (let r = 0; r <= lastRow; r++) {
      const v = aoa[r]?.[c];
      let len = 0;
      if (v == null) {
        len = 0;
      } else if (typeof v === 'number') {
        len = String(v).length + 2;
      } else if (v instanceof Date) {
        len = 12;
      } else {
        len = String(v).length;
      }
      // Türkçe karakterler veya okunabilirlik için küçük bir tampon
      const displayLen = Math.ceil(len * 1.05);
      if (displayLen > maxLen) maxLen = displayLen;
    }
    // Başlık biraz daha geniş olsun
    const headerName = String(aoa[headerRowIdx]?.[c] || '');
    if (headerName.length > maxLen) maxLen = headerName.length;
    colWidths.push({ wch: Math.min(Math.max(maxLen + 3, 10), 50) });
  }
  ws['!cols'] = colWidths;

  // 8) Satır yükseklikleri
  const rowHeights: { hpt: number }[] = [];
  for (let r = 0; r <= lastRow; r++) {
    if (r === 0) {
      rowHeights.push({ hpt: 30 }); // Başlık
    } else if (r === 1 && options.subtitle) {
      rowHeights.push({ hpt: 20 }); // Alt başlık
    } else if (r === headerRowIdx) {
      rowHeights.push({ hpt: 28 }); // Veri başlığı
    } else {
      rowHeights.push({ hpt: 18 }); // Normal satır
    }
  }
  ws['!rows'] = rowHeights;

  // 8.5) Merge'ler
  if (merges.length > 0) {
    ws['!merges'] = merges;
  }

  // 9) Filtre (sadece veri başlığı + veri aralığı)
  if (columnCount > 0 && lastRow >= headerRowIdx) {
    const startCol = XLSX.utils.encode_col(0);
    const endCol = XLSX.utils.encode_col(columnCount - 1);
    ws['!autofilter'] = {
      ref: `${startCol}${headerRowIdx + 1}:${endCol}${lastRow + 1}`,
    };
  }

  // 10) Donmuş başlık (veri başlığı satırı)
  ws['!freeze'] = { xSplit: 0, ySplit: headerRowIdx };

  // 11) Sayfa düzeni — landscape, yazdırma başlığı, kenar boşlukları
  ws['!pageSetup'] = {
    orientation: 'landscape',
    paperSize: 9, // A4
    fitToWidth: 1,
    fitToHeight: 0,
    margins: {
      left: 0.5,
      right: 0.5,
      top: 0.7,
      bottom: 0.7,
      header: 0.3,
      footer: 0.3,
    },
    printArea: undefined as unknown as string,
  };

  // Yazdırma başlığı (veri başlığı her sayfada tekrarlansın)
  ws['!printTitlesRow'] = `${headerRowIdx + 1}:${headerRowIdx + 1}`;

  return ws;
}