import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
    COLUMN_SNAPSHOT_HISTORY_LIMIT,
    clearColumnSnapshotHistory,
    getColumnSnapshotHistory,
    loadColumnOrderFromStorage,
    loadColumnSizingFromStorage,
    restoreColumnSnapshotFromHistory,
    saveColumnOrderToStorage,
    saveColumnSizingToStorage,
    saveColumnSnapshotWithHistory,
} from '../../components/shared/DevExDataGrid';

/**
 * Rapor kolon snapshot geçmişi — kullanıcı kolonları değiştirdiğinde
 * eski snapshot'lar silinmesin, etiketli/geçmişli olarak saklansın.
 *
 * Kök neden: `saveColumnOrderToStorage` / `saveColumnSizingToStorage`
 * doğrudan localStorage anahtarına `setItem` ile üzerine yazıyordu;
 * kolon sırası veya genişlik değişince eski düzen geri alınamaz hale
 * geliyordu. Bu testler snapshot versiyonlama kapsamını garanti eder.
 */
describe('columnSnapshotHistory — rapor kolon düzeni snapshot geçmişi', () => {
    const KEY = 'retailex_colOrder_v1_test-snapshot';
    const HISTORY_KEY = `${KEY}:history`;

    beforeEach(() => {
        localStorage.removeItem(KEY);
        localStorage.removeItem(HISTORY_KEY);
    });

    afterEach(() => {
        localStorage.removeItem(KEY);
        localStorage.removeItem(HISTORY_KEY);
    });

    it('save: aktif snapshot yazılır, history ilk yazımda oluşmaz', () => {
        saveColumnOrderToStorage(KEY, ['a', 'b', 'c']);
        expect(localStorage.getItem(KEY)).toBe(JSON.stringify(['a', 'b', 'c']));
        // İlk yazım — önceki aktif olmadığı için history boş kalmalı
        expect(getColumnSnapshotHistory(KEY)).toEqual([]);
    });

    it('save: ikinci farklı snapshot önceki aktifi history\'ye iter', () => {
        saveColumnOrderToStorage(KEY, ['a', 'b', 'c']);
        saveColumnOrderToStorage(KEY, ['c', 'b', 'a']);

        expect(localStorage.getItem(KEY)).toBe(JSON.stringify(['c', 'b', 'a']));
        const history = getColumnSnapshotHistory<string[]>(KEY);
        expect(history).toHaveLength(1);
        expect(history[0].snapshot).toEqual(['a', 'b', 'c']);
        expect(typeof history[0].timestamp).toBe('string');
        // ISO 8601 benzeri
        expect(new Date(history[0].timestamp).toString()).not.toBe('Invalid Date');
    });

    it('save: aynı içerik tekrar yazılırsa history şişmez', () => {
        saveColumnOrderToStorage(KEY, ['a', 'b', 'c']);
        saveColumnOrderToStorage(KEY, ['a', 'b', 'c']);
        saveColumnOrderToStorage(KEY, ['a', 'b', 'c']);
        expect(getColumnSnapshotHistory(KEY)).toEqual([]);
    });

    it('save: history maksimum 10 snapshot ile sınırlıdır', () => {
        // 13 farklı yazımda (i=0..12): aktif=v12, history 10 ile sınırlı
        // En eski eleman (history sonu) → v2 olmalı (v0 ve v1 atılmış)
        for (let i = 0; i <= 12; i++) {
            saveColumnOrderToStorage(KEY, [`v${i}`, 'b', 'c']);
        }
        const history = getColumnSnapshotHistory<string[]>(KEY);
        expect(history).toHaveLength(COLUMN_SNAPSHOT_HISTORY_LIMIT);
        // En yeni aktif → en son yazılan 'v12' olmalı
        expect(localStorage.getItem(KEY)).toBe(JSON.stringify(['v12', 'b', 'c']));
        // History başı (en yeni eski) → v11 olmalı
        expect(history[0].snapshot).toEqual(['v11', 'b', 'c']);
        // History sonu (en eski hâlâ tutulan) → v2 olmalı (v0 + v1 atıldı)
        const last = history[history.length - 1];
        expect(last.snapshot).toEqual(['v2', 'b', 'c']);
    });

    it('save: snapshot\'lar history içinde kronolojik ters sırada tutulur (en yeni başta)', () => {
        saveColumnOrderToStorage(KEY, ['v0']);
        saveColumnOrderToStorage(KEY, ['v1']);
        saveColumnOrderToStorage(KEY, ['v2']);
        const history = getColumnSnapshotHistory<string[]>(KEY);
        expect(history.map((h) => h.snapshot[0])).toEqual(['v1', 'v0']);
    });

    it('load: aktif snapshot (geriye dönük uyum) doğru döner', () => {
        saveColumnOrderToStorage(KEY, ['a', 'b', 'c']);
        expect(loadColumnOrderFromStorage(KEY)).toEqual(['a', 'b', 'c']);

        saveColumnOrderToStorage(KEY, ['c', 'a', 'b']);
        expect(loadColumnOrderFromStorage(KEY)).toEqual(['c', 'a', 'b']);
    });

    it('restore: history snapshot aktif anahtara geri yüklenir', () => {
        saveColumnOrderToStorage(KEY, ['v0']);
        saveColumnOrderToStorage(KEY, ['v1']);
        saveColumnOrderToStorage(KEY, ['v2']);
        // history: [v1, v0] (ters kronolojik) → index 0 = v1
        expect(restoreColumnSnapshotFromHistory(KEY, 0)).toBe(true);
        expect(loadColumnOrderFromStorage(KEY)).toEqual(['v1']);
    });

    it('restore: geçersiz index false döner, aktif snapshot bozulmaz', () => {
        saveColumnOrderToStorage(KEY, ['a']);
        saveColumnOrderToStorage(KEY, ['b']);
        const activeBefore = loadColumnOrderFromStorage(KEY);
        expect(restoreColumnSnapshotFromHistory(KEY, 99)).toBe(false);
        expect(loadColumnOrderFromStorage(KEY)).toEqual(activeBefore);
    });

    it('restore: history boşken false döner', () => {
        expect(restoreColumnSnapshotFromHistory(KEY, 0)).toBe(false);
    });

    it('clear: history silinir, aktif snapshot korunur', () => {
        saveColumnOrderToStorage(KEY, ['v0']);
        saveColumnOrderToStorage(KEY, ['v1']);
        clearColumnSnapshotHistory(KEY);
        expect(getColumnSnapshotHistory(KEY)).toEqual([]);
        // Aktif snapshot hâlâ 'v1'
        expect(loadColumnOrderFromStorage(KEY)).toEqual(['v1']);
    });

    it('kolon genişliği snapshot\'ları da aynı mekanizmayı kullanır', () => {
        const SIZE_KEY = 'retailex_colSize_v1_test-snapshot';
        const SIZE_HISTORY_KEY = `${SIZE_KEY}:history`;
        localStorage.removeItem(SIZE_KEY);
        localStorage.removeItem(SIZE_HISTORY_KEY);

        saveColumnSizingToStorage(SIZE_KEY, { a: 120, b: 200 });
        saveColumnSizingToStorage(SIZE_KEY, { a: 150, b: 200 });

        // Aktif 'a': 150
        expect(loadColumnSizingFromStorage(SIZE_KEY)).toEqual({ a: 150, b: 200 });
        const history = getColumnSnapshotHistory<Record<string, number>>(SIZE_KEY);
        expect(history).toHaveLength(1);
        expect(history[0].snapshot).toEqual({ a: 120, b: 200 });

        localStorage.removeItem(SIZE_KEY);
        localStorage.removeItem(SIZE_HISTORY_KEY);
    });

    it('saveColumnSnapshotWithHistory: SSR / window yok ortamında sessizce atlar', () => {
        // Window yokken hata fırlatmamalı — anahtarın boş / undefined olduğu
        // durumlarda da aynı şekilde geçmeli.
        expect(() => saveColumnSnapshotWithHistory('', { x: 1 })).not.toThrow();
        expect(() => saveColumnSnapshotWithHistory('any', undefined)).not.toThrow();
        // Yanlış JSON aktif snapshot → history kirletmeden yeni yazılır
        localStorage.setItem(KEY, '{not json');
        expect(() => saveColumnOrderToStorage(KEY, ['ok', '2'])).not.toThrow();
        expect(loadColumnOrderFromStorage(KEY)).toEqual(['ok', '2']);
        // Yanlış JSON history → okuma tarafı hata fırlatmaz
        localStorage.setItem(HISTORY_KEY, '{not json');
        expect(getColumnSnapshotHistory(KEY)).toEqual([]);
        localStorage.removeItem(KEY);
        localStorage.removeItem(HISTORY_KEY);
    });

    it('save: bozuk (non-JSON) aktif snapshot varsa history kirletilmeden yazılır', () => {
        localStorage.setItem(KEY, '<<not-json>>');
        saveColumnOrderToStorage(KEY, ['clean', 'a', 'b']);
        expect(loadColumnOrderFromStorage(KEY)).toEqual(['clean', 'a', 'b']);
        // Bozuk parse → history yazılmaz, sessizce geçilir
        expect(getColumnSnapshotHistory(KEY)).toEqual([]);
    });

    it('save: history anahtarı ayrı olur; aktif anahtar mevcut okuyucu fonksiyonlarla uyumlu kalır', () => {
        saveColumnOrderToStorage(KEY, ['x']);
        saveColumnOrderToStorage(KEY, ['y']);
        // Mevcut API loadColumnOrderFromStorage hâlâ çalışmalı
        expect(loadColumnOrderFromStorage(KEY)).toEqual(['y']);
        // Yeni history anahtarı ayrı yaşamalı
        expect(localStorage.getItem(HISTORY_KEY)).toBeTruthy();
    });
});
