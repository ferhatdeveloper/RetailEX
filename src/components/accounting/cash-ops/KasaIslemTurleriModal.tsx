/**
 * ExRetailOS - Kasa İşlem Türleri Modal
 *
 * Kasa işlem türlerini listeleyen modal
 *
 * @created 2025-01-02
 */

import { X, TrendingUp, TrendingDown, Plus, Minus, Wallet, ArrowRightLeft, Receipt, FileText, ShoppingBag } from 'lucide-react';
import { useLanguage } from '../../../contexts/LanguageContext';
import { PercentBodyModal, PercentBodyModalScrollBody } from '../../shared/PercentBodyModal';
import type { Kasa, KasaIslemTipi } from '../../../services/api/kasa';

interface KasaIslemTurleriModalProps {
  kasa: Kasa;
  onClose: () => void;
  onSelect: (type: KasaIslemTipi) => void;
}

export function KasaIslemTurleriModal({ kasa, onClose, onSelect }: KasaIslemTurleriModalProps) {
  const { tm } = useLanguage();

  const islemTurleri: Array<{
    type: KasaIslemTipi;
    label: string;
    description: string;
    icon: typeof TrendingUp;
    bgColor: string;
    borderColor: string;
    textColor: string;
    hoverBg: string;
  }> = [
    {
      type: 'CH_TAHSILAT',
      label: tm('chCollection'),
      description: tm('chCollectionDesc'),
      icon: TrendingUp,
      bgColor: 'bg-green-50',
      borderColor: 'border-green-200',
      textColor: 'text-green-800',
      hoverBg: 'hover:bg-green-100',
    },
    {
      type: 'CH_ODEME',
      label: tm('chPayment'),
      description: tm('chPaymentDesc'),
      icon: TrendingDown,
      bgColor: 'bg-red-50',
      borderColor: 'border-red-200',
      textColor: 'text-red-800',
      hoverBg: 'hover:bg-red-100',
    },
    {
      type: 'SATIS_FATURASI',
      label: tm('cashSalesInvoice'),
      description: tm('cashSalesInvoiceDesc'),
      icon: FileText,
      bgColor: 'bg-emerald-50',
      borderColor: 'border-emerald-200',
      textColor: 'text-emerald-800',
      hoverBg: 'hover:bg-emerald-100',
    },
    {
      type: 'ALIS_FATURASI',
      label: tm('cashPurchaseInvoice'),
      description: tm('cashPurchaseInvoiceDesc'),
      icon: ShoppingBag,
      bgColor: 'bg-amber-50',
      borderColor: 'border-amber-200',
      textColor: 'text-amber-800',
      hoverBg: 'hover:bg-amber-100',
    },
    {
      type: 'HIZMET_FATURASI',
      label: tm('cashServiceInvoice'),
      description: tm('cashServiceInvoiceDesc'),
      icon: Receipt,
      bgColor: 'bg-pink-50',
      borderColor: 'border-pink-200',
      textColor: 'text-pink-800',
      hoverBg: 'hover:bg-pink-100',
    },
    {
      type: 'KASA_GIRIS',
      label: tm('cashIn'),
      description: tm('cashInDesc'),
      icon: Plus,
      bgColor: 'bg-blue-50',
      borderColor: 'border-blue-200',
      textColor: 'text-blue-800',
      hoverBg: 'hover:bg-blue-100',
    },
    {
      type: 'KASA_CIKIS',
      label: tm('cashOut'),
      description: tm('cashOutDesc'),
      icon: Minus,
      bgColor: 'bg-orange-50',
      borderColor: 'border-orange-200',
      textColor: 'text-orange-800',
      hoverBg: 'hover:bg-orange-100',
    },
    {
      type: 'BANKA_YATIRILAN',
      label: tm('bankDeposit'),
      description: tm('bankDepositDesc'),
      icon: TrendingUp,
      bgColor: 'bg-indigo-50',
      borderColor: 'border-indigo-200',
      textColor: 'text-indigo-800',
      hoverBg: 'hover:bg-indigo-100',
    },
    {
      type: 'BANKADAN_CEKILEN',
      label: tm('bankWithdrawal'),
      description: tm('bankWithdrawalDesc'),
      icon: TrendingDown,
      bgColor: 'bg-indigo-50',
      borderColor: 'border-indigo-200',
      textColor: 'text-indigo-800',
      hoverBg: 'hover:bg-indigo-100',
    },
    {
      type: 'VIRMAN',
      label: tm('bankTransfer'),
      description: tm('bankTransferDesc'),
      icon: ArrowRightLeft,
      bgColor: 'bg-purple-50',
      borderColor: 'border-purple-200',
      textColor: 'text-purple-800',
      hoverBg: 'hover:bg-purple-100',
    },
    {
      type: 'GIDER_PUSULASI',
      label: tm('expenseVoucher'),
      description: tm('expenseVoucherDesc'),
      icon: Receipt,
      bgColor: 'bg-orange-50',
      borderColor: 'border-orange-200',
      textColor: 'text-orange-800',
      hoverBg: 'hover:bg-orange-100',
    },
    {
      type: 'VERILEN_SERBEST_MESLEK',
      label: tm('issuedSelfEmployedReceipt'),
      description: tm('issuedSelfEmployedReceiptDesc'),
      icon: FileText,
      bgColor: 'bg-cyan-50',
      borderColor: 'border-cyan-200',
      textColor: 'text-cyan-800',
      hoverBg: 'hover:bg-cyan-100',
    },
    {
      type: 'ALINAN_SERBEST_MESLEK',
      label: tm('receivedSelfEmployedReceipt'),
      description: tm('receivedSelfEmployedReceiptDesc'),
      icon: FileText,
      bgColor: 'bg-cyan-50',
      borderColor: 'border-cyan-200',
      textColor: 'text-cyan-800',
      hoverBg: 'hover:bg-cyan-100',
    },
    {
      type: 'MUSTAHSIL_MAKBUZU',
      label: tm('producerReceipt'),
      description: tm('producerReceiptDesc'),
      icon: ShoppingBag,
      bgColor: 'bg-emerald-50',
      borderColor: 'border-emerald-200',
      textColor: 'text-emerald-800',
      hoverBg: 'hover:bg-emerald-100',
    },
    {
      type: 'ACILIS_BORC',
      label: tm('openingDebit'),
      description: tm('openingDebitDesc'),
      icon: Plus,
      bgColor: 'bg-gray-50',
      borderColor: 'border-gray-200',
      textColor: 'text-gray-800',
      hoverBg: 'hover:bg-gray-100',
    },
    {
      type: 'ACILIS_ALACAK',
      label: tm('openingCredit'),
      description: tm('openingCreditDesc'),
      icon: Minus,
      bgColor: 'bg-gray-50',
      borderColor: 'border-gray-200',
      textColor: 'text-gray-800',
      hoverBg: 'hover:bg-gray-100',
    },
    {
      type: 'KUR_FARKI_BORC',
      label: tm('exchangeDifferenceDebit'),
      description: tm('exchangeDifferenceDebitDesc'),
      icon: TrendingUp,
      bgColor: 'bg-blue-50',
      borderColor: 'border-blue-200',
      textColor: 'text-blue-800',
      hoverBg: 'hover:bg-blue-100',
    },
    {
      type: 'KUR_FARKI_ALACAK',
      label: tm('exchangeDifferenceCredit'),
      description: tm('exchangeDifferenceCreditDesc'),
      icon: TrendingDown,
      bgColor: 'bg-red-50',
      borderColor: 'border-red-200',
      textColor: 'text-red-800',
      hoverBg: 'hover:bg-red-100',
    },
  ];

  return (
    <PercentBodyModal onClose={onClose} size="list" ariaLabel={tm('createTransaction')}>
      <div className="p-4 border-b border-gray-200 bg-gradient-to-r from-purple-600 to-purple-700 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <Wallet className="w-6 h-6 text-white" />
          <div>
            <h3 className="text-lg text-white font-semibold">{tm('createTransaction')}</h3>
            <p className="text-sm text-purple-100">
              {kasa.kasa_kodu} / {kasa.kasa_adi}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-white hover:bg-white/10 p-1 transition-colors rounded"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <PercentBodyModalScrollBody className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {islemTurleri.map((islem) => {
            const Icon = islem.icon;
            return (
              <button
                key={islem.type}
                type="button"
                onClick={() => onSelect(islem.type)}
                className={`${islem.bgColor} ${islem.borderColor} ${islem.textColor} ${islem.hoverBg} border-2 rounded-lg p-4 text-left transition-all duration-200 hover:shadow-md`}
              >
                <div className="flex items-start gap-3">
                  <div className={`p-2 rounded-lg bg-white ${islem.textColor}`}>
                    <Icon className="w-6 h-6" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-semibold text-lg mb-1">{islem.label}</h4>
                    <p className="text-sm opacity-75">{islem.description}</p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </PercentBodyModalScrollBody>

      <div className="p-4 border-t border-gray-200 bg-gray-50 flex justify-end shrink-0">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2.5 text-sm bg-gray-200 text-gray-700 hover:bg-gray-300 transition-colors rounded-lg"
        >
          {tm('cancel')}
        </button>
      </div>
    </PercentBodyModal>
  );
}
