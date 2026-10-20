import { formatMoneyWithCode } from './currency';

/**
 * Ödeme ekranındaki müşteri bakiye etiketi.
 * Pozitif bakiye borç, negatif bakiye alacaktır (peşinat / avans).
 * Para birimi kodu tutarın içinde bir kez durur.
 * Bu etiket fişin ödenecek kalanının yerine geçmez.
 */
export function formatPosCustomerBalanceLabel(input: {
  balance: number;
  currencyCode: string;
  debtLabel: string;
  creditLabel: string;
}): string {
  const balance = Number(input.balance) || 0;
  const money = formatMoneyWithCode(Math.abs(balance), input.currencyCode);
  if (balance > 0.004) return `${input.debtLabel}: ${money}`;
  if (balance < -0.004) return `${input.creditLabel}: ${money}`;
  return money;
}
