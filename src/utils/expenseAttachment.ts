/**
 * Gider fiş / fatura eki.
 * Seçilen dosya mevcut belge alanına yazılır. Ayrı bir yükleme servisi yoktur.
 */

export const EXPENSE_ATTACHMENT_ACCEPT = 'image/*,application/pdf,.pdf';

export interface ExpenseAttachmentPick {
  name: string;
  file: File;
}

export function recordExpenseAttachmentFile(file: File | null | undefined): ExpenseAttachmentPick | null {
  if (!file) return null;
  const name = String(file.name || '').trim();
  if (!name) return null;
  return { name, file };
}

/** Dosya kontrolünün change listesindeki ilk dosyayı kaydeder. Boş seçim kayıt açmaz. */
export function recordExpenseAttachmentFromList(
  files: ArrayLike<File> | null | undefined,
): ExpenseAttachmentPick | null {
  const file = files && files.length > 0 ? files[0] : null;
  return recordExpenseAttachmentFile(file);
}

export function readExpenseAttachmentDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(reader.error ?? new Error('read'));
    reader.readAsDataURL(file);
  });
}
