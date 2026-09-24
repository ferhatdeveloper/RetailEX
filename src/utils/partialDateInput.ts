/**
 * Parçalı tarih (gün / ay / yıl) — ISO `YYYY-MM-DD` ile çift yönlü dönüşüm.
 * Yıl 2 hane ise: 00–30 → 2000+, 31–99 → 1900+.
 */

export type PartialDateParts = {
  day: string;
  month: string;
  year: string;
};

export function emptyPartialDateParts(): PartialDateParts {
  return { day: '', month: '', year: '' };
}

/** 2 haneli yılı 4 haneye çevir */
export function expandTwoDigitYear(yy: number, pivot = 30): number {
  if (!Number.isFinite(yy) || yy < 0) return NaN;
  if (yy > 99) return yy;
  return yy <= pivot ? 2000 + yy : 1900 + yy;
}

export function parseIsoToPartialDate(iso: string | null | undefined): PartialDateParts {
  const raw = String(iso ?? '').trim();
  if (!raw) return emptyPartialDateParts();
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    return { year: m[1], month: m[2], day: m[3] };
  }
  const dmy = raw.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
  if (dmy) {
    const day = dmy[1].padStart(2, '0');
    const month = dmy[2].padStart(2, '0');
    let y = Number(dmy[3]);
    if (dmy[3].length <= 2) y = expandTwoDigitYear(y);
    return { day, month, year: Number.isFinite(y) ? String(y) : '' };
  }
  const dt = new Date(raw);
  if (!Number.isNaN(dt.getTime())) {
    return {
      year: String(dt.getFullYear()),
      month: String(dt.getMonth() + 1).padStart(2, '0'),
      day: String(dt.getDate()).padStart(2, '0'),
    };
  }
  return emptyPartialDateParts();
}

export function partialDatePartsToIso(parts: PartialDateParts): string | null {
  const dRaw = String(parts.day ?? '').replace(/\D/g, '');
  const mRaw = String(parts.month ?? '').replace(/\D/g, '');
  const yRaw = String(parts.year ?? '').replace(/\D/g, '');
  if (!dRaw && !mRaw && !yRaw) return null;
  if (!dRaw || !mRaw || !yRaw) return null;

  const day = Number(dRaw);
  const month = Number(mRaw);
  let year = Number(yRaw);
  if (yRaw.length <= 2) year = expandTwoDigitYear(year);
  if (!Number.isFinite(day) || !Number.isFinite(month) || !Number.isFinite(year)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1900 || year > 2100) return null;

  const dt = new Date(year, month - 1, day);
  if (
    dt.getFullYear() !== year ||
    dt.getMonth() !== month - 1 ||
    dt.getDate() !== day
  ) {
    return null;
  }
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Yazdırma / şablon: gün, ay, yıl, yılın son 2 hanesi */
export function birthDatePrintParts(iso: string | null | undefined): {
  customerBirthDay: string;
  customerBirthMonth: string;
  customerBirthYear: string;
  customerBirthYear2: string;
} {
  const p = parseIsoToPartialDate(iso);
  const y4 = p.year;
  return {
    customerBirthDay: p.day,
    customerBirthMonth: p.month,
    customerBirthYear: y4,
    customerBirthYear2: y4.length >= 2 ? y4.slice(-2) : y4,
  };
}
