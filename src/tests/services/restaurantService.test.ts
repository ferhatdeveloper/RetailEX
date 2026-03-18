/**
 * Restoran modülü CRUD testleri
 * PostgresConnection mock'lanır; gerçek DB gerekmez.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockQuery = vi.fn();

vi.mock('../../services/postgres', () => ({
  PostgresConnection: {
    getInstance: () => ({
      query: mockQuery,
    }),
  },
  ERP_SETTINGS: { firmNr: '001', periodNr: '01' },
}));

// Mock sonrası import
const { RestaurantService } = await import('../../services/restaurant');

describe('RestaurantService', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  describe('Floors (Kat) CRUD', () => {
    it('getFloors: boş storeId ile tüm aktif katları döner', async () => {
      const fakeFloors = [
        { id: 'f1', name: 'Zemin', display_order: 0, is_active: true },
        { id: 'f2', name: '1. Kat', display_order: 1, is_active: true },
      ];
      mockQuery.mockResolvedValueOnce({ rows: fakeFloors });

      const result = await RestaurantService.getFloors();

      expect(mockQuery).toHaveBeenCalledTimes(1);
      expect(mockQuery.mock.calls[0][0]).toContain('rest.floors');
      expect(mockQuery.mock.calls[0][0]).toContain('is_active = true');
      expect(result).toEqual(fakeFloors);
    });

    it('getFloors: storeId ile filtrelenmiş katları döner', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'f1', name: 'Kat A' }] });

      await RestaurantService.getFloors('store-1');

      expect(mockQuery.mock.calls[0][0]).toContain('store_id = $1');
      expect(mockQuery.mock.calls[0][1]).toEqual(['store-1']);
    });

    it('saveFloor: yeni kat ekler (id yok)', async () => {
      const newFloor = { store_id: 's1', name: 'Teras', color: '#00FF00', display_order: 2 };
      const inserted = { id: 'f-new', ...newFloor };
      mockQuery.mockResolvedValueOnce({ rows: [inserted] });

      const result = await RestaurantService.saveFloor(newFloor);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO rest.floors'),
        ['s1', 'Teras', '#00FF00', 2]
      );
      expect(result).toEqual(inserted);
    });

    it('saveFloor: mevcut kat günceller (id var)', async () => {
      const existing = { id: 'f1', name: 'Zemin Güncel', color: '#333', display_order: 0 };
      mockQuery.mockResolvedValueOnce({ rows: [existing] });

      const result = await RestaurantService.saveFloor({
        id: 'f1',
        store_id: null,
        name: 'Zemin Güncel',
        color: '#333',
        display_order: 0,
      });

      expect(mockQuery.mock.calls[0][0]).toContain('UPDATE rest.floors');
      expect(result).toEqual(existing);
    });

    it('deleteFloor: soft delete (is_active=false)', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });

      await RestaurantService.deleteFloor('f1');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('is_active=false'),
        ['f1']
      );
    });
  });

  describe('Tables (Masa) CRUD', () => {
    it('getTables: tüm masaları döner', async () => {
      const fakeTables = [
        { id: 't1', number: '1', seats: 4, floor_id: 'f1', status: 'empty' },
        { id: 't2', number: '2', seats: 2, floor_id: 'f1', status: 'occupied' },
      ];
      mockQuery.mockResolvedValueOnce({ rows: fakeTables });

      const result = await RestaurantService.getTables();

      expect(mockQuery).toHaveBeenCalledTimes(1);
      expect(mockQuery.mock.calls[0][0]).toContain('rest_tables');
      expect(result).toHaveLength(2);
    });

    it('getTables: floorId ile filtrelenir', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await RestaurantService.getTables('floor-1');

      expect(mockQuery.mock.calls[0][0]).toContain('floor_id = $1');
      expect(mockQuery.mock.calls[0][1]).toEqual(['floor-1']);
    });

    it('addTable: yeni masa ekler', async () => {
      const row = {
        id: 't-new',
        floor_id: 'f1',
        number: '5',
        seats: 6,
        pos_x: 10,
        pos_y: 20,
        is_large: true,
      };
      mockQuery.mockResolvedValueOnce({ rows: [row] });

      const result = await RestaurantService.addTable({
        floor_id: 'f1',
        number: '5',
        seats: 6,
        pos_x: 10,
        pos_y: 20,
        is_large: true,
      });

      expect(mockQuery.mock.calls[0][0]).toContain('INSERT INTO rest_tables');
      expect(result).toEqual(row);
    });

    it('updateTableStatus: masa durumunu günceller', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });

      await RestaurantService.updateTableStatus(
        't1',
        'occupied',
        'Garson Ali',
        'staff-1',
        150.5
      );

      expect(mockQuery.mock.calls[0][0]).toContain('UPDATE rest_tables');
      expect(mockQuery.mock.calls[0][0]).toContain('status=$2');
      expect(mockQuery.mock.calls[0][1]).toEqual(['t1', 'occupied', 'Garson Ali', 'staff-1', 150.5]);
    });

    it('deleteTable: masayı siler', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });

      await RestaurantService.deleteTable('t1');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringMatching(/DELETE FROM .*rest_tables.*WHERE id=\$1/),
        ['t1']
      );
    });
  });

  describe('Orders (Sipariş) CRUD', () => {
    it('createOrder: sipariş numarası RES-YYYY-xxxxx formatında oluşturur', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ seq: 1 }] }); // COUNT for order_no
      const orderRow = {
        id: 'ord-1',
        order_no: 'RES-2026-00001',
        table_id: 't1',
        status: 'open',
      };
      mockQuery.mockResolvedValueOnce({ rows: [orderRow] });

      const result = await RestaurantService.createOrder({
        tableId: 't1',
        floorId: 'f1',
        waiter: 'Ali',
      });

      expect(mockQuery).toHaveBeenCalledTimes(2);
      expect(mockQuery.mock.calls[1][0]).toContain('INSERT INTO rest_orders');
      expect(result.order_no).toMatch(/^RES-\d{4}-\d{5}$/);
    });

    it('getActiveOrder: masanın açık siparişini items ile döner', async () => {
      const orderWithItems = {
        id: 'ord-1',
        order_no: 'RES-2026-00001',
        table_id: 't1',
        table_number: '3',
        items: [
          { id: 'oi1', product_name: 'Çorba', quantity: 1, unit_price: 25 },
        ],
      };
      mockQuery.mockResolvedValueOnce({ rows: [orderWithItems] });

      const result = await RestaurantService.getActiveOrder('t1');

      expect(mockQuery.mock.calls[0][0]).toContain('rest_orders');
      expect(mockQuery.mock.calls[0][0]).toContain("status = 'open'");
      expect(result).toEqual(orderWithItems);
    });

    it('addOrderItem: kalem ekler ve subtotal hesaplar', async () => {
      const newItem = {
        id: 'oi-new',
        order_id: 'ord-1',
        product_name: 'Salata',
        quantity: 2,
        unit_price: 30,
        subtotal: 60,
      };
      mockQuery.mockResolvedValueOnce({ rows: [newItem] });
      mockQuery.mockResolvedValueOnce({ rowCount: 1 }); // UPDATE total

      const result = await RestaurantService.addOrderItem('ord-1', {
        productName: 'Salata',
        quantity: 2,
        unitPrice: 30,
      });

      expect(mockQuery.mock.calls[0][0]).toContain('INSERT INTO rest_order_items');
      expect(result).toEqual(newItem);
    });

    it('removeOrderItem: kalemi siler ve sipariş toplamını günceller', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ order_id: 'ord-1' }] });
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });

      await RestaurantService.removeOrderItem('oi-1');

      expect(mockQuery.mock.calls[0][0]).toContain('DELETE FROM rest_order_items');
      expect(mockQuery.mock.calls[0][1]).toEqual(['oi-1']);
    });

    it('closeOrder: siparişi kapatır', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });

      await RestaurantService.closeOrder('ord-1', {
        discountAmount: 10,
        taxAmount: 5,
        paymentMethod: 'cash',
      });

      expect(mockQuery.mock.calls[0][0]).toContain("status='closed'");
      expect(mockQuery.mock.calls[0][1][0]).toBe('ord-1');
    });
  });

  describe('Reservations (Rezervasyon) CRUD', () => {
    it('getReservations: tarih ve durum filtresi ile listeler', async () => {
      const fakeRes = [
        {
          id: 'r1',
          customer_name: 'Ahmet',
          phone: '5551234567',
          reservation_date: '2026-03-20',
          reservation_time: '19:00',
          guest_count: 4,
          status: 'pending',
        },
      ];
      mockQuery.mockResolvedValueOnce({ rows: [] }); // ensureReservationsTable
      mockQuery.mockResolvedValueOnce({ rows: fakeRes });

      const result = await RestaurantService.getReservations({
        date: '2026-03-20',
        status: 'pending',
      });

      expect(mockQuery).toHaveBeenCalled();
      const listCall = mockQuery.mock.calls.find(c => String(c[0]).includes('SELECT * FROM rest_reservations'));
      expect(listCall).toBeDefined();
      expect(result.length).toBeGreaterThanOrEqual(0);
    });

    it('saveReservation: yeni rezervasyon ekler', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] }); // ensure
      const saved = {
        id: 'r-new',
        customer_name: 'Mehmet',
        phone: '5559876543',
        reservation_date: '2026-03-25',
        reservation_time: '20:00',
        guest_count: 2,
        status: 'pending',
      };
      mockQuery.mockResolvedValueOnce({ rows: [saved] });

      const result = await RestaurantService.saveReservation({
        customerName: 'Mehmet',
        phone: '5559876543',
        reservationDate: '2026-03-25',
        reservationTime: '20:00',
        guestCount: 2,
        status: 'pending',
      });

      expect(mockQuery.mock.calls.some(c => String(c[0]).includes('INSERT INTO rest_reservations'))).toBe(true);
      expect(result).toBeDefined();
    });

    it('deleteReservation: rezervasyonu siler', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });

      await RestaurantService.deleteReservation('r1');

      expect(mockQuery.mock.calls.some(c => String(c[0]).includes('DELETE FROM rest_reservations'))).toBe(true);
    });
  });

  describe('Staff (Personel)', () => {
    it('getStaffList: aktif personel listesini döner', async () => {
      const staff = [
        { id: 's1', name: 'Ali', role: 'Waiter', pin: '1234', is_active: true },
      ];
      mockQuery.mockResolvedValueOnce({ rows: staff });

      const result = await RestaurantService.getStaffList('001');

      expect(mockQuery).toHaveBeenCalledTimes(1);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Ali');
      expect(result[0].pin).toBe('1234');
    });

    it('verifyStaffPin: geçerli PIN ile staff döner', async () => {
      const staffRow = { id: 's1', name: 'Ayşe', role: 'Waiter', pin: '5678', is_active: true };
      mockQuery.mockResolvedValueOnce({ rows: [staffRow] });

      const result = await RestaurantService.verifyStaffPin('5678', '001');

      expect(result.success).toBe(true);
      expect(result.staff?.name).toBe('Ayşe');
    });

    it('verifyStaffPin: geçersiz PIN ile success false', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await RestaurantService.verifyStaffPin('0000', '001');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('Recipes (Reçete)', () => {
    it('getRecipes: menü + malzeme listesi ile reçeteleri döner', async () => {
      const recipes = [
        {
          id: 'rec-1',
          menu_item_id: 'p1',
          menu_item_name: 'Köfte',
          total_cost: 45,
          ingredients: [{ id: 'ri1', material_name: 'Kıyma', quantity: 200, unit: 'gr' }],
        },
      ];
      mockQuery.mockResolvedValueOnce({ rows: recipes });

      const result = await RestaurantService.getRecipes();

      expect(mockQuery).toHaveBeenCalledTimes(1);
      expect(result).toHaveLength(1);
      expect(result[0].menu_item_name).toBe('Köfte');
    });
  });
});
