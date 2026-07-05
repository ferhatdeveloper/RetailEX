/** Etiket barkodu — boşsa kod / SKU ile CODE128 yedek. */
export function resolveLabelBarcodeValue(
  primary?: string | null,
  ...fallbacks: (string | undefined | null)[]
): string {
  for (const raw of [primary, ...fallbacks]) {
    const s = String(raw ?? '').trim();
    if (s) return s;
  }
  return '';
}
