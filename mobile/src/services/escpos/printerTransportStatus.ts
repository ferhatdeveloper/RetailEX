/**
 * Yazıcı taşıyıcı durumu — ağ / Bluetooth / sistem özeti.
 */

import { escposTransportStatus } from './escposTcpTransport';
import { bluetoothEscposTransportStatus } from './escposBluetoothTransport';
import { systemPrintTransportStatus } from './systemPrintTransport';

export type PrinterTransportSummary = {
  network: ReturnType<typeof escposTransportStatus>;
  bluetooth: ReturnType<typeof bluetoothEscposTransportStatus>;
  system: ReturnType<typeof systemPrintTransportStatus>;
};

export function printerTransportStatus(): PrinterTransportSummary {
  return {
    network: escposTransportStatus(),
    bluetooth: bluetoothEscposTransportStatus(),
    system: systemPrintTransportStatus(),
  };
}
