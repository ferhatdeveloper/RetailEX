/**
 * Klinik rapor merkezi — hizmet cirosu satış fiyatı, peşinat ciro dışı,
 * ürün iadesi bir kez eksi.
 */
import { describe, expect, it } from 'vitest';
import type { BeautyAppointment } from '../../types/beauty';
import {
  CLINIC_MIRROR_REPORTS,
  CLINIC_REPORT_CENTER_TAB,
  GENERAL_REPORTS_TAB,
  buildClinicMirrorReports,
  type ClinicMirrorInput,
} from '../../utils/clinicReportCenter';
import type { BeautyProductReturnLine } from '../../utils/beautyProductSalesNet';

const BOYA_ID = '11111111-1111-4111-8111-111111111111';

function appointment(partial: Partial<BeautyAppointment> & Pick<BeautyAppointment, 'id' | 'total_price' | 'service_name'>): BeautyAppointment {
  return {
    duration: 30,
    status: 'completed',
    is_package_session: false,
    customer_id: 'c1',
    customer_name: 'FERDİN BEY',
    staff_id: 's1',
    specialist_name: 'Uzman',
    date: '2026-10-02',
    ...partial,
  } as BeautyAppointment;
}

function productReturn(overrides: Partial<BeautyProductReturnLine> = {}): BeautyProductReturnLine {
  return {
    saleId: 'return-sale-1',
    lineId: 'return-line-1',
    ficheNo: 'IAD-1',
    date: '2026-10-03',
    customerName: 'FERDİN BEY',
    paymentMethod: 'cash',
    cashier: 'Uzman',
    trcode: 3,
    ficheType: 'return_invoice',
    productId: BOYA_ID,
    itemCode: '0000001',
    itemName: 'BOYA',
    itemType: 'Malzeme',
    quantity: 1,
    unitPrice: 10_000,
    netAmount: 10_000,
    totalAmount: 10_000,
    ...overrides,
  };
}

function sample(returns = [productReturn()]): ClinicMirrorInput {
  return {
    from: '2026-10-01',
    to: '2026-10-31',
    firmName: 'Merkez',
    branches: [{ id: 'b1', name: 'Merkez', phone: '' }],
    services: [
      { id: 'sv1', name: 'HAIR CUT', isActive: true },
      { id: 'sv2', name: 'HAIR PINK COLOR', isActive: true },
    ],
    specialists: [{ id: 's1', name: 'Uzman', isActive: true }],
    customers: [{ id: 'c1', name: 'FERDİN BEY', isActive: true, createdAt: '2026-09-01' }],
    appointments: [
      appointment({
        id: 'a1',
        service_name: 'HAIR CUT',
        total_price: 50_000,
        deposit_amount: 9_000,
      }),
      appointment({
        id: 'a2',
        service_name: 'HAIR PINK COLOR',
        total_price: 60_000,
        deposit_amount: 11_000,
        time: '11:00',
      }),
    ],
    sales: [
      {
        id: 'sale-1',
        paymentStatus: 'paid',
        paymentMethod: 'cash',
        customerId: 'c1',
        customerName: 'FERDİN BEY',
        createdAt: '2026-10-02T10:00:00',
        items: [
          {
            id: 'line-1',
            itemType: 'product',
            itemId: BOYA_ID,
            name: 'BOYA',
            code: '0000001',
            quantity: 2,
            unitPrice: 10_000,
            total: 20_000,
            staffId: 's1',
          },
        ],
      },
    ],
    returns,
    expenses: [],
    audit: [],
  };
}

describe('klinik rapor merkezi', () => {
  it('V2 rapor anahtarı genel rapor anahtarı değildir', () => {
    expect(CLINIC_REPORT_CENTER_TAB).toBe('clinic_reports');
    expect(GENERAL_REPORTS_TAB).toBe('reports');
    expect(CLINIC_REPORT_CENTER_TAB).not.toBe(GENERAL_REPORTS_TAB);
    expect(CLINIC_MIRROR_REPORTS.map((item) => item.id)).toEqual([
      'institution',
      'income',
      'receivable',
      'service',
      'customer',
      'appointment',
      'staff',
      'audit',
    ]);
  });

  it('hizmet cirosu 110.000, ürün iadesi bir kez, net gelir 120.000, peşinat ciro dışı', () => {
    const once = buildClinicMirrorReports(sample());
    const twice = buildClinicMirrorReports(sample([productReturn(), productReturn()]));

    expect(once.services.map((row) => [row.serviceName, row.revenue])).toEqual([
      ['HAIR PINK COLOR', 60_000],
      ['HAIR CUT', 50_000],
    ]);
    expect(once.serviceRevenue).toBe(110_000);
    expect(once.depositAmount).toBe(20_000);
    expect(once.serviceRevenue).not.toBe(110_000 + 20_000);
    expect(once.productGross).toBe(20_000);
    expect(once.returnAmount).toBe(-10_000);
    expect(once.productNet).toBe(10_000);
    expect(once.income).toBe(120_000);
    expect(once.income).not.toBe(140_000);
    expect(once.movements.filter((row) => row.kind === 'return')).toEqual([
      expect.objectContaining({ amount: -10_000, depositAmount: 0 }),
    ]);
    expect(once.movements.filter((row) => row.kind === 'deposit').reduce((sum, row) => sum + row.depositAmount, 0)).toBe(20_000);
    expect(once.movements.filter((row) => row.kind === 'deposit').every((row) => row.amount === 0)).toBe(true);
    expect(once.movements.reduce((sum, row) => sum + row.amount, 0)).toBe(120_000);

    expect(twice.returnAmount).toBe(-10_000);
    expect(twice.productNet).toBe(10_000);
    expect(twice.income).toBe(120_000);
    expect(twice.movements.filter((row) => row.kind === 'return')).toHaveLength(1);

    const debtor = once.debtors.find((row) => row.customerName === 'FERDİN BEY');
    expect(debtor?.serviceDebt).toBe(110_000);
    expect(debtor?.productNet).toBe(10_000);
    expect(debtor?.returnAmount).toBe(-10_000);
    expect(debtor?.depositAmount).toBe(20_000);
    expect(debtor?.openAmount).toBe(90_000);
    expect(debtor?.openAmount).not.toBe(90_000 - 10_000);

    expect(once.institutions[0]?.income).toBe(120_000);
    expect(once.staff.find((row) => row.staffName === 'Uzman')?.revenue).toBe(120_000);
    expect(once.topCustomers[0]?.revenue).toBe(120_000);
    expect(once.topCustomers[0]?.depositAmount).toBe(20_000);
  });
});
