/**
 * Randevu kartında görünen fiş satırı.
 * Kayıtlı anahtar değişmez; ekranda yalnız fiş numarası kalır.
 */
import { receiptNotesForDisplay } from './receiptNotes';
import { isSaleSeriesFiche, readReservedSaleFiche } from './reservationSaleFiche';

export function appointmentCardNoteAndFiche(apt: {
  notes?: string | null;
  deposit_sale_fiche_no?: string | null;
}): { note: string; fiche: string } {
  const fromNotes = readReservedSaleFiche(apt.notes);
  const stored = String(apt.deposit_sale_fiche_no ?? '').trim();
  const fiche = isSaleSeriesFiche(stored) ? stored.toUpperCase() : fromNotes;
  let note = receiptNotesForDisplay(apt.notes);
  if (fiche && note.localeCompare(fiche, 'tr', { sensitivity: 'accent' }) === 0) note = '';
  return { note, fiche };
}
