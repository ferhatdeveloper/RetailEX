import type { ReceiptStandardDocumentProps } from './ReceiptStandardDocument';
import { ReceiptStandardDocument } from './ReceiptStandardDocument';

export type ReceiptA4PaymentRow = {
  method?: string;
  amount?: number;
  currency?: string;
};

export type ReceiptA4DocumentProps = Omit<ReceiptStandardDocumentProps, 'paperFormat'>;

/** A4 kurumsal satış fişi */
export function ReceiptA4Document(props: ReceiptA4DocumentProps) {
  return <ReceiptStandardDocument {...props} paperFormat="A4" />;
}
