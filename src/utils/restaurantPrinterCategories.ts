/**
 * Restoran yazıcı ayarı: kategori ağacı + mutfak fişi eşlemesi.
 * useRestaurantStore ile döngüsel import yok — loadCategories burayı doldurur.
 */
import type { Category } from '../services/api/masterData';

export function categoryMatchKey(s: string | undefined | null): string {
  if (s == null) return '';
  try {
    return String(s).trim().normalize('NFC').replace(/\s+/g, ' ').toLocaleLowerCase('tr-TR');
  } catch {
    return String(s).trim().replace(/\s+/g, ' ').toLocaleLowerCase('tr-TR');
  }
}

let remembered: Category[] = [];

export function rememberRestaurantCategories(cats: Category[]): void {
  remembered = Array.isArray(cats) ? cats.filter((c) => c && (c.id || c.code || c.name)) : [];
}

export function getRememberedRestaurantCategories(): Category[] {
  return remembered;
}

function catToken(c: Category | undefined | null): string[] {
  if (!c) return [];
  return [c.id, c.code, c.name].map((x) => String(x ?? '').trim()).filter(Boolean);
}

export function findCategoryRecord(token: string | undefined | null): Category | undefined {
  const k = categoryMatchKey(token);
  if (!k) return undefined;
  return remembered.find((c) => catToken(c).some((t) => categoryMatchKey(t) === k));
}

/** Ürün/rota etiketini id + kod + ad + üst kategori ile genişlet. */
export function expandCategoryLabels(rawList: Array<string | undefined | null>): string[] {
  const byId = new Map(remembered.map((c) => [c.id, c]));
  const out = new Set<string>();

  const addCat = (c: Category | undefined) => {
    if (!c) return;
    for (const t of catToken(c)) out.add(t);
    const parent = c.parent_id ? byId.get(c.parent_id) : undefined;
    if (parent) {
      for (const t of catToken(parent)) out.add(t);
      const pn = String(parent.name || parent.code || '').trim();
      const cn = String(c.name || c.code || '').trim();
      if (pn && cn) out.add(`${pn} › ${cn}`);
    }
  };

  for (const raw of rawList) {
    const s = String(raw ?? '').trim();
    if (!s) continue;
    out.add(s);
    addCat(findCategoryRecord(s));
    const parts = s.split(/\s*[>|/\\]+\s*/).map((p) => p.trim()).filter(Boolean);
    if (parts.length > 1) {
      parts.forEach((p) => {
        out.add(p);
        addCat(findCategoryRecord(p));
      });
    }
  }
  return [...out];
}

export type PrinterCategoryRouteRow = {
  /** Rota kaydı `categoryId` — UUID tercih */
  key: string;
  label: string;
  depth: 0 | 1;
  aliases: string[];
};

function aliasesForCategory(c: Category, parent?: Category): string[] {
  const a = [...catToken(c)];
  if (parent) {
    a.push(...catToken(parent));
    const pn = String(parent.name || parent.code || '').trim();
    const cn = String(c.name || c.code || '').trim();
    if (pn && cn) a.push(`${pn} › ${cn}`);
  }
  return [...new Set(a.filter(Boolean))];
}

export function buildPrinterCategoryRouteRows(params: {
  categories: Category[];
  extraLabels: string[];
  existingRouteIds: string[];
}): PrinterCategoryRouteRow[] {
  const cats = (params.categories?.length ? params.categories : remembered).filter(
    (c) => c && String(c.id || c.code || c.name).trim(),
  );
  const byId = new Map(cats.map((c) => [c.id, c]));
  const rows: PrinterCategoryRouteRow[] = [];
  const covered = new Set<string>();

  const mark = (aliases: string[]) => {
    for (const a of aliases) {
      const k = categoryMatchKey(a);
      if (k) covered.add(k);
    }
  };

  const pushCat = (c: Category, depth: 0 | 1) => {
    const parent = c.parent_id ? byId.get(c.parent_id) : undefined;
    const label = parent
      ? `${parent.name || parent.code} › ${c.name || c.code}`
      : String(c.name || c.code || c.id);
    const key = String(c.id || c.code || c.name);
    const aliases = aliasesForCategory(c, parent);
    rows.push({ key, label, depth, aliases });
    mark(aliases);
  };

  const roots = cats
    .filter((c) => !c.parent_id)
    .sort((a, b) => String(a.name || a.code).localeCompare(String(b.name || b.code), 'tr'));
  const children = cats.filter((c) => Boolean(c.parent_id));

  for (const root of roots) {
    pushCat(root, 0);
    const kids = children
      .filter((ch) => ch.parent_id === root.id)
      .sort((a, b) => String(a.name || a.code).localeCompare(String(b.name || b.code), 'tr'));
    for (const k of kids) pushCat(k, 1);
  }
  for (const ch of children) {
    if (!covered.has(categoryMatchKey(ch.id))) pushCat(ch, 1);
  }

  const extras = [...params.extraLabels, ...params.existingRouteIds];
  for (const raw of extras) {
    const s = String(raw ?? '').trim();
    if (!s) continue;
    const k = categoryMatchKey(s);
    if (!k || covered.has(k)) continue;
    const rec = findCategoryRecord(s);
    if (rec && covered.has(categoryMatchKey(rec.id))) continue;
    if (rec) {
      pushCat(rec, rec.parent_id ? 1 : 0);
      continue;
    }
    rows.push({ key: s, label: s, depth: 0, aliases: [s] });
    mark([s]);
  }

  return rows;
}

export function findRouteForCategoryRow(
  routes: Array<{ categoryId: string }>,
  row: PrinterCategoryRouteRow,
): (typeof routes)[number] | undefined {
  const keys = new Set([row.key, ...row.aliases].map(categoryMatchKey).filter(Boolean));
  return routes.find((r) => keys.has(categoryMatchKey(r.categoryId)));
}
