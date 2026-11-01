/**
 * Gider kategorisi görünen adı.
 * Kayıtlı tutar, kasa işareti, kur ve fiş no bu dosyada yoktur.
 */

export type ExpenseCategoryLabelSource = {
  id?: string;
  code?: string;
  name?: string;
  is_system?: boolean;
};

export type ExpenseCategoryLabelOptions = {
  translate?: (key: string) => string;
  categories?: ExpenseCategoryLabelSource[];
};

const KNOWN_EXPENSE_CATEGORY_LABELS: Record<string, string> = {
  misafir_gideri: 'Misafir Gideri',
  hospitality_expenses: 'Ağırlama Giderleri',
  new_category_test: 'Yeni Kategori Test',
  yeni_kategori: 'Yeni Kategori',
  rent: 'Kira',
  salary: 'Maaş',
  electricity: 'Elektrik',
  water: 'Su',
  internet: 'İnternet',
  phone: 'Telefon',
  maintenance: 'Bakım-Onarım',
  cleaning: 'Temizlik',
  marketing: 'Pazarlama',
  supplies: 'Malzeme',
  transport: 'Ulaşım',
  tax: 'Vergi',
  insurance: 'Sigorta',
  other: 'Diğer',
};

/** Firma kurulumunda gelen kodlar ve ekrandaki sistem adları. */
const SYSTEM_EXPENSE_CATEGORY_CODES = new Set<string>([
  'rent',
  'salary',
  'electricity',
  'water',
  'internet',
  'phone',
  'maintenance',
  'cleaning',
  'marketing',
  'supplies',
  'transport',
  'tax',
  'insurance',
  'other',
  'bakim_onarim',
  'diger',
  'elektrik_su_dogalgaz',
  'internet_telefon',
  'kira',
  'koltuk_ekipman_kirasi',
  'laboratuvar_maliyeti',
  'maas',
  'personel_primi',
  'reklam_pazarlama',
  'stok_malzeme_alimi',
  'temizlik_sarf',
  'vergi_resmi',
]);

const SYSTEM_EXPENSE_CATEGORY_NAMES = new Set<string>([
  'bakım/onarım',
  'bakım-onarım',
  'diğer',
  'elektrik/su/doğalgaz',
  'elektrik',
  'internet/telefon',
  'internet',
  'telefon',
  'kira',
  'koltuk/ekipman kirası',
  'laboratuvar maliyeti',
  'maaş',
  'personel primi',
  'reklam/pazarlama',
  'pazarlama',
  'stok/malzeme alımı',
  'malzeme',
  'temizlik/sarf',
  'temizlik',
  'vergi/resmi',
  'vergi',
  'su',
  'sigorta',
  'ulaşım',
]);

/** Makine kodu takma adı → i18n kodu. Kayıttaki kod değişmez. */
const BUILTIN_EXPENSE_CATEGORY_CODE_ALIAS: Record<string, string> = {
  kira: 'rent',
  maas: 'salary',
  bakim_onarim: 'maintenance',
  diger: 'other',
};

const BUILTIN_EXPENSE_CATEGORY_I18N_CODES = new Set<string>([
  'rent',
  'salary',
  'electricity',
  'water',
  'internet',
  'phone',
  'maintenance',
  'cleaning',
  'marketing',
  'supplies',
  'transport',
  'tax',
  'insurance',
  'other',
]);

/** Türkçe kanonik ad → kod. Veritabanındaki name kolonu bu adla kalır. */
const BUILTIN_EXPENSE_CATEGORY_NAME_TO_CODE: Record<string, string> = {
  kira: 'rent',
  maaş: 'salary',
  elektrik: 'electricity',
  su: 'water',
  internet: 'internet',
  telefon: 'phone',
  'bakım-onarım': 'maintenance',
  'bakım/onarım': 'maintenance',
  temizlik: 'cleaning',
  pazarlama: 'marketing',
  malzeme: 'supplies',
  ulaşım: 'transport',
  vergi: 'tax',
  sigorta: 'insurance',
  diğer: 'other',
};

const TR_FIRST: Record<string, string> = {
  i: 'İ',
  ı: 'I',
  ş: 'Ş',
  ğ: 'Ğ',
  ü: 'Ü',
  ö: 'Ö',
  ç: 'Ç',
};

