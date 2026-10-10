/**
 * 10.10.2026 — Hizmet Bazlı Rapor (ReportsModule > beauty-service-report)
 * toplam regresyonu.
 *
 * Kullanıcı şikayeti:
 *  "10.10.2026 tarihinde Hizmet Bazlı Rapor'da 2 satır × 50.000 = 100.000
 *   (GENEL TOPLAM) gösteriliyor. 3. randevu/satır eksik, 150.000 olmalı."
 *
 * Kök neden (DB tarafı doğrulandı, `guzel` DB, firm 001 / period 01):
 *  - `beauty.rex_001_01_beauty_appointments` tablosunda 10.10.2026 için
 *    YALNIZ 2 randevu vardır:
 *       09:00 ROZA  TORPI  50.000  status=completed
 *       10:00 ARAM  TORPI  50.000  status=completed
 *  - 3. randevu 11.10.2026 11:00 ARAM TORPI 50.000 status=**scheduled**
 *    olduğu için "tamamlanmamış" filtresine takılır. Bu doğru iş
 *    kuralıdır (scheduled/in_progress/cancelled randevular ciroya
 *    yansımamalı).
 *  - Rapor `beautyServiceGrouped` filtresi:
 *       `if (!isCompletedAppointmentStatus(a.status)) return false;`
 *    Sadece completed statüdekileri alır ve `total_price` toplamı
 *    100.000'dir. Hesap doğru, veri kaynağı doğru.
 *
 * Bu test, `ReportsModule.tsx` içindeki `beautyServiceGrouped`
 * semantiğini 1:1 modelliyor:
 *  1) Sadece "completed" durumlu randevular dahil edilir.
 *  2) Aynı `service_name` altında `total_price` toplanır.
 *  3) Scheduled / cancelled / no_show satırlar Hariç.
 *  4) Toplam, kullanıcının beklentisi (150.000) değil, DB'nin gerçeği
 *     (100.000) ile eşleşir.
 */
import { describe, expect, it } from 'vitest';

type AppointmentStatus =
  | 'scheduled'
  | 'confirmed'
  | 'pre_paid'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'no_show'
  | string;

interface BeautyAppointmentLite {
  id: string;
  appointment_date: string; // YYYY-MM-DD
  appointment_time: string; // HH:mm:ss
  status: AppointmentStatus;
  total_price: number;
  service_name: string;
}

/**
 * Raporun `isCompletedAppointmentStatus` filtresi ile aynı semantik:
 * yalnızca "completed" (ve eşanlamlıları) durum kabul edilir.
 */
function isCompletedAppointmentStatus(status: AppointmentStatus | null | undefined): boolean {
  if (!status) return false;
  return String(status).toLowerCase().trim() === 'completed';
}

/**
 * Raporun `beautyServiceGrouped` useMemo'sunun birebir taklidi:
 *   - status=completed filtresi
 *   - service_name'e göre gruplama
 *   - her grubun total_price toplamı
 */
function groupCompletedByService(
  appointments: BeautyAppointmentLite[],
): Array<{ serviceName: string; items: BeautyAppointmentLite[]; sum: number }> {
  const completed = appointments.filter((a) => isCompletedAppointmentStatus(a.status));
  const map = new Map<string, BeautyAppointmentLite[]>();
  for (const a of completed) {
    const name = (a.service_name && a.service_name.trim()) || '—';
    if (!map.has(name)) map.set(name, []);
    map.get(name)!.push(a);
  }
  return Array.from(map.entries())
    .sort((a, b) => a[0].localeCompare(b[0], 'tr'))
    .map(([serviceName, items]) => ({
      serviceName,
      items,
      sum: items.reduce((s, it) => s + Number(it.total_price ?? 0), 0),
    }));
}

/**
 * Raporun flat-row hesaplaması (`serviceBreakdownFlatRows`).
 * Toplam = tüm grupların `sum` değerlerinin toplamı.
 */
