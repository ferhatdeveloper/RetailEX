/**
 * Fiş HTML'ini gizli iframe belgesinde yazdırır.
 * iframe, çağrı anında (ağ beklenmeden) oluşturulur. print() belge load
 * olayından sonraki karede çalışır. Logo hiç yüklenmezse kısa süre sonra
 * yine yazdırılır. Kilit afterprint ve zaman aşımında kalkar; iframe
 * diyalog açılmadan kaldırılmaz.
 */

/** Logo load'u bu süreden uzun sürerse belge yine yazdırılır. */
export const RECEIPT_PRINT_IMAGE_WAIT_MS = 700;

/**
 * print() ile aynı turda gelen sahte afterprint yok sayılır.
 * Gerçek diyalog kapanışı bundan sonra gelir.
 */
export const RECEIPT_PRINT_AFTERPRINT_MIN_MS = 400;

/** afterprint gelmezse buton bu sürede yeniden açılır. */
export const RECEIPT_PRINT_LOCK_RELEASE_MS = 2000;

/** Diyalog açıkken belgeyi düşürmemek için geç temizlik. */
const RECEIPT_PRINT_FRAME_CLEANUP_MS = 60000;

let generation = 0;
let inFlight = false;
const pendingTimers = new Set<number>();

function later(ms: number, fn: () => void): number {
  const id = window.setTimeout(() => {
    pendingTimers.delete(id);
    fn();
  }, ms);
  pendingTimers.add(id);
  return id;
}

function clearTimer(id: number): void {
  window.clearTimeout(id);
  pendingTimers.delete(id);
}

/** Testler kilit ve zamanlayıcıyı sıfırlar. */
export function resetReceiptPrintDialogForTests(): void {
  generation += 1;
  inFlight = false;
  for (const id of pendingTimers) window.clearTimeout(id);
  pendingTimers.clear();
  if (typeof document !== 'undefined') {
    document.querySelectorAll('iframe[data-rx-print-frame]').forEach((node) => node.remove());
  }
}

export function isReceiptPrintInFlight(): boolean {
  return inFlight;
}

function frameStyle(html: string): string {
  const thermal = /size:\s*80mm/i.test(html);
  const width = thermal ? 320 : 900;
  const height = thermal ? 1600 : 1400;
  /* opacity:0 ve 0×0 çerçeve bazı tarayıcılarda print() çağrısını sessizce yutar. */
  return `position:fixed;left:-12000px;top:0;width:${width}px;height:${height}px;border:0;pointer-events:none`;
}

/**
 * Sistem yazdırma diyaloğunu fiş belgesi üzerinde açar.
 * Kilitliyken ikinci çağrı yok sayılır; kilit düşünce yeniden açılır.
 */
export function printReceiptDocument(html: string): Promise<void> {
  if (inFlight) return Promise.resolve();
  if (typeof document === 'undefined') return Promise.resolve();

  inFlight = true;
  const token = generation;

  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.setAttribute('data-rx-print-frame', '1');
  iframe.style.cssText = frameStyle(html);
  document.body.appendChild(iframe);

  const win = iframe.contentWindow;
  const doc = win?.document;
  if (!win || !doc) {
    inFlight = false;
    try {
      iframe.remove();
    } catch {
      /* ignore */
    }
    return Promise.reject(new Error('iframe document'));
  }

  return new Promise<void>((resolve) => {
    let settled = false;
    let printed = false;
    let printCalledAt = 0;
    let imageTimer = 0;
    let lockTimer = 0;
    let cleanupTimer = 0;
    let boundWin: Window | null = null;

    const alive = () => token === generation;

    const releaseLock = () => {
      if (token !== generation) return;
      inFlight = false;
    };

    const removeFrame = () => {
      if (!alive()) return;
      try {
        iframe.remove();
      } catch {
        /* ignore */
      }
    };

    const settle = () => {
      if (settled || !alive()) return;
      settled = true;
      if (imageTimer) clearTimer(imageTimer);
      if (lockTimer) clearTimer(lockTimer);
      releaseLock();
      resolve();
    };

    const onAfterPrint = () => {
      if (!alive() || !printCalledAt) return;
      if (Date.now() - printCalledAt < RECEIPT_PRINT_AFTERPRINT_MIN_MS) return;
      boundWin?.removeEventListener('afterprint', onAfterPrint);
      later(200, removeFrame);
      settle();
    };

    const doPrint = () => {
      if (printed || !alive()) return;
      printed = true;
      if (imageTimer) clearTimer(imageTimer);
      const target = iframe.contentWindow;
      if (!target || typeof target.print !== 'function') {
        console.warn('[receiptPrint] iframe print yok');
        removeFrame();
        settle();
        return;
      }
      try {
        boundWin = target;
        target.addEventListener('afterprint', onAfterPrint);
        try {
          target.focus();
        } catch {
          /* focus yoksa diyalog yine açılır */
        }
        printCalledAt = Date.now();
        target.print();
      } catch (err) {
        console.warn('[receiptPrint] print:', err);
        target.removeEventListener('afterprint', onAfterPrint);
        removeFrame();
        settle();
        return;
      }
      /* afterprint kaçarsa kilit butonu kilitlemesin; çerçeve diyalog için durur. */
      lockTimer = later(RECEIPT_PRINT_LOCK_RELEASE_MS, settle);
      cleanupTimer = later(RECEIPT_PRINT_FRAME_CLEANUP_MS, () => {
        if (cleanupTimer) clearTimer(cleanupTimer);
        removeFrame();
        settle();
      });
    };

    const onLoad = () => {
      iframe.removeEventListener('load', onLoad);
      /* Yazı tipleri ve logo için bir kare; print() load öncesi yutulmasın. */
      requestAnimationFrame(() => {
        doPrint();
      });
    };
    iframe.addEventListener('load', onLoad);

    try {
      doc.open();
      doc.write(html);
      doc.close();
    } catch (err) {
      console.warn('[receiptPrint] belge yazılamadı:', err);
      iframe.removeEventListener('load', onLoad);
      releaseLock();
      try {
        iframe.remove();
      } catch {
        /* ignore */
      }
      resolve();
      return;
    }

    imageTimer = later(RECEIPT_PRINT_IMAGE_WAIT_MS, () => {
      doPrint();
    });
  });
}
