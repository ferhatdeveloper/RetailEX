/**
 * Etiket slot → Rongta LabelId — TeraziRongta `LabelSlotHelper` portu.
 * SYSTEM.CFG / .scr indirme Windows DLL gerektirir; LabelId PLU senkronunda kullanılır.
 */

export const LABEL_SLOTS = ['D0', 'D1', 'C0', 'C1', 'B0', 'B1', 'A0', 'A1'] as const;
export type LabelSlot = (typeof LABEL_SLOTS)[number];

export function resolveLabelId(slot: string): number {
  switch ((slot ?? 'D0').trim().toLocaleUpperCase('en-US')) {
    case 'A0':
      return 1;
    case 'A1':
      return 2;
    case 'B0':
      return 4;
    case 'B1':
      return 8;
    case 'C0':
      return 16;
    case 'C1':
      return 32;
    case 'D1':
      return 128;
    case 'D0':
    default:
      return 64;
  }
}

export function resolveFunctionLabelType(slot: string): number {
  switch ((slot ?? 'D0').trim().toLocaleUpperCase('en-US')) {
    case 'A0':
      return 0;
    case 'A1':
      return 1;
    case 'B0':
      return 2;
    case 'B1':
      return 3;
    case 'C0':
      return 4;
    case 'C1':
      return 5;
    case 'D1':
      return 7;
    case 'D0':
    default:
      return 6;
  }
}

/** SYSTEM.CFG / RLS / .scr — RN'de native DLL yok; Windows TeraziRongta yolu. */
export function labelTemplateTransportHint(): string {
  return (
    'Etiket .scr / SYSTEM.CFG / RLS function-set gönderimi Windows TeraziRongta ' +
    '(rtslabelscale.dll · rtscaleDownLoadData) ile yapılır. Mobilde slot (LabelId) PLU senkronuna ' +
    'yazılır; dosya indirme masaüstü uygulamasından yapılmalıdır.'
  );
}
