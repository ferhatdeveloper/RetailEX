/**
 * Sistem yazıcısı taşıyıcısı — `expo-print` + paylaşım iskeleti.
 *
 * Termal ESC/POS yerine HTML/PDF fiş; Android/iOS sistem yazdırma diyaloğu.
 * Paket: `npx expo install expo-print` (Expo Go'da da çalışabilir).
 */

export type SystemPrintTransportKind = 'system-print' | 'unavailable';

export type SystemPrintResult = {
  ok: boolean;
  message: string;
  code?: SystemPrintErrorCode;
  transport?: SystemPrintTransportKind;
};

export type SystemPrintErrorCode =
  | 'expoPrintUnavailable'
  | 'printFailed'
  | 'cancelled';

let nativeProbeDone = false;
let expoPrintAvailable = false;

export function isExpoPrintAvailable(): boolean {
  if (!nativeProbeDone) probeExpoPrint();
  return expoPrintAvailable;
}

function probeExpoPrint(): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('expo-print');
    expoPrintAvailable = true;
  } catch {
    expoPrintAvailable = false;
  } finally {
    nativeProbeDone = true;
  }
}

export function systemPrintDevBuildHint(): string {
  return (
    'Sistem yazıcısı için `expo-print` gerekir: `npx expo install expo-print`. ' +
    'Kurulumdan sonra test fişi HTML olarak sistem yazdırma diyaloğuna gönderilir.'
  );
}

export function systemPrintTransportStatus(): {
  available: boolean;
  hint: string;
} {
  return {
    available: isExpoPrintAvailable(),
    hint: isExpoPrintAvailable()
      ? 'expo-print yüklü — test fişi sistem yazdırma diyaloğu ile açılabilir.'
      : systemPrintDevBuildHint(),
  };
}

/** Düz metin fiş önizlemesini basit HTML'e çevirir. */
export function receiptTextToHtml(text: string, paperSize: string): string {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  const widthMm = paperSize === '58mm' ? 58 : paperSize === '80mm' ? 80 : 210;
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
  @page { margin: 4mm; size: ${widthMm}mm auto; }
  body { font-family: monospace; font-size: 11px; line-height: 1.35; white-space: pre-wrap; margin: 0; }
</style>
</head>
<body>${escaped}</body>
</html>`;
}

/**
 * HTML fişi sistem yazdırma diyaloğu ile açar.
 * `expo-print` yoksa kurulum ipucu döner.
 */
export async function printReceiptViaSystem(
  html: string,
  options?: { jobName?: string },
): Promise<SystemPrintResult> {
  if (!isExpoPrintAvailable()) {
    return {
      ok: false,
      code: 'expoPrintUnavailable',
      message: systemPrintDevBuildHint(),
      transport: 'unavailable',
    };
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Print = require('expo-print') as {
      printAsync: (opts: { html: string; jobName?: string }) => Promise<{ uri: string } | void>;
    };
    await Print.printAsync({
      html,
      jobName: options?.jobName ?? 'RetailEX Receipt',
    });
    return {
      ok: true,
      message: 'Sistem yazdırma diyaloğu açıldı.',
      transport: 'system-print',
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/cancel/i.test(msg)) {
      return {
        ok: false,
        code: 'cancelled',
        message: 'Yazdırma iptal edildi.',
        transport: 'system-print',
      };
    }
    return {
      ok: false,
      code: 'printFailed',
      message: msg,
      transport: 'system-print',
    };
  }
}
