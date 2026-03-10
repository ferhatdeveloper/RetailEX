/**
 * ExRetailOS - Kasa İşlem Türleri Modal
 * 
 * Kasa işlem türlerini listeleyen modal
 * 
 * @created 2025-01-02
 */

import React from 'react';
import { X, TrendingUp, TrendingDown, Plus, Minus, Wallet, ArrowRightLeft, Receipt, FileText, ShoppingBag } from 'lucide-react';
import { Kasa } from '../../../services/api/kasa';

interface KasaIslemTurleriModalProps {
  kasa: Kasa;
  onClose: () => void;
  onSelect: (type: 'CH_TAHSILAT' | 'CH_ODEME' | 'KASA_GIRIS' | 'KASA_CIKIS' | 'BANKA_YATIRILAN' | 'BANKADAN_CEKILEN' | 'VIRMAN' | 'GIDER_PUSULASI' | 'VERILEN_SERBEST_MESLEK' | 'ALINAN_SERBEST_MESLEK' | 'MUSTAHSIL_MAKBUZU' | 'ACILIS_BORC' | 'ACILIS_ALACAK' | 'KUR_FARKI_BORC' | 'KUR_FARKI_ALACAK') => void;
}


import { useLanguage } from '../../../contexts/LanguageContext';

export function KasaIslemTurleriModal({ kasa, onClose, onSelect }: KasaIslemTurleriModalProps) {
  const { tm } = useLanguage();

  const islemTurleri = [
    {
      type: 'CH_TAHSILAT' as const,
      label: tm('chCollection'),
      description: tm('chCollectionDesc'),
      icon: TrendingUp,
      color: 'green',
      bgColor: 'bg-green-50',
      borderColor: 'border-green-200',
      textColor: 'text-green-800',
      hoverBg: 'hover:bg-green-100',
    },
    {
      type: 'CH_ODEME' as const,
      label: tm('chPayment'),
      description: tm('chPaymentDesc'),
      icon: TrendingDown,
      color: 'red',
      bgColor: 'bg-red-50',
      borderColor: 'border-red-200',
      textColor: 'text-red-800',
      hoverBg: 'hover:bg-red-100',
    },
    {
      type: 'KASA_GIRIS' as const,
      label: tm('cashIn'),
      description: tm('cashInDesc'),
      icon: Plus,
      color: 'blue',
      bgColor: 'bg-blue-50',
      borderColor: 'border-blue-200',
      textColor: 'text-blue-800',
      hoverBg: 'hover:bg-blue-100',
    },
    {
      type: 'KASA_CIKIS' as const,
      label: tm('cashOut'),
      description: tm('cashOutDesc'),
      icon: Minus,
      color: 'orange',
      bgColor: 'bg-orange-50',
      borderColor: 'border-orange-200',
      textColor: 'text-orange-800',
      hoverBg: 'hover:bg-orange-100',
    },
    {
      type: 'BANKA_YATIRILAN' as const,
      label: tm('bankDeposit'),
      description: tm('bankDepositDesc'),
      icon: TrendingUp,
      color: 'indigo',
      bgColor: 'bg-indigo-50',
      borderColor: 'border-indigo-200',
      textColor: 'text-indigo-800',
      hoverBg: 'hover:bg-indigo-100',
    },
    {
      type: 'BANKADAN_CEKILEN' as const,
      label: tm('bankWithdrawal'),
      description: tm('bankWithdrawalDesc'),
      icon: TrendingDown,
      color: 'indigo',
      bgColor: 'bg-indigo-50',
      borderColor: 'border-indigo-200',
      textColor: 'text-indigo-800',
      hoverBg: 'hover:bg-indigo-100',
    },
    {
      type: 'VIRMAN' as const,
      label: tm('bankTransfer'),
      description: tm('bankTransferDesc'),
      icon: ArrowRightLeft,
      color: 'purple',
      bgColor: 'bg-purple-50',
      borderColor: 'border-purple-200',
      textColor: 'text-purple-800',
      hoverBg: 'hover:bg-purple-100',
    },
    {
      type: 'GIDER_PUSULASI' as const,
      label: tm('expenseVoucher'),
      description: tm('expenseVoucherDesc'),
      icon: Receipt,
      color: 'orange',
      bgColor: 'bg-orange-50',
      borderColor: 'border-orange-200',
      textColor: 'text-orange-800',
      hoverBg: 'hover:bg-orange-100',
    },
    {
      type: 'VERILEN_SERBEST_MESLEK' as const,
      label: tm('issuedSelfEmployedReceipt'),
      description: tm('issuedSelfEmployedReceiptDesc'),
      icon: FileText,
      color: 'cyan',
      bgColor: 'bg-cyan-50',
      borderColor: 'border-cyan-200',
      textColor: 'text-cyan-800',
      hoverBg: 'hover:bg-cyan-100',
    },
    {
      type: 'ALINAN_SERBEST_MESLEK' as const,
      label: tm('receivedSelfEmployedReceipt'),
      description: tm('receivedSelfEmployedReceiptDesc'),
      icon: FileText,
      color: 'cyan',
      bgColor: 'bg-cyan-50',
      borderColor: 'border-cyan-200',
      textColor: 'text-cyan-800',
      hoverBg: 'hover:bg-cyan-100',
    },
    {
      type: 'MUSTAHSIL_MAKBUZU' as const,
      label: tm('producerReceipt'),
      description: tm('producerReceiptDesc'),
      icon: ShoppingBag,
      color: 'emerald',
      bgColor: 'bg-emerald-50',
      borderColor: 'border-emerald-200',
      textColor: 'text-emerald-800',
      hoverBg: 'hover:bg-emerald-100',
    },
    {
      type: 'ACILIS_BORC' as const,
      label: tm('openingDebit'),
      description: tm('openingDebitDesc'),
      icon: Plus,
      color: 'gray',
      bgColor: 'bg-gray-50',
      borderColor: 'border-gray-200',
      textColor: 'text-gray-800',
      hoverBg: 'hover:bg-gray-100',
    },
    {
      type: 'ACILIS_ALACAK' as const,
      label: tm('openingCredit'),
      description: tm('openingCreditDesc'),
      icon: Minus,
      color: 'gray',
      bgColor: 'bg-gray-50',
      borderColor: 'border-gray-200',
      textColor: 'text-gray-800',
      hoverBg: 'hover:bg-gray-100',
    },
    {
      type: 'KUR_FARKI_BORC' as const,
      label: tm('exchangeDifferenceDebit'),
      description: tm('exchangeDifferenceDebitDesc'),
      icon: TrendingUp,
      color: 'blue',
      bgColor: 'bg-blue-50',
      borderColor: 'border-blue-200',
      textColor: 'text-blue-800',
      hoverBg: 'hover:bg-blue-100',
    },
    {
      type: 'KUR_FARKI_ALACAK' as const,
      label: tm('exchangeDifferenceCredit'),
      description: tm('exchangeDifferenceCreditDesc'),
      icon: TrendingDown,
      color: 'red',
      bgColor: 'bg-red-50',
      borderColor: 'border-red-200',
      textColor: 'text-red-800',
      hoverBg: 'hover:bg-red-100',
    },
  ];

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl rounded-lg">
        {/* Header */}
        <div className="p-4 border-b border-gray-200 bg-gradient-to-r from-purple-600 to-purple-700 flex items-center justify-between">
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
            onClick={onClose}
            className="text-white hover:bg-white/10 p-1 transition-colors rounded"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {islemTurleri.map((islem) => {
              const Icon = islem.icon;
              return (
                <button
                  key={islem.type}
                  onClick={() => onSelect(islem.type)}
                  className={`${islem.bgColor} ${islem.borderColor} ${islem.textColor} ${islem.hoverBg} border-2 rounded-lg p-4 text-left transition-all duration-200 hover:shadow-md hover:scale-105`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`p-2 rounded-lg bg-white ${islem.textColor}`}>
                      <Icon className="w-6 h-6" />
                    </div>
                    <div className="flex-1">
                      <h4 className="font-semibold text-lg mb-1">{islem.label}</h4>
                      <p className="text-sm opacity-75">{islem.description}</p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200 bg-gray-50 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2.5 text-sm bg-gray-200 text-gray-700 hover:bg-gray-300 transition-colors rounded-lg"
          >
            {tm('cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}




