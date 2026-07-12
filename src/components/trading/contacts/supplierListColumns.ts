/** Cari hesaplar listesi kolon görünürlüğü (localStorage). */

export const SUPPLIER_LIST_COLUMN_VISIBILITY_KEY = 'retailex_supplierList_columnVisibility_v2';

/**
 * Liste kolonları — rex_*_customers + rex_*_suppliers alanlarının birleşimi.
 * Varsayılan açık: ana kolonlar; diğerleri Kapalı (liste şişmesin).
 */
export type SupplierListColumnId =
  | 'code'
  | 'cardType'
  | 'name'
  | 'contact'
  | 'phone'
  | 'phone2'
  | 'email'
  | 'address'
  | 'city'
  | 'district'
  | 'neighborhood'
  | 'taxNumber'
  | 'taxOffice'
  | 'notes'
  | 'creditLimit'
  | 'paymentTerms'
  | 'contactPerson'
  | 'contactPersonPhone'
  | 'points'
  | 'totalSpent'
  | 'age'
  | 'gender'
  | 'customerTier'
  | 'occupation'
  | 'heardFrom'
  | 'fileId'
  | 'callPlanEnabled'
  | 'callPlanWeekdays'
  | 'callPlanNote'
  | 'callLastStatus'
  | 'callLastNote'
  | 'callLastAt'
  | 'balance'
  | 'isActive'
  | 'createdAt'
  | 'refId'
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
  phone: { id: 'phone', labelKey: 'phoneLabel', defaultVisible: false },
  phone2: { id: 'phone2', labelKey: 'custLabelPhone2', defaultVisible: false },
  email: { id: 'email', labelKey: 'emailLabel', defaultVisible: false },
  address: { id: 'address', labelKey: 'custLabelAddress', defaultVisible: false },
  city: { id: 'city', labelKey: 'cariColCity', defaultVisible: false },
  district: { id: 'district', labelKey: 'cariColDistrict', defaultVisible: false },
  neighborhood: { id: 'neighborhood', labelKey: 'cariColNeighborhood', defaultVisible: false },
  taxNumber: { id: 'taxNumber', labelKey: 'custLabelTaxNo', defaultVisible: false },
  taxOffice: { id: 'taxOffice', labelKey: 'custLabelTaxOffice', defaultVisible: false },
  notes: { id: 'notes', labelKey: 'notes', defaultVisible: false },
  creditLimit: { id: 'creditLimit', labelKey: 'cariColCreditLimit', defaultVisible: false },
  paymentTerms: { id: 'paymentTerms', labelKey: 'cariColPaymentTerms', defaultVisible: false },
  contactPerson: { id: 'contactPerson', labelKey: 'cariColContactPerson', defaultVisible: false },
  contactPersonPhone: { id: 'contactPersonPhone', labelKey: 'cariColContactPersonPhone', defaultVisible: false },
  points: { id: 'points', labelKey: 'cariColPoints', defaultVisible: false },
  totalSpent: { id: 'totalSpent', labelKey: 'cariColTotalSpent', defaultVisible: false },
  age: { id: 'age', labelKey: 'custLabelAge', defaultVisible: false },
  gender: { id: 'gender', labelKey: 'custLabelGender', defaultVisible: false },
  customerTier: { id: 'customerTier', labelKey: 'custLabelTier', defaultVisible: false },
  occupation: { id: 'occupation', labelKey: 'custLabelOccupation', defaultVisible: false },
  heardFrom: { id: 'heardFrom', labelKey: 'custLabelHeardFrom', defaultVisible: false },
  fileId: { id: 'fileId', labelKey: 'custLabelFileId', defaultVisible: false },
  callPlanEnabled: { id: 'callPlanEnabled', labelKey: 'cariColCallPlanEnabled', defaultVisible: false },
  callPlanWeekdays: { id: 'callPlanWeekdays', labelKey: 'cariColCallPlanWeekdays', defaultVisible: false },
  callPlanNote: { id: 'callPlanNote', labelKey: 'callPlanNote', defaultVisible: false },
  callLastStatus: { id: 'callLastStatus', labelKey: 'callPlanLastStatus', defaultVisible: false },
  callLastNote: { id: 'callLastNote', labelKey: 'callPlanLastStatusNote', defaultVisible: false },
  callLastAt: { id: 'callLastAt', labelKey: 'cariColCallLastAt', defaultVisible: false },
  balance: { id: 'balance', labelKey: 'crmBalance', defaultVisible: true },
  isActive: { id: 'isActive', labelKey: 'active', defaultVisible: false },
  createdAt: { id: 'createdAt', labelKey: 'createdAt', defaultVisible: false },
  refId: { id: 'refId', labelKey: 'cariColRefId', defaultVisible: false },
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
