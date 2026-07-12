/** Cari hesaplar listesi kolon görünürlüğü (localStorage). */

export const SUPPLIER_LIST_COLUMN_VISIBILITY_KEY = 'retailex_supplierList_columnVisibility_v1';

export type SupplierListColumnId =
  | 'code'
  | 'cardType'
  | 'name'
  | 'contact'
  | 'balance'
  | 'actions';

type ColumnMeta = {
  id: SupplierListColumnId;
  labelKey: string;
  defaultVisible: boolean;
};

export const SUPPLIER_LIST_COLUMN_META: Record<SupplierListColumnId, ColumnMeta> = {
  code: { id: 'code', labelKey: 'code', defaultVisible: true },
  cardType: { id: 'cardType', labelKey: 'type', defaultVisible: true },
  name: { id: 'name', labelKey: 'currentAccountTitle', defaultVisible: true },
  contact: { id: 'contact', labelKey: 'contact', defaultVisible: true },
  balance: { id: 'balance', labelKey: 'crmBalance', defaultVisible: true },
  actions: { id: 'actions', labelKey: 'actions', defaultVisible: true },
};

export const SUPPLIER_LIST_COLUMN_ORDER = Object.keys(
  SUPPLIER_LIST_COLUMN_META
) as SupplierListColumnId[];

export function defaultSupplierListColumnVisibility(): Record<string, boolean> {
  return Object.fromEntries(
    SUPPLIER_LIST_COLUMN_ORDER.map((id) => [id, SUPPLIER_LIST_COLUMN_META[id].defaultVisible])
  );
}

export function loadSupplierListColumnVisibility(): Record<string, boolean> {
  const defaults = defaultSupplierListColumnVisibility();
  try {
    const raw = localStorage.getItem(SUPPLIER_LIST_COLUMN_VISIBILITY_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Record<string, boolean>;
    return Object.fromEntries(
      SUPPLIER_LIST_COLUMN_ORDER.map((id) => [id, parsed[id] ?? defaults[id]])
    );
  } catch {
    return defaults;
  }
}

export function supplierListColumnVisibilityMenuItems(options: {
  columnVisibility: Record<string, boolean>;
  tm: (key: string) => string;
}): { id: string; label: string; visible: boolean }[] {
  const { columnVisibility, tm } = options;
  return SUPPLIER_LIST_COLUMN_ORDER.map((id) => {
    const meta = SUPPLIER_LIST_COLUMN_META[id];
    return {
      id,
      label: tm(meta.labelKey),
      visible: columnVisibility[id] !== false,
    };
  });
}
