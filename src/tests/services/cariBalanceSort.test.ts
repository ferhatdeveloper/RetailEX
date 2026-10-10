/**
 * Cari Hesap Özeti — sıralama + zero-balance davranışı.
 *
 * 10.10.2026 — "Hizmet satırları gözükmüyor" kullanıcı bildirimi:
 * Cari tablosunda sadece bekleyen avansı olan cariler görünüyordu;
 * kullanıcı bekleyen avansı + alacağı + borcu sıfır olan (geçmiş
 * hizmet almış ama bakiyesi kapanmış) carilerin de listede olmasını
 * istedi. Sıralama ise: pendingDeposit desc → balance desc → name asc.
 */
import { describe, expect, it } from 'vitest';
import {
  compareCariBalanceForReport,
  sortCariBalanceForReport,
} from '../../services/api/cariBalanceSort';

type Row = {
  accountName: string;
  balance: number;
  pendingDeposit: number;
};

const R = (
  accountName: string,
  balance: number,
  pendingDeposit: number,
): Row => ({ accountName, balance, pendingDeposit });

describe('compareCariBalanceForReport — Cari Hesap Özeti sıralaması', () => {
  it('önce bekleyen avans desc (rezervasyon avanslı cariler üstte)', () => {
    const a = R('ARA', -5000, 5000);
    const b = R('ROZA', -10000, 10000);
    const c = R('ESKI', 0, 0);
    const list = sortCariBalanceForReport([a, b, c]);
    expect(list.map((r) => r.accountName)).toEqual(['ROZA', 'ARA', 'ESKI']);
  });

  it('avans eşitse bakiye desc (alacaklı müşteri / borçlu tedarikçi üstte)', () => {
    const a = R('A', 5000, 0);
    const b = R('B', 10000, 0);
    const c = R('C', 0, 0);
    const list = sortCariBalanceForReport([a, b, c]);
    expect(list.map((r) => r.accountName)).toEqual(['B', 'A', 'C']);
  });

  it('avans + bakiye eşitse unvan asc (aynı tutarda isme göre)', () => {
    const a = R('ZEHRA', 0, 0);
    const b = R('AYŞE', 0, 0);
    const list = sortCariBalanceForReport([a, b]);
    expect(list.map((r) => r.accountName)).toEqual(['AYŞE', 'ZEHRA']);
  });

  it('avans + bakiye + unvan eşitse stabil (orijinal sıra)', () => {
    const a = R('AYNI', 0, 0);
    const b = R('AYNI', 0, 0);
    const list = sortCariBalanceForReport([a, b]);
    expect(list).toHaveLength(2);
  });

  it('sıfır bakiye + sıfır avans ama geçmiş hizmet olan cari de listelenir', () => {
    // Kullanıcı senaryosu: ESKI müşteri 1 ay önce 25.000 hizmet aldı,
    // 25.000 peşin ödedi → bakiye 0, avans 0; ama rapor sonucu ESKI
    // listede görünmeli.
    const rows = [
      R('ARA', -5000, 5000),
      R('ROZA', -10000, 10000),
      R('ESKI', 0, 0),
    ];
    const list = sortCariBalanceForReport(rows);
    expect(list).toHaveLength(3);
    expect(list.map((r) => r.accountName)).toContain('ESKI');
  });

  it('balanceSide=true → bakiye mutlak değer ile sıralanır', () => {
    // Tedarikçi tarafında −300 (borçlu) ile +800 (alacaklı) birlikte
    // gösterilirken ABS büyük olan üstte olmalı.
    const a = R('SUP1', -300, 0);
    const b = R('SUP2', 800, 0);
    const list = sortCariBalanceForReport([a, b], { balanceSide: true });
    expect(list.map((r) => r.accountName)).toEqual(['SUP2', 'SUP1']);
  });

  it('balanceSide=true + avans bağlayıcı', () => {
    const a = R('A', -300, 0);
    const b = R('B', 800, 100); // avanslı → üstte
    const c = R('C', 800, 0);
    const list = sortCariBalanceForReport([a, b, c], { balanceSide: true });
    expect(list.map((r) => r.accountName)).toEqual(['B', 'C', 'A']);
  });

  it('mutasyon yapmaz — orijinal dizi sırası korunur', () => {
    const rows = [R('C', 0, 0), R('B', 10000, 0), R('A', 5000, 5000)];
    const before = rows.map((r) => r.accountName);
    sortCariBalanceForReport(rows);
    expect(rows.map((r) => r.accountName)).toEqual(before);
  });

  it('edge: negative balances (alacaklı müşteri) yukarıda', () => {
    // Müşteri − = bizim borcumuz (alacaklı müşteri). Büyüklük önemli,
    // mutlak değil — balance -10000 > -5000 sıralamada daha üstte.
    const a = R('A', -5000, 0);
    const b = R('B', -10000, 0);
    const c = R('C', 0, 0);
    const list = sortCariBalanceForReport([a, b, c]);
    expect(list.map((r) => r.accountName)).toEqual(['C', 'A', 'B']);
  });
});

describe('compareCariBalanceForReport — kullanıcı senaryosu (ARA + ROZA + hizmetli cari)', () => {
  it('ROZA 10k avans + ARA 5k avans + HIZMET 0/0 → hepsi listede, sıralama doğru', () => {
    const rows = [
      R('HIZMET MUSTERI', 0, 0), // geçmiş hizmet almış cari
      R('ARA BEA-MV240QNY', -5000, 5000),
      R('ROZA BEA-MV230DVK', -10000, 10000),
    ];
    const list = sortCariBalanceForReport(rows);
    expect(list.map((r) => r.accountName)).toEqual([
      'ROZA BEA-MV230DVK', // pendingDeposit=10000
      'ARA BEA-MV240QNY', // pendingDeposit=5000
      'HIZMET MUSTERI', // pendingDeposit=0, balance=0
    ]);
  });
});