const KEY_PREFIX = /^(?:expenseCategory|expense_category)[._](.+)$/i;

export function normalizeExpenseCategoryText(value: string): string {
  return String(value || '').trim().toLocaleLowerCase('tr-TR').replace(/\s+/g, ' ');
}

export function expenseCategoryKeySuffix(value: string): string | null {
  const match = String(value || '').trim().match(KEY_PREFIX);
  if (!match) return null;
  const suffix = match[1].trim();
  return suffix || null;
}

/** Alt çizgili makine kodu: yeni_kategori. "Su" ve "Kira" bu kalıba girmez. */
export function isExpenseCategorySlug(value: string): boolean {
  return /^[a-z0-9]+(?:_[a-z0-9]+)+$/.test(String(value || '').trim());
}

export function isHumanExpenseCategoryName(value: string): boolean {
  const text = String(value || '').trim();
  if (!text) return false;
  if (expenseCategoryKeySuffix(text)) return false;
  if (isExpenseCategorySlug(text)) return false;
  return true;
}

export function titleCaseExpenseSlug(slug: string): string {
  return String(slug || '')
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((word) => {
      const lower = word.toLocaleLowerCase('tr-TR');
      const first = lower.charAt(0);
      const upper = TR_FIRST[first] ?? first.toLocaleUpperCase('tr-TR');
      return upper + lower.slice(1);
    })
    .join(' ');
}

function lookupTranslation(translate: (key: string) => string, suffix: string): string | null {
  const keys = [`expenseCategory.${suffix}`, `expenseCategory_${suffix}`];
  for (const key of keys) {
    const value = String(translate(key) || '').trim();
    if (!value || value === key) continue;
    if (value.startsWith('expenseCategory.') || value.startsWith('expenseCategory_')) continue;
    return value;
  }
  return null;
}

function labelFromToken(token: string, translate: (key: string) => string): string {
  const translated = lookupTranslation(translate, token);
  if (translated) return translated;
  if (KNOWN_EXPENSE_CATEGORY_LABELS[token]) return KNOWN_EXPENSE_CATEGORY_LABELS[token];
  if (isExpenseCategorySlug(token)) return titleCaseExpenseSlug(token);
  return '';
}

/** Sistem kodu veya Türkçe kanonik ad. Kullanıcının yazdığı ad bu kümeye girmez. */
function builtinExpenseCategoryI18nCode(value: string): string | null {
  const trimmed = String(value || '').trim();
  if (!trimmed) return null;
  if (/^[a-z0-9_]+$/.test(trimmed)) {
    const alias = BUILTIN_EXPENSE_CATEGORY_CODE_ALIAS[trimmed];
    if (alias) return alias;
    if (BUILTIN_EXPENSE_CATEGORY_I18N_CODES.has(trimmed)) return trimmed;
  }
  return BUILTIN_EXPENSE_CATEGORY_NAME_TO_CODE[normalizeExpenseCategoryText(trimmed)] || null;
}

function labelForBuiltinExpenseCategory(code: string, translate: (key: string) => string): string {
  return labelFromToken(code, translate) || KNOWN_EXPENSE_CATEGORY_LABELS[code] || code;
}

function systemExpenseCategoryDisplayLabel(
  row: ExpenseCategoryLabelSource,
  raw: string,
  translate: (key: string) => string,
): string | null {
  if (!isSystemExpenseCategory(row)) return null;
  const code =
    builtinExpenseCategoryI18nCode(String(row.code || '')) ||
    builtinExpenseCategoryI18nCode(String(row.name || '')) ||
    builtinExpenseCategoryI18nCode(raw);
  if (!code) return null;
  return labelForBuiltinExpenseCategory(code, translate);
}

function findCategory(
  stored: string,
  categories: ExpenseCategoryLabelSource[],
): ExpenseCategoryLabelSource | undefined {
  const trimmed = stored.trim();
  const normalized = normalizeExpenseCategoryText(trimmed);
  return categories.find((row) => {
    const code = String(row.code || '').trim();
    const name = String(row.name || '').trim();
    const id = String(row.id || '').trim();
    return (
      code === trimmed ||
      id === trimmed ||
      name === trimmed ||
      (name && normalizeExpenseCategoryText(name) === normalized) ||
      (code && normalizeExpenseCategoryText(code) === normalized)
    );
  });
}

