/** Terazi TCP portu — boş/0/geçersiz = otomatik port taraması */
export function normalizeOptionalScalePort(port: unknown): number | undefined {
  if (port === null || port === undefined || port === '') return undefined;
  const n = typeof port === 'number' ? port : parseInt(String(port).trim(), 10);
  if (!Number.isFinite(n) || n < 1 || n > 65535) return undefined;
  return n;
}

export function formatScalePortInput(port: unknown): string {
  const n = normalizeOptionalScalePort(port);
  return n != null ? String(n) : '';
}

export function formatScalePortLabel(port: unknown): string {
  return normalizeOptionalScalePort(port) != null ? String(normalizeOptionalScalePort(port)) : 'Otomatik';
}
