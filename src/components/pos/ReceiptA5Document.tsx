import type { ReceiptA4DocumentProps } from './ReceiptA4Document';
import { ReceiptStandardDocument } from './ReceiptStandardDocument';

/** A5 kurumsal satış fişi — ReceiptStandardDocument A5 sürümü */
export function ReceiptA5Document(props: Omit<ReceiptA4DocumentProps, 'paperFormat'>) {
  return <ReceiptStandardDocument {...props} paperFormat="A5" />;
}
