import { describe, it, expect } from 'vitest';
import { isBarcodeReadyForAutoSubmit } from '../../utils/barcodeScannerInput';

describe('barcodeScannerInput', () => {
  it('11–16 hane tartı barkodu otomatik gönderime hazır', () => {
    expect(isBarcodeReadyForAutoSubmit('1000000009161')).toBe(true);
    expect(isBarcodeReadyForAutoSubmit('10000000091610')).toBe(true);
  });

  it('EAN-13 hazır', () => {
    expect(isBarcodeReadyForAutoSubmit('2700001013000')).toBe(true);
  });

  it('eksik veya harfli barkod hazır değil', () => {
    expect(isBarcodeReadyForAutoSubmit('1000000009')).toBe(false);
    expect(isBarcodeReadyForAutoSubmit('ABC')).toBe(false);
  });
});
