/**
 * Nakit akış Cari kolonu.
 * Satış fişi müşteri adı, gider tedarikçisi / gider carisi, adsız satır boş.
 * Giriş, çıkış ve net tutar ad bağlanınca değişmez.
 */
import { describe, expect, it } from 'vitest';
import {
  applyCashFlowAccountName,
  cashFlowAccountSql,
  cashFlowSalesFicheKeys,
  emptyCashFlowNameIndexes,
  resolveCashFlowLineAccountName,
  type CashFlowLineRef,
  type CashFlowNameIndexes,
} from '../../utils/cashFlowAccountName';

const SALE_ID = '11111111-1111-4111-8111-111111111111';
const SUPPLIER_ID = '22222222-2222-4222-8222-222222222222';
const CARD_ID = '33333333-3333-4333-8333-333333333333';
const LINE_SALE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const LINE_RES = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const LINE_EXP = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const LINE_EMPTY = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

function line(partial: Partial<CashFlowLineRef> & Pick<CashFlowLineRef, 'id'>): CashFlowLineRef {
  return {
    id: partial.id,
    ficheNo: partial.ficheNo ?? '',
    customerId: partial.customerId ?? '',
    partyId: partial.partyId ?? '',
    expenseCardId: partial.expenseCardId ?? '',
    accountName: partial.accountName ?? '',
  };
}

function indexes(fill: (idx: {
  customers: Map<string, string>;
  suppliers: Map<string, string>;
  parties: Map<string, string>;
  expenseCards: Map<string, string>;
  salesCustomerByFiche: Map<string, string>;
  reservationCustomerByLineId: Map<string, string>;
  expenseAccountByLineId: Map<string, string>;
}) => void): CashFlowNameIndexes {
  const customers = new Map<string, string>();
  const suppliers = new Map<string, string>();
  const parties = new Map<string, string>();
  const expenseCards = new Map<string, string>();
  const salesCustomerByFiche = new Map<string, string>();
  const reservationCustomerByLineId = new Map<string, string>();
  const expenseAccountByLineId = new Map<string, string>();
  fill({
    customers,
    suppliers,
    parties,
    expenseCards,
    salesCustomerByFiche,
    reservationCustomerByLineId,
    expenseAccountByLineId,
  });
  return {
    customers,
    suppliers,
    parties,
    expenseCards,
    salesCustomerByFiche,
    reservationCustomerByLineId,
    expenseAccountByLineId,
  };
}

describe('cashFlowSalesFicheKeys', () => {
  it('satış fiş numarasının son parçasını kırpmaz', () => {
    expect(cashFlowSalesFicheKeys('BEA-2026-00004')).toEqual(['BEA-2026-00004']);
  });

  it('çoklu ödeme sonekini satış başlığına bağlar', () => {
    expect(cashFlowSalesFicheKeys('BEA-2026-00004-T1')).toEqual([
      'BEA-2026-00004-T1',
      'BEA-2026-00004',
    ]);
  });
});

describe('resolveCashFlowLineAccountName', () => {
  it('satış fişinde müşteri adını satış kartından alır', () => {
    const idx = indexes((m) => {
      m.salesCustomerByFiche.set('BEA-2026-00004', 'Ayşe Öğüt');
    });
    expect(
      resolveCashFlowLineAccountName(
        line({ id: LINE_SALE, ficheNo: 'BEA-2026-00004' }),
        idx,
      ),
    ).toBe('Ayşe Öğüt');
  });

  it('müşteri kartı satıştaki yazılı addan önce gelir', () => {
    const idx = indexes((m) => {
      m.customers.set(SALE_ID, 'Kart Ünvanı');
      m.salesCustomerByFiche.set('BEA-2026-00004', 'Fişteki Ad');
    });
    expect(
      resolveCashFlowLineAccountName(
        line({ id: LINE_SALE, ficheNo: 'BEA-2026-00004', customerId: SALE_ID }),
        idx,
      ),
    ).toBe('Kart Ünvanı');
  });

  it('rezervasyon tahsilatında cari_avans müşterisini gösterir', () => {
    const idx = indexes((m) => {
      m.reservationCustomerByLineId.set(LINE_RES, 'Mehmet Şirin');
    });
    expect(
      resolveCashFlowLineAccountName(
        line({ id: LINE_RES, ficheNo: 'KASA-AVANS-1' }),
        idx,
      ),
    ).toBe('Mehmet Şirin');
  });

  it('giderde tedarikçi adını party_id üzerinden alır', () => {
    const idx = indexes((m) => {
      m.suppliers.set(SUPPLIER_ID, 'Ofis Kira Ltd');
    });
    expect(
      resolveCashFlowLineAccountName(
        line({ id: LINE_EXP, ficheNo: 'EXP-1', partyId: SUPPLIER_ID }),
        idx,
      ),
    ).toBe('Ofis Kira Ltd');
  });

  it('gider carisini gider kartından, yoksa maliyet merkezinden alır', () => {
    const byCard = indexes((m) => {
      m.expenseCards.set(CARD_ID, 'Kira Gideri');
      m.expenseAccountByLineId.set(LINE_EXP, 'Merkez');
    });
    expect(
      resolveCashFlowLineAccountName(
        line({ id: LINE_EXP, expenseCardId: CARD_ID }),
        byCard,
      ),
    ).toBe('Kira Gideri');

    const byCenter = indexes((m) => {
      m.expenseAccountByLineId.set(LINE_EXP, 'Ofis Giderleri');
    });
    expect(
      resolveCashFlowLineAccountName(line({ id: LINE_EXP }), byCenter),
    ).toBe('Ofis Giderleri');
  });

  it('adı olmayan satırda boş kalır; açıklama ad yerine geçmez', () => {
    expect(
      resolveCashFlowLineAccountName(
        line({ id: LINE_EMPTY, ficheNo: 'EXP-OFIS', accountName: '' }),
        emptyCashFlowNameIndexes(),
      ),
    ).toBe('');
  });
});

