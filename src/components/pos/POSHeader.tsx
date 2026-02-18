import { Tag, Package, RotateCcw, FileX, FileText, CreditCard, Inbox, ClipboardList } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';

interface POSHeaderProps {
  receiptNumber: string;
  currentStaff: string;
  currentDate: string;
  currentTime: string;
  selectedCustomer: any;
  appliedCampaign: any;
  completedSalesCount: number;
  parkedReceiptsCount?: number;
  onCampaignClick: () => void;
  onCategoryClick: () => void;
  onReturnClick: () => void;
  onCancelReceiptClick: () => void;
  onSalesHistoryClick: () => void;
  onPaymentClick: () => void;
  onParkClick: () => void;
  onParkedReceiptsClick?: () => void;
  onWalletClick?: () => void;
  hasCartItems: boolean;
}

export function POSHeader({
  receiptNumber,
  currentStaff,
  currentDate,
  currentTime,
  selectedCustomer,
  appliedCampaign,
  completedSalesCount,
  parkedReceiptsCount = 0,
  onCampaignClick,
  onCategoryClick,
  onReturnClick,
  onCancelReceiptClick,
  onSalesHistoryClick,
  onPaymentClick,
  onParkClick,
  onParkedReceiptsClick,
  onWalletClick,
  hasCartItems
}: POSHeaderProps) {
  const { t } = useLanguage();

  return (
    <div className="bg-white border-b border-gray-300 px-3 py-2.5 flex items-center justify-between">
      {/* Sol Taraf - Kampanya & Kategori */}
      <div className="flex items-center gap-2">
        <button
          onClick={onCampaignClick}
          className="px-4 py-2 text-sm border border-blue-400 bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors flex items-center"
        >
          <Tag className="w-4 h-4 me-1.5" />
          {t.campaign}
        </button>

        <button
          onClick={onCategoryClick}
          className="px-4 py-2 text-sm border border-blue-400 bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors flex items-center"
        >
          <Package className="w-4 h-4 me-1.5" />
          {t.category}
        </button>

        {/* 
         {onWalletClick \u0026\u0026 (
           \u003cbutton
             onClick={onWalletClick}
             className=\"px-4 py-2 text-sm border border-purple-400 bg-purple-50 text-purple-700 hover:bg-purple-100 transition-colors flex items-center\"
           \u003e
             \u003cCreditCard className=\"w-4 h-4 me-1.5\" /\u003e
             Cüzdan / Bakiye
           \u003c/button\u003e
         )}
         */}
      </div>

      {/* Sağ Taraf - Action Buttons */}
      <div className="flex items-center gap-2">
        <button
          onClick={onReturnClick}
          className="px-4 py-2 text-sm border border-gray-300 bg-white hover:bg-gray-50 transition-colors flex items-center"
        >
          <RotateCcw className="w-4 h-4 me-1.5" />
          {t.return}
        </button>

        {onParkedReceiptsClick && (
          <button
            onClick={onParkedReceiptsClick}
            className="px-4 py-2 text-sm border border-gray-300 bg-white hover:bg-gray-50 transition-colors relative flex items-center"
          >
            <ClipboardList className="w-4 h-4 me-1.5" />
            {t.parkedReceiptsButton}
            {parkedReceiptsCount > 0 && (
              <span className="absolute -top-1 -inline-end-1 bg-red-500 text-white text-[10px] w-4.5 h-4.5 flex items-center justify-center rounded-full">
                {parkedReceiptsCount}
              </span>
            )}
          </button>
        )}

        <button
          onClick={onParkClick}
          disabled={!hasCartItems}
          className="px-4 py-2 text-sm border border-gray-300 bg-white hover:bg-gray-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center"
        >
          <Inbox className="w-4 h-4 me-1.5" />
          {t.parkReceipt}
        </button>

        <button
          onClick={onCancelReceiptClick}
          disabled={!hasCartItems}
          className="px-4 py-2 text-sm border border-gray-300 bg-white hover:bg-gray-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center"
        >
          <FileX className="w-4 h-4 me-1.5" />
          {t.cancelReceipt}
        </button>

        <button
          onClick={onSalesHistoryClick}
          disabled={completedSalesCount === 0}
          className="px-4 py-2 text-sm border border-gray-300 bg-white hover:bg-gray-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center"
        >
          <FileText className="w-4 h-4 me-1.5" />
          {t.sales} ({completedSalesCount})
        </button>

        <button
          onClick={onPaymentClick}
          disabled={!hasCartItems}
          className="px-4 py-2 text-sm border border-green-500 bg-gradient-to-r from-green-500 to-green-600 text-white hover:from-green-600 hover:to-green-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center"
        >
          <CreditCard className="w-4 h-4 me-1.5" />
          {t.receivePayment}
        </button>
      </div>

      {/* Applied Campaign Badge */}
      {appliedCampaign && (
        <div className="absolute inset-inline-start-1/2 transform -translate-x-1/2 rtl:translate-x-1/2 px-3 py-1.5 bg-gradient-to-r from-orange-500 to-orange-600 text-white text-sm">
          <Tag className="w-3.5 h-3.5 inline-block me-1.5" />
          {appliedCampaign.name}
        </div>
      )}
    </div>
  );
}
