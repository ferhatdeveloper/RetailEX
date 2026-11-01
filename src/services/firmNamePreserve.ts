/**
 * Giriş, şema provision ve senkron: kayıtlı firma adını yer tutucu ile ezme.
 * "Firma 001" ve "RetailEx OS" yalnızca ad hâlâ boşken (ilk satır) kullanılır.
 */

const GENERIC_NUMBERED_FIRM_NAME = /^Firma \d{3}$/;
const TEMPLATE_FIRM_NAME = 'RetailEx OS';

export function padFirmNrForName(nr: string | null | undefined): string {
  const digits = String(nr ?? '').replace(/\D/g, '');
  const stripped = digits.replace(/^0+/, '');
  const padded = stripped.padStart(3, '0');
  if (!digits || padded === '000') return '001';
  return padded;
}

/** Boş, "Firma 001" veya şablon "RetailEx OS". */
export function isGenericFirmName(name: string | null | undefined): boolean {
  const n = String(name ?? '').trim();
  if (!n) return true;
  if (n === TEMPLATE_FIRM_NAME) return true;
  return GENERIC_NUMBERED_FIRM_NAME.test(n);
}

export function defaultFirmPlaceholder(firmNr: string | null | undefined): string {
  return `Firma ${padFirmNrForName(firmNr)}`;
}

/**
 * Mevcut satır + bu çağrının adı. Özel ad durur.
 * Ad sütunu yer tutucuya dönmüşse ve unvan özel ise unvan korunur.
 * İkisi de boşsa yer tutucu yalnızca ilk oluşturma içindir.
 */
export function resolveFirmNameForProvision(
  existing: { name?: string | null; title?: string | null } | null | undefined,
  incomingName: string | null | undefined,
  firmNr: string | null | undefined,
): string {
  const incoming = String(incomingName ?? '').trim();
  const existingName = String(existing?.name ?? '').trim();
  const existingTitle = String(existing?.title ?? '').trim();

  if (incoming && !isGenericFirmName(incoming)) return incoming;
  if (existingName && !isGenericFirmName(existingName)) return existingName;
  if (existingTitle && !isGenericFirmName(existingTitle)) return existingTitle;
  if (existingName) return existingName;
  return incoming || defaultFirmPlaceholder(firmNr);
}

/** RPC / SQL parametresi: yer tutucuyu gönderme, sunucu mevcut özel adı korusun. */
export function firmNameArgForProvision(
  existing: { name?: string | null; title?: string | null } | null | undefined,
  incomingName: string | null | undefined,
  firmNr: string | null | undefined,
): string | null {
  const kept = resolveFirmNameForProvision(existing, incomingName, firmNr);
  return isGenericFirmName(kept) ? null : kept;
}
