import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  RECEIPT_PRINT_AFTERPRINT_MIN_MS,
  RECEIPT_PRINT_IMAGE_WAIT_MS,
  RECEIPT_PRINT_LOCK_RELEASE_MS,
  isReceiptPrintInFlight,
  printReceiptDocument,
  resetReceiptPrintDialogForTests,
} from '../../utils/receiptPrintDialog';

const SLIP_HTML =
  '<!DOCTYPE html><html><head><style>@page { size: 80mm auto; margin: 0; }</style></head><body><img src="logo.png" alt=""></body></html>';

function frames(): HTMLIFrameElement[] {
  return Array.from(document.querySelectorAll('iframe[data-rx-print-frame]')) as HTMLIFrameElement[];
}

function arm(iframe: HTMLIFrameElement) {
  const win = iframe.contentWindow as Window & { print: ReturnType<typeof vi.fn> };
  const print = vi.fn();
  win.print = print;
  win.focus = vi.fn();
  return print;
}

afterEach(() => {
  vi.useRealTimers();
  resetReceiptPrintDialogForTests();
});

describe('printReceiptDocument', () => {
  it('yazdırır: load sonrası karede fiş belgesinde print, kilit kalkınca yeniden', async () => {
    vi.useFakeTimers();
    const parentPrint = vi.spyOn(window, 'print').mockImplementation(() => {});

    const first = printReceiptDocument(SLIP_HTML);
    const iframe = frames()[0];
    expect(iframe).toBeTruthy();
    const print = arm(iframe);
    expect(iframe.style.width).toBe('320px');
    expect(iframe.style.opacity).toBe('');

    iframe.dispatchEvent(new Event('load'));
    await vi.advanceTimersByTimeAsync(20);
    expect(print).toHaveBeenCalledTimes(1);
    expect(parentPrint).not.toHaveBeenCalled();
    expect(isReceiptPrintInFlight()).toBe(true);

    printReceiptDocument(SLIP_HTML);
    await vi.advanceTimersByTimeAsync(20);
    expect(print).toHaveBeenCalledTimes(1);
    expect(frames()).toHaveLength(1);

    iframe.contentWindow?.dispatchEvent(new Event('afterprint'));
    expect(isReceiptPrintInFlight()).toBe(true);

    await vi.advanceTimersByTimeAsync(RECEIPT_PRINT_AFTERPRINT_MIN_MS);
    iframe.contentWindow?.dispatchEvent(new Event('afterprint'));
    await first;
    expect(isReceiptPrintInFlight()).toBe(false);

    const second = printReceiptDocument('<html><body>ikinci</body></html>');
    const iframe2 = frames()[frames().length - 1];
    const print2 = arm(iframe2);
    iframe2.dispatchEvent(new Event('load'));
    await vi.advanceTimersByTimeAsync(20);
    expect(print2).toHaveBeenCalledTimes(1);
    expect(parentPrint).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(RECEIPT_PRINT_AFTERPRINT_MIN_MS);
    iframe2.contentWindow?.dispatchEvent(new Event('afterprint'));
    await second;
    parentPrint.mockRestore();
  });

  it('logo hiç yüklenmezse zaman aşımında yine print çağırır ve kilit düşer', async () => {
    vi.useFakeTimers();
    const raf = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 0);

    const pending = printReceiptDocument(SLIP_HTML);
    const iframe = frames()[0];
    const print = arm(iframe);
    iframe.dispatchEvent(new Event('load'));
    await vi.advanceTimersByTimeAsync(RECEIPT_PRINT_IMAGE_WAIT_MS - 1);
    expect(print).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(print).toHaveBeenCalledTimes(1);
    expect(isReceiptPrintInFlight()).toBe(true);

    printReceiptDocument(SLIP_HTML);
    expect(frames()).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(RECEIPT_PRINT_LOCK_RELEASE_MS);
    await pending;
    expect(isReceiptPrintInFlight()).toBe(false);

    raf.mockRestore();
    const again = printReceiptDocument(SLIP_HTML);
    const iframe2 = frames()[frames().length - 1];
    const print2 = arm(iframe2);
    await vi.advanceTimersByTimeAsync(RECEIPT_PRINT_IMAGE_WAIT_MS);
    expect(print2).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(RECEIPT_PRINT_LOCK_RELEASE_MS);
    await again;
  });
});
