import { describe, expect, it } from 'vitest';
import { buildEkstreRows } from '../../utils/cariAccountStatement';
import { buildSavedCashInvoiceLaunch } from '../../utils/cashDocumentInvoiceLaunch';
import {
  buildReservationFicheIndexFromSources,
  dailyReservationFicheLabel,
  isInternalReservationFiche,
  kasaReservationDescription,
  kasaReservationFicheLabel,
  presentCashFlowReservationFiches,
  projectLinkedFicheRows,
  reserveSaleSeriesFiche,
  resolveReservationCollectionInvoiceOpen,
  resolveReservationDisplayFiche,
  saleFicheForNewInvoice,
  visibleStatementDescription,
  visibleStatementFiche,
} from '../../utils/reservationSaleFiche';

const APPT_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const APPT_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

describe('rezervasyon tahsilatı satış fiş numarası', () => {
  it('fatura yokken seriden 00001 ayırır ve satış faturası aynı numarayı kullanır', () => {
    const reserved = reserveSaleSeriesFiche([], 2026);
    expect(reserved).toBe('BEA-2026-00001');
    expect(saleSeriesTail(reserved)).toBe('00001');
    const invoice = saleFicheForNewInvoice(reserved, [], 2026);
    expect(invoice).toBe('BEA-2026-00001');
    const next = reserveSaleSeriesFiche([reserved], 2026);
    expect(next).toBe('BEA-2026-00002');
  });

  it('ekranda BEA yazar, KL ve AVANS fiş no olmaz, satırlar ve tutarlar ayrı kalır', () => {
    const statement = buildEkstreRows([
      {
        fiche_no: 'BEA-2026-00001',
        fiche_type: 'sales_invoice',
        total_amount: 65000,
        payment_method: 'cash',
        date: '2026-10-31',
        notes: `Satış rex_appt:${APPT_A}`,
      },
      {
        fiche_no: 'KL-MVW2MAZ-A1J4MX',
        fiche_type: 'CH_TAHSILAT',
        total_amount: 10000,
        special_code: 'REZERVASYON',
        date: '2026-10-31',
        notes: 'Rezervasyon tahsilatı - AVANS-0407919c',
        linked_sale_fiche: 'BEA-2026-00001',
      },
    ], 'customer');

    expect(statement).toHaveLength(2);
    expect(statement[0].borcAmount).toBe(65000);
    expect(statement[0].alacakAmount).toBe(65000);
    expect(statement[1].borcAmount).toBe(10000);
    expect(statement[1].alacakAmount).toBe(10000);
    expect(statement[0].fiche_no).toBe('BEA-2026-00001');
    expect(statement[1].fiche_no).toBe('KL-MVW2MAZ-A1J4MX');

    const shownSale = visibleStatementFiche(statement[0]);
    const shownCollection = visibleStatementFiche(statement[1]);
    expect(shownSale).toBe('BEA-2026-00001');
    expect(shownCollection).toBe('BEA-2026-00001');
    expect(isInternalReservationFiche(shownCollection)).toBe(false);
    expect(shownCollection.startsWith('KL-')).toBe(false);
    expect(shownCollection.startsWith('AVANS-')).toBe(false);
    expect(visibleStatementDescription(statement[1])).toBe('Rezervasyon tahsilatı — BEA-2026-00001');
    expect(statement[0].borcAmount + statement[1].borcAmount).toBe(75000);
  });

  it('aynı tutarlı başka randevuya bağlanmaz', () => {
    const index = buildReservationFicheIndexFromSources([
      {
        kind: 'sale',
        id: 'sale-1',
        ficheNo: 'BEA-2026-00001',
        notes: `rex_appt:${APPT_A}|sale_group:grup-a`,
      },
      {
        kind: 'sale',
        id: 'sale-2',
        ficheNo: 'BEA-2026-00002',
        notes: `rex_appt:${APPT_B}|sale_group:grup-b`,
      },
      {
        kind: 'advance',
        id: 'avans-1',
        notes: `Rezervasyon Tutarı · Randevu No ${APPT_A}`,
        referenceNo: 'AVANS-0407919c',
        cashLineId: 'cash-1',
      },
      {
        kind: 'advance',
        id: 'avans-2',
        notes: `Rezervasyon Tutarı · Randevu No ${APPT_B}`,
        referenceNo: 'AVANS-b9f201da',
        cashLineId: 'cash-2',
      },
    ]);

    const first = resolveReservationDisplayFiche({
      ficheNo: 'KL-MVW2MAZ-A1J4MX',
      description: 'Rezervasyon tahsilatı - AVANS-0407919c',
      notes: 'Rezervasyon tahsilatı - AVANS-0407919c',
      reservationCollection: true,
      amount: 10000,
    }, index);
    const second = resolveReservationDisplayFiche({
      ficheNo: 'KL-MVWJ3PAK-72O3M7',
      description: 'Rezervasyon tahsilatı - AVANS-b9f201da',
      reservationCollection: true,
      amount: 10000,
    }, index);
    expect(first).toBe('BEA-2026-00001');
    expect(second).toBe('BEA-2026-00002');
  });

  it('günlük rapor, nakit akış ve kasa aynı satış numarasını ayrı satırda gösterir', () => {
    const daily = dailyReservationFicheLabel(
      {
        key: 'avans-1',
        receiptNumber: 'AVANS-8a58b7b7',
        isAvans: true,
        linkedAppointmentId: APPT_A,
        notes: `Randevu No ${APPT_A}`,
        total: 10000,
      },
      [
        {
          key: 'erp-1',
          receiptNumber: 'BEA-2026-00001',
          isAvans: false,
          linkedAppointmentId: APPT_A,
          notes: `rex_appt:${APPT_A}`,
          total: 65000,
          erpSale: { id: 'erp-1', notes: `rex_appt:${APPT_A}`, receiptNumber: 'BEA-2026-00001' },
        },
        {
          key: 'avans-1',
          receiptNumber: 'AVANS-8a58b7b7',
          isAvans: true,
          linkedAppointmentId: APPT_A,
          notes: `Randevu No ${APPT_A}`,
          total: 10000,
        },
      ],
    );
    expect(daily).toBe('BEA-2026-00001');

    const reservedOnly = dailyReservationFicheLabel(
      {
        key: 'avans-new',
        receiptNumber: 'AVANS-yeni0001',
        isAvans: true,
        notes: `reserved_sale_fiche:BEA-2026-00001 | Randevu No ${APPT_A}`,
        total: 10000,
      },
      [{
        key: 'avans-new',
        receiptNumber: 'AVANS-yeni0001',
        isAvans: true,
        notes: `reserved_sale_fiche:BEA-2026-00001 | Randevu No ${APPT_A}`,
        total: 10000,
      }],
    );
    expect(reservedOnly).toBe('BEA-2026-00001');

    const flow = presentCashFlowReservationFiches([
      {
        id: 'sale-cash',
        source: 'cash',
        ficheNo: 'BEA-2026-00001',
        date: '2026-10-31',
        accountName: 'ROZA',
        transactionType: 'KASA_GIRIS',
        definition: 'Satış faturası — BEA-2026-00001',
        amount: 65000,
        sign: 1,
        netAmount: 65000,
      },
      {
        id: 'res-cash',
        source: 'cash',
        ficheNo: 'KL-MVW2MAZ-A1J4MX',
        date: '2026-10-31',
        accountName: 'ROZA',
        transactionType: 'CH_TAHSILAT',
        definition: 'Rezervasyon tahsilatı — BEA-2026-00001',
        amount: 10000,
        sign: 1,
        netAmount: 10000,
        reservationCollection: true,
        linkedSaleFiche: 'BEA-2026-00001',
      },
    ]);
    expect(flow).toHaveLength(2);
    expect(flow.map((row) => row.ficheNo)).toEqual(['BEA-2026-00001', 'BEA-2026-00001']);
    expect(flow.map((row) => row.amount)).toEqual([65000, 10000]);
    expect(flow[1].definition).toBe('Rezervasyon tahsilatı — BEA-2026-00001');
    expect(flow[1].sign).toBe(1);

    const kasa = {
      islem_no: 'KL-MVW2MAZ-A1J4MX',
      islem_aciklamasi: 'Rezervasyon tahsilatı - AVANS-0407919c',
      linked_sale_fiche: 'BEA-2026-00001',
      is_reservation_deposit: true,
      ozel_kod: 'REZERVASYON',
    };
    expect(kasaReservationFicheLabel(kasa)).toBe('BEA-2026-00001');
    expect(kasaReservationDescription(kasa)).toBe('Rezervasyon tahsilatı — BEA-2026-00001');
    expect(kasaReservationFicheLabel(kasa).includes('KL-')).toBe(false);
    expect(kasaReservationFicheLabel(kasa).includes('AVANS-')).toBe(false);
  });

  it('kasa satırı kayıtlı satış faturasını açar', () => {
    const open = resolveReservationCollectionInvoiceOpen({
      transactionType: 'CH_TAHSILAT',
      description: 'Rezervasyon tahsilatı — BEA-2026-00001',
      ficheNo: 'KL-MVW2MAZ-A1J4MX',
      isReservationDeposit: true,
      linkedSaleFiche: 'BEA-2026-00001',
    });
    expect(open?.ficheNo).toBe('BEA-2026-00001');
    expect(open?.screen).toBe('salesinvoice');
    const launch = buildSavedCashInvoiceLaunch({
      kind: 'sale',
      ficheNo: open?.ficheNo || '',
      registerId: 'kasa-1',
    });
    expect(launch.posSalesReturn.openFicheNo).toBe('BEA-2026-00001');
    expect(launch.posSalesReturn.openForm).toBe(true);

    const saleCashStays = resolveReservationCollectionInvoiceOpen({
      transactionType: 'KASA_GIRIS',
      description: 'Satış faturası — BEA-2026-00001',
      ficheNo: 'BEA-2026-00001',
      isReservationDeposit: true,
    });
    expect(saleCashStays).toBeNull();
  });

  it('aynı numara satırları birleştirmez', () => {
    const projected = projectLinkedFicheRows([
      {
        id: 'sale',
        role: 'sale',
        ficheNo: 'BEA-2026-00001',
        amount: 65000,
        debit: 65000,
        credit: 65000,
        appointmentId: APPT_A,
      },
      {
        id: 'collection',
        role: 'reservation',
        ficheNo: 'KL-MVW2MAZ-A1J4MX',
        amount: 10000,
        debit: 10000,
        credit: 10000,
        appointmentId: APPT_A,
        description: 'Rezervasyon tahsilatı - AVANS-0407919c',
      },
    ]);
    expect(projected).toHaveLength(2);
    expect(projected[0].displayFiche).toBe('BEA-2026-00001');
    expect(projected[1].displayFiche).toBe('BEA-2026-00001');
    expect(projected[0].amount).toBe(65000);
    expect(projected[1].amount).toBe(10000);
    expect(projected[0].debit).toBe(65000);
    expect(projected[1].debit).toBe(10000);
  });
});

function saleSeriesTail(fiche: string): string {
  return fiche.slice(fiche.lastIndexOf('-') + 1);
}