describe('applyCashFlowAccountName tutarları', () => {
  it('cari adı bağlanınca giriş, çıkış ve net aynı kalır', () => {
    const idx = indexes((m) => {
      m.salesCustomerByFiche.set('BEA-2026-00004', 'Ayşe Öğüt');
      m.reservationCustomerByLineId.set(LINE_RES, 'Mehmet Şirin');
      m.suppliers.set(SUPPLIER_ID, 'Ofis Kira Ltd');
    });
    const rows = [
      { amount: 415000, sign: 1, netAmount: 415000, accountName: '', kind: 'sale' as const },
      { amount: 20000, sign: 1, netAmount: 20000, accountName: '', kind: 'res' as const },
      { amount: 10000, sign: 1, netAmount: 10000, accountName: '', kind: 'res2' as const },
      { amount: 50000, sign: -1, netAmount: -50000, accountName: '', kind: 'exp' as const },
      { amount: 20000, sign: 1, netAmount: 20000, accountName: '', kind: 'empty' as const },
    ];
    const refs: Record<string, CashFlowLineRef> = {
      sale: line({ id: LINE_SALE, ficheNo: 'BEA-2026-00004' }),
      res: line({ id: LINE_RES }),
      res2: line({ id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee' }),
      exp: line({ id: LINE_EXP, partyId: SUPPLIER_ID }),
      empty: line({ id: LINE_EMPTY }),
    };
    const named = rows.map((row) => {
      const ref = refs[row.kind];
      const next = applyCashFlowAccountName(row, ref, idx);
      expect(next.amount).toBe(row.amount);
      expect(next.sign).toBe(row.sign);
      expect(next.netAmount).toBe(row.netAmount);
      return next;
    });
    expect(named[0].accountName).toBe('Ayşe Öğüt');
    expect(named[1].accountName).toBe('Mehmet Şirin');
    expect(named[2].accountName).toBe('');
    expect(named[3].accountName).toBe('Ofis Kira Ltd');
    expect(named[4].accountName).toBe('');

    const sum = (list: typeof rows) =>
      list.reduce(
        (acc, row) => {
          const abs = Math.abs(row.amount);
          if (row.sign < 0) acc.out += abs;
          else acc.in += abs;
          return acc;
        },
        { in: 0, out: 0 },
      );
    const before = sum(rows);
    const after = sum(named);
    expect(after).toEqual(before);
    expect(before.in - before.out).toBe(415000);
    expect(before.out).toBe(50000);
    expect(before.in).toBe(465000);
  });
});

describe('cashFlowAccountSql', () => {
  const avans = 'rex_001_01_cari_avans';

  it('kasa satırını satış, tedarikçi, gider kartı ve rezervasyon tablosuna bağlar', () => {
    const sql = cashFlowAccountSql('cl', avans);
    expect(sql.joins).toContain('FROM sales sl');
    expect(sql.joins).toContain('FROM suppliers');
    expect(sql.joins).toContain('cl.party_id');
    expect(sql.joins).toContain('FROM expense_cards');
    expect(sql.joins).toContain('FROM expenses ex');
    expect(sql.joins).toContain('cost_centers');
    expect(sql.joins).toContain(avans);
    expect(sql.joins).toContain('av.cash_line_id = cl.id');
    expect(sql.selectExpr).toContain('cf_sale.customer_name');
    expect(sql.joins).toContain('LIMIT 1');
    expect(sql.joins).toContain('string_to_array');
    expect(sql.joins).not.toContain('LIKE');
  });

  it('banka satırında olmayan party_id ve gider kartı kolonuna bakmaz', () => {
    const sql = cashFlowAccountSql('bl', avans);
    expect(sql.joins).not.toContain('party_id');
    expect(sql.joins).not.toContain('expense_card');
    expect(sql.joins).not.toContain('FROM expenses');
    expect(sql.joins).toContain('bl.customer_id');
    expect(sql.joins).toContain('FROM sales sl');
  });
});
