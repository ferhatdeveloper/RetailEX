/**
 * Satış notunun fişte gösterilecek metni.
 * Güzellik tarafında DB’de `not | rex_appt:uuid` saklanabildiği için dahili eki gizler.
 */
export function receiptNotesForDisplay(raw: string | undefined | null): string {
  const s = String(raw ?? '').trim();
  if (!s) return '';
  return s.replace(/\s*\|\s*rex_appt:[^\s|]+\s*$/i, '').trim();
}
