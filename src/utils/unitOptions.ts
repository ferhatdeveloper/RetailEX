/**
 * Birim kartı (units) + birim seti satırları (unitsetl) birleşik seçenek listesi.
 * Ürün / fatura / sipariş vb. tüm arayüzlerde aynı kaynak mantığı için kullanılır.
 */

export type UnitMasterRow = { id?: string; code?: string; name?: string };
export type UnitSetLineLike = { id?: string; code?: string; name?: string };
export type UnitSetLike = { id: string; lines?: UnitSetLineLike[] };

export type UnitSelectOption = { id: string; code: string; name: string };

const FALLBACK: UnitSelectOption[] = [{ id: 'fallback-adet', code: 'ADET', name: 'Adet' }];

/** Kart birimleri + tüm birim seti satırlarındaki isimler (tekrarsız, Türkçe sıralı). */
export function buildUnitSelectOptions(
  masterUnits: UnitMasterRow[] | null | undefined,
  unitSets: UnitSetLike[] | null | undefined
): UnitSelectOption[] {
  const byName = new Map<string, UnitSelectOption>();

  for (const u of masterUnits || []) {
    const name = String(u.name || '').trim();
    if (!name) continue;
    if (byName.has(name)) continue;
    byName.set(name, {
      id: String(u.id ?? `m:${name}`),
      code: String(u.code || '').trim() || name,
      name,
    });
  }

  for (const us of unitSets || []) {
    for (const line of us.lines || []) {
      const name = String(line.name || '').trim();
      if (!name || byName.has(name)) continue;
      const code = String(line.code || '').trim() || name;
      byName.set(name, {
        id: String(line.id || `unitset-line:${us.id}:${code}`),
        code,
        name,
      });
    }
  }

  const list = [...byName.values()].sort((a, b) =>
    a.name.localeCompare(b.name, 'tr', { sensitivity: 'base' })
  );
  return list.length > 0 ? list : FALLBACK;
}

/** Satırda kayıtlı birim, listede yoksa (eski veri) seçilebilir kalsın diye eklenir. */
export function withMissingUnitValue(
  options: UnitSelectOption[],
  currentUnit: string | null | undefined
): UnitSelectOption[] {
  const u = String(currentUnit || '').trim();
  if (!u || options.some((o) => o.name === u)) return options;
  return [...options, { id: `orphan:${u}`, code: u, name: u }];
}
