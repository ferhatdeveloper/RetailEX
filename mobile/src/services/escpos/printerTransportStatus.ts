/**
 * Yazıcı taşıyıcı durumu — ağ / Bluetooth / sistem / Windows servisi özeti.
 */

import { escposTransportStatus } from './escposTcpTransport';
import { bluetoothEscposTransportStatus } from './escposBluetoothTransport';
import { systemPrintTransportStatus } from './systemPrintTransport';
import { windowsServiceTransportStatus } from './windowsServiceTransport';

export type PrinterTransportSummary = {
  network: ReturnType<typeof escposTransportStatus>;
  bluetooth: ReturnType<typeof bluetoothEscposTransportStatus>;
  system: ReturnType<typeof systemPrintTransportStatus>;
  windowsService: ReturnType<typeof windowsServiceTransportStatus>;
};

export function printerTransportStatus(): PrinterTransportSummary {
  return {
    network: escposTransportStatus(),
    bluetooth: bluetoothEscposTransportStatus(),
    system: systemPrintTransportStatus(),
    windowsService: windowsServiceTransportStatus(),
  };
}