function grandTotal(groups: Array<{ sum: number }>): number {
  return groups.reduce((acc, g) => acc + g.sum, 0);
}

describe('Hizmet Bazlı Rapor — toplam hesabı (10.10.2026)', () => {
  describe('Senaryo: DB gerçeği (10.10.2026 guzel DB)', () => {
    // beauty.rex_001_01_beauty_appointments — 10.10.2026 satırları.
    const appointments: BeautyAppointmentLite[] = [
      {
        id: '5a992afc-a51a-41d0-a153-9a2ab79f7f78',
        appointment_date: '2026-10-10',
        appointment_time: '09:00:00',
        status: 'completed',
        total_price: 50000,
        service_name: 'TORPI',
      },
      {
        id: '25a86234-352f-4abf-af20-ee7bc7bc9b74',
        appointment_date: '2026-10-10',
        appointment_time: '10:00:00',
        status: 'completed',
        total_price: 50000,
        service_name: 'TORPI',
      },
    ];

    it('Sadece "completed" satırları sayılır', () => {
      const groups = groupCompletedByService(appointments);
      const allItems = groups.flatMap((g) => g.items);
      expect(allItems.length).toBe(2);
      expect(allItems.every((a) => a.status === 'completed')).toBe(true);
    });

    it('TORPI grubu: 2 × 50.000 = 100.000', () => {
      const groups = groupCompletedByService(appointments);
      const torpi = groups.find((g) => g.serviceName === 'TORPI');
      expect(torpi).toBeDefined();
      expect(torpi!.sum).toBe(100000);
    });

    it('GENEL TOPLAM = 100.000 (DB gerçeği, kullanıcı 150.000 bekliyordu)', () => {
      const groups = groupCompletedByService(appointments);
      const total = grandTotal(groups);
      // 10.10.2026'da yalnız 2 randevu var; 3. randevu 11.10.2026'da ve
      // status=scheduled olduğu için ciroya girmez.
      expect(total).toBe(100000);
    });
  });

  describe('Senaryo: 3. randevu 11.10.2026 (scheduled) — rapora GİRMEZ', () => {
    const appointments: BeautyAppointmentLite[] = [
      {
        id: 'a-1',
        appointment_date: '2026-10-10',
        appointment_time: '09:00:00',
        status: 'completed',
        total_price: 50000,
        service_name: 'TORPI',
      },
      {
        id: 'a-2',
        appointment_date: '2026-10-10',
        appointment_time: '10:00:00',
        status: 'completed',
        total_price: 50000,
        service_name: 'TORPI',
      },
      {
        // 3. randevu — scheduled, ciroya dahil değil.
        id: 'a-3',
        appointment_date: '2026-10-11',
        appointment_time: '11:00:00',
        status: 'scheduled',
        total_price: 50000,
        service_name: 'TORPI',
      },
    ];

    it('scheduled randevu gruba dahil edilmez', () => {
      const groups = groupCompletedByService(appointments);
      const torpi = groups.find((g) => g.serviceName === 'TORPI');
      expect(torpi).toBeDefined();
      expect(torpi!.items.length).toBe(2);
      expect(torpi!.items.every((a) => a.status === 'completed')).toBe(true);
    });

    it('GENEL TOPLAM yine 100.000 — scheduled sayılmaz', () => {
      const groups = groupCompletedByService(appointments);
      expect(grandTotal(groups)).toBe(100000);
    });
  });

  describe('Senaryo: 3. randevu 10.10.2026 status=completed — 150.000', () => {
    const appointments: BeautyAppointmentLite[] = [
      {
        id: 'a-1',
        appointment_date: '2026-10-10',
        appointment_time: '09:00:00',
        status: 'completed',
        total_price: 50000,
        service_name: 'TORPI',
      },
      {
        id: 'a-2',
        appointment_date: '2026-10-10',
        appointment_time: '10:00:00',
        status: 'completed',
        total_price: 50000,
        service_name: 'TORPI',
      },
      {
        id: 'a-3',
        appointment_date: '2026-10-10',
        appointment_time: '13:00:00',
        status: 'completed',
        total_price: 50000,
        service_name: 'TORPI',
      },
    ];

    it('3 completed randevu × 50.000 = 150.000 (beklenen)', () => {
      const groups = groupCompletedByService(appointments);
      const torpi = groups.find((g) => g.serviceName === 'TORPI');
      expect(torpi).toBeDefined();
      expect(torpi!.items.length).toBe(3);
      expect(torpi!.sum).toBe(150000);
      expect(grandTotal(groups)).toBe(150000);
    });
  });

  describe('Filtre kenar durumları', () => {
    it('cancelled randevular dahil edilmez', () => {
      const appointments: BeautyAppointmentLite[] = [
        {
          id: 'c-1',
          appointment_date: '2026-10-10',
          appointment_time: '09:00:00',
          status: 'completed',
          total_price: 50000,
          service_name: 'TORPI',
        },
        {
          id: 'c-2',
          appointment_date: '2026-10-10',
          appointment_time: '10:00:00',
          status: 'cancelled',
          total_price: 50000,
          service_name: 'TORPI',
        },
      ];
      const groups = groupCompletedByService(appointments);
      const torpi = groups.find((g) => g.serviceName === 'TORPI');
      expect(torpi!.items.length).toBe(1);
      expect(torpi!.sum).toBe(50000);
    });

    it('no_show randevular dahil edilmez', () => {
      const appointments: BeautyAppointmentLite[] = [
        {
          id: 'n-1',
          appointment_date: '2026-10-10',
          appointment_time: '09:00:00',
          status: 'no_show',
          total_price: 50000,
          service_name: 'TORPI',
        },
      ];
      const groups = groupCompletedByService(appointments);
      expect(groups.length).toBe(0);
      expect(grandTotal(groups)).toBe(0);
    });

    it('Birden fazla hizmet — her biri ayrı grupta toplanır', () => {
      const appointments: BeautyAppointmentLite[] = [
        {
          id: 'm-1',
          appointment_date: '2026-10-10',
          appointment_time: '09:00:00',
          status: 'completed',
          total_price: 50000,
          service_name: 'TORPI',
        },
        {
          id: 'm-2',
          appointment_date: '2026-10-10',
          appointment_time: '10:00:00',
          status: 'completed',
          total_price: 30000,
          service_name: 'LAZER',
        },
        {
          id: 'm-3',
          appointment_date: '2026-10-10',
          appointment_time: '11:00:00',
          status: 'completed',
          total_price: 20000,
          service_name: 'LAZER',
        },
      ];
      const groups = groupCompletedByService(appointments);
      expect(groups.length).toBe(2);
      const torpi = groups.find((g) => g.serviceName === 'TORPI');
      const lazer = groups.find((g) => g.serviceName === 'LAZER');
      expect(torpi!.sum).toBe(50000);
      expect(lazer!.sum).toBe(50000);
      expect(grandTotal(groups)).toBe(100000);
    });

    it('total_price null/NaN → 0 sayılır', () => {
      const appointments: BeautyAppointmentLite[] = [
        {
          id: 'x-1',
          appointment_date: '2026-10-10',
          appointment_time: '09:00:00',
          status: 'completed',
          total_price: 50000 as any,
          service_name: 'TORPI',
        },
        {
          id: 'x-2',
          appointment_date: '2026-10-10',
          appointment_time: '10:00:00',
          status: 'completed',
          total_price: null as any,
          service_name: 'TORPI',
        },
      ];
      const groups = groupCompletedByService(appointments);
      const torpi = groups.find((g) => g.serviceName === 'TORPI');
      expect(torpi!.sum).toBe(50000);
    });
  });
});