export function resolveExpenseCategoryLabel(
  stored: string,
  options?: ExpenseCategoryLabelOptions,
): string {
  const raw = String(stored || '').trim();
  if (!raw) return '';
  const translate = options?.translate ?? ((key: string) => key);
  const categories = options?.categories ?? [];

  const suffix = expenseCategoryKeySuffix(raw);
  if (suffix) {
    const systemCode = builtinExpenseCategoryI18nCode(suffix);
    if (systemCode) return labelForBuiltinExpenseCategory(systemCode, translate);
    const linked = findCategory(suffix, categories);
    const systemLabel = linked ? systemExpenseCategoryDisplayLabel(linked, suffix, translate) : null;
    if (systemLabel) return systemLabel;
    const linkedName = String(linked?.name || '').trim();
    if (linked && isHumanExpenseCategoryName(linkedName)) return linkedName;
    return labelFromToken(suffix, translate) || titleCaseExpenseSlug(suffix);
  }

  const linked = findCategory(raw, categories);
  if (linked) {
    const systemLabel = systemExpenseCategoryDisplayLabel(linked, raw, translate);
    if (systemLabel) return systemLabel;
    const linkedName = String(linked.name || '').trim();
    if (isHumanExpenseCategoryName(linkedName)) return linkedName;
    const linkedSuffix = expenseCategoryKeySuffix(linkedName);
    if (linkedSuffix) {
      return labelFromToken(linkedSuffix, translate) || titleCaseExpenseSlug(linkedSuffix);
    }
    const fromCode = labelFromToken(String(linked.code || raw).trim(), translate);
    if (fromCode) return fromCode;
    if (isExpenseCategorySlug(linkedName)) return titleCaseExpenseSlug(linkedName);
  }

  const directSystem = builtinExpenseCategoryI18nCode(raw);
  if (directSystem) return labelForBuiltinExpenseCategory(directSystem, translate);

  const direct = labelFromToken(raw, translate);
  if (direct) return direct;
  if (isExpenseCategorySlug(raw)) return titleCaseExpenseSlug(raw);
  return raw;
}

export function isSystemExpenseCategory(row: ExpenseCategoryLabelSource): boolean {
  if (row.is_system === true) return true;
  const code = normalizeExpenseCategoryText(String(row.code || ''));
  if (code && SYSTEM_EXPENSE_CATEGORY_CODES.has(code)) return true;
  const name = normalizeExpenseCategoryText(String(row.name || ''));
  if (name && SYSTEM_EXPENSE_CATEGORY_NAMES.has(name)) return true;
  return false;
}

export function expenseCategoryAllowsEdit(row: ExpenseCategoryLabelSource): boolean {
  return !isSystemExpenseCategory(row);
}

/** Ekleyen kolonu. Sistem tohumu Sistem. Kişi bilinmiyorsa mevcut etiket. Ad uydurulmaz. */
export function expenseCategoryAddedByLabel(
  row: ExpenseCategoryLabelSource & { created_by_name?: string | null },
  labels: { system: string; unknownUser: string },
): string {
  if (isSystemExpenseCategory(row)) return labels.system;
  const stored = String(row.created_by_name ?? '').trim();
  return stored || labels.unknownUser;
}

const TR_CODE_MAP: Record<string, string> = {
  ç: 'c',
  Ç: 'c',
  ğ: 'g',
  Ğ: 'g',
  ı: 'i',
  İ: 'i',
  I: 'i',
  ö: 'o',
  Ö: 'o',
  ş: 's',
  Ş: 's',
  ü: 'u',
  Ü: 'u',
};

export function expenseCategoryCodeFromName(name: string): string {
  let folded = '';
  for (const ch of String(name || '').trim()) {
    folded += TR_CODE_MAP[ch] ?? ch;
  }
  const code = folded
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 50);
  return code || 'kategori';
}

export function uniqueExpenseCategoryCode(name: string, taken: string[]): string {
  const base = expenseCategoryCodeFromName(name);
  const used = new Set(taken.map((code) => String(code || '').trim()).filter(Boolean));
  if (!used.has(base)) return base;
  let n = 2;
  while (used.has(`${base}_${n}`) && n < 100) n += 1;
  return `${base}_${n}`.slice(0, 50);
}
