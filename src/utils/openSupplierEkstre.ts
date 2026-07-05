/** Cari hesaplar ekranında hesap ekstresini açmak için oturum anahtarı */
export const OPEN_SUPPLIER_EKSTRE_STORAGE_KEY = 'retailex_open_supplier_ekstre';

export type OpenSupplierEkstrePayload = {
  id: string;
  code?: string;
};

export function requestOpenSupplierEkstre(supplier: OpenSupplierEkstrePayload): void {
  try {
    sessionStorage.setItem(
      OPEN_SUPPLIER_EKSTRE_STORAGE_KEY,
      JSON.stringify({ id: supplier.id, code: supplier.code ?? '' }),
    );
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent('navigateToScreen', { detail: 'suppliers' }));
}

export function consumeOpenSupplierEkstreRequest(): OpenSupplierEkstrePayload | null {
  try {
    const raw = sessionStorage.getItem(OPEN_SUPPLIER_EKSTRE_STORAGE_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(OPEN_SUPPLIER_EKSTRE_STORAGE_KEY);
    const parsed = JSON.parse(raw) as OpenSupplierEkstrePayload;
    if (!parsed?.id) return null;
    return parsed;
  } catch {
    return null;
  }
}
