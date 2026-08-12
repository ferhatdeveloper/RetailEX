/**
 * Hotkey tablosu — TeraziRongta `HotkeyHelper` portu.
 * Gönderim Windows DLL (`rtscaleDownLoadHotkey`) veya Android `lib_plu.writeHotkey` ister;
 * açık TCP ASCII protokolünde hotkey komutu yok.
 */

export const HOTKEY_TOTAL = 224;
export const HOTKEY_PACK_SIZE = 84;

export function buildHotkeyTables(lfCodes: number[]): number[][] {
  const table = new Array<number>(HOTKEY_TOTAL).fill(0);
  for (let i = 0; i < HOTKEY_TOTAL; i++) {
    table[i] = i < lfCodes.length ? (lfCodes[i] ?? 0) : 0;
  }
  return [
    table.slice(0, HOTKEY_PACK_SIZE),
    table.slice(HOTKEY_PACK_SIZE, HOTKEY_PACK_SIZE * 2),
    table.slice(HOTKEY_PACK_SIZE * 2, HOTKEY_TOTAL),
  ];
}

export function buildDemoHotkeyTables(baseLfCode = 10001): number[][] {
  const lfCodes: number[] = [];
  for (let i = 0; i < HOTKEY_TOTAL; i++) lfCodes.push(baseLfCode + i);
  return buildHotkeyTables(lfCodes);
}

export function hotkeyTransportHint(): string {
  return (
    'Hotkey tablosu (224 tuş, 3 paket) hazırlanır; gönderim için Windows TeraziRongta DLL ' +
    'veya Android lib_plu.writeHotkey gerekir. Açık Rongta TCP ASCII protokolünde hotkey komutu yoktur.'
  );
}
