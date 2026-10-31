/**
 * Hizmet & tarih: aynı randevu iki hizmet sütununa yazılmaz.
 * Fiş bağı kartta numara olarak görünür; kayıtlı anahtar değişmez.
 */
import { describe, expect, it } from 'vitest';
import { appointmentCardNoteAndFiche } from '../../utils/appointmentCardFicheLabel';
import { groupServiceDateBoardAppointments } from '../../utils/serviceDateBoard';

const services = [
  { id: 'svc-hair', name: 'STRONG' },
  { id: 'svc-nail', name: 'STRONG' },
];

describe('hizmet ve tarih gruplaması', () => {
  it('her randevu kendi hizmetinde bir kez durur', () => {
    const closed = {
      id: 'appt-closed',
      service_id: 'svc-hair',
      service_name: 'STRONG',
      notes: 'reserved_sale_fiche:BEA-2026-00001',
      deposit_sale_fiche_no: 'BEA-2026-00001',
    };
    const open = {
      id: 'appt-open',
      service_id: 'svc-nail',
      service_name: 'STRONG',
      notes: 'reserved_sale_fiche:BEA-2026-00002',
    };
    const grouped = groupServiceDateBoardAppointments([closed, open, closed], services);

    expect(grouped.get('svc-hair')?.map((apt) => apt.id)).toEqual(['appt-closed']);
    expect(grouped.get('svc-nail')?.map((apt) => apt.id)).toEqual(['appt-open']);
    const placed = [...grouped.values()].flat();
    expect(placed).toHaveLength(2);
    expect(new Set(placed.map((apt) => apt.id)).size).toBe(2);

    const closedCopy = appointmentCardNoteAndFiche(closed);
    const openCopy = appointmentCardNoteAndFiche(open);
    expect(closedCopy.fiche).toBe('BEA-2026-00001');
    expect(openCopy.fiche).toBe('BEA-2026-00002');
    expect(closedCopy.note).not.toContain('reserved_sale_fiche');
    expect(openCopy.note).not.toContain('reserved_sale_fiche');
    expect(`${closedCopy.fiche} ${closedCopy.note}`).not.toContain('reserved_sale_fiche');
    expect(closed.notes).toContain('reserved_sale_fiche:');
  });
});
