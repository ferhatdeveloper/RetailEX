import { X, Printer } from 'lucide-react';
import type { Sale } from '../../core/types';
import { formatNumber } from '../../utils/formatNumber';
import { aggregatePosPayments, buildPosZReport } from '../../utils/posZReport';
import type { PosCashSession, PosSessionCashBreakdown } from '../../utils/posCashSession';
import { ModalLayer } from '../shared/FullscreenBodyPortal';
import { useLanguage } from '../../contexts/LanguageContext';

interface POSClosePrintPreviewProps {
  onClose: () => void;
  onPrint: () => void;
  printFormat: '80mm' | 'a4';
  setPrintFormat: (format: '80mm' | 'a4') => void;
  sales: Sale[];
  currentStaff: string;
  openingCash: number;
  cashSession?: PosCashSession | null;
  actualCash: number;
  expectedCash: number;
  difference: number;
  cashBreakdown?: PosSessionCashBreakdown;
  note: string;
}

export function POSClosePrintPreview({
  onClose,
  onPrint,
  printFormat,
  setPrintFormat,
  sales,
  currentStaff,
  openingCash,
  cashSession = null,
  actualCash,
  expectedCash,
  difference,
  cashBreakdown,
  note
}: POSClosePrintPreviewProps) {
  const { t, tm } = useLanguage();
  const positiveSales = sales.filter((s) => Number(s.total) > 0 && String(s.status ?? '').toLowerCase() !== 'cancelled');
  const returnSales = sales.filter(s => Number(s.total) < 0 || String(s.status ?? '').toLowerCase() === 'return');
  const paymentBreakdown = aggregatePosPayments(positiveSales);

  const totalSales = positiveSales.reduce((sum, sale) => sum + sale.total, 0);
  const cashTotal = paymentBreakdown.cash;
  const cardTotal = paymentBreakdown.card;
  const creditTotal = paymentBreakdown.credit;
  const otherTotal = paymentBreakdown.other;
  const returnTotal = returnSales.reduce((sum, sale) => sum + Math.abs(sale.total), 0);
  const netSales = totalSales - returnTotal;
  const zReport = buildPosZReport(sales);
  const cashierStats = zReport.cashierStats;
  const bd = cashBreakdown ?? {
    openingCash,
    sessionCashSales: cashTotal,
    sessionCashReturns: 0,
    expectedCash,
  };

  return (
    <>
      {/* Screen Version - No Print */}
      <ModalLayer className="bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 print:hidden">
        <div className="bg-white w-full max-w-4xl shadow-2xl max-h-[90vh] overflow-hidden flex flex-col">
          {/* Header */}
          <div className="p-4 border-b border-gray-200 bg-gradient-to-r from-blue-600 to-blue-700 flex items-center justify-between">
            <h3 className="text-lg text-white flex items-center gap-2">
              <Printer className="w-6 h-6" />
              {tm('posPrintPreviewTitle')}
            </h3>
            <button
              onClick={onClose}
              className="text-white hover:bg-white/10 p-1 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Format Selection */}
          <div className="p-4 border-b border-gray-200 bg-gray-50">
            <h4 className="text-sm font-medium text-gray-700 mb-3">{tm('posPrintFormatSelect')}</h4>
            <div className="flex gap-3">
              <button
                onClick={() => setPrintFormat('80mm')}
                className={`flex-1 px-6 py-4 border-2 transition-all ${
                  printFormat === '80mm'
                    ? 'border-blue-600 bg-blue-50 text-blue-700'
                    : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'
                }`}
              >
                <div className="font-medium mb-1">{tm('posThermal80mm')}</div>
                <div className="text-xs text-gray-500">{tm('posIdealForReceiptPrinter')}</div>
              </button>
              <button
                onClick={() => setPrintFormat('a4')}
                className={`flex-1 px-6 py-4 border-2 transition-all ${
                  printFormat === 'a4'
                    ? 'border-blue-600 bg-blue-50 text-blue-700'
                    : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'
                }`}
              >
                <div className="font-medium mb-1">{tm('posA4Page')}</div>
                <div className="text-xs text-gray-500">{tm('posForFolderArchive')}</div>
              </button>
            </div>
          </div>

          {/* Preview */}
          <div className="flex-1 overflow-y-auto p-6 bg-gray-100">
            <div className={`mx-auto bg-white shadow-lg ${printFormat === '80mm' ? 'max-w-sm' : 'max-w-2xl'}`}>
              <div className="p-6">
                {printFormat === '80mm' ? (
                  /* 80mm Format */
                  <div className="font-mono text-xs">
                    <div className="text-center mb-4">
                      <div className="text-base font-bold">ExRetailOS</div>
                      <div className="text-xs">{tm('posStoreSalesSystem')}</div>
                      <div className="border-t border-b border-dashed border-gray-400 my-2 py-1">
                        {tm('posCashCloseReport')}
                      </div>
                    </div>

                    <div className="space-y-1 mb-3">
                      <div className="flex justify-between">
                        <span>{t.dateLabel}:</span>
                        <span>{new Date().toLocaleDateString('tr-TR')}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>{t.timeLabel}:</span>
                        <span>{new Date().toLocaleTimeString('tr-TR')}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>{t.cashierLabel}:</span>
                        <span>{currentStaff}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>{t.cashRegister}:</span>
                        <span>{tm('posCashRegister1')}</span>
                      </div>
                    </div>

                    <div className="border-t border-dashed border-gray-400 my-2"></div>

                    <div className="font-bold mb-1">{tm('reportsSalesSummarySection')}</div>
                    <div className="space-y-1 mb-3">
                      <div className="flex justify-between">
                        <span>{tm('posSalesCountLabel')}</span>
                        <span>{positiveSales.length}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>{tm('posGrossSalesLabel')}</span>
                        <span>{formatNumber(totalSales, 2, false)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>{t.return}:</span>
                        <span>-{formatNumber(returnTotal, 2, false)}</span>
                      </div>
                      <div className="flex justify-between font-bold">
                        <span>{tm('posNetSalesLabel')}</span>
                        <span>{formatNumber(netSales, 2, false)}</span>
                      </div>
                    </div>

                    <div className="border-t border-dashed border-gray-400 my-2"></div>

                    <div className="font-bold mb-1">{tm('posPaymentMethodsCaps')}</div>
                    <div className="space-y-1 mb-3">
                      <div className="flex justify-between">
                        <span>{t.cashLabel} ({paymentBreakdown.cashCount}):</span>
                        <span>{formatNumber(cashTotal, 2, false)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>{tm('posCreditCardShort')} ({paymentBreakdown.cardCount}):</span>
                        <span>{formatNumber(cardTotal, 2, false)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>{tm('veresiye')} ({paymentBreakdown.creditCount}):</span>
                        <span>{formatNumber(creditTotal, 2, false)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>{t.other} ({paymentBreakdown.otherCount}):</span>
                        <span>{formatNumber(otherTotal, 2, false)}</span>
                      </div>
                      <div className="flex justify-between font-bold">
                        <span>{t.total}:</span>
                        <span>{formatNumber(cashTotal + cardTotal + creditTotal + otherTotal, 2, false)}</span>
                      </div>
                    </div>

                    {cashierStats.length > 0 && (
                      <>
                        <div className="border-t border-dashed border-gray-400 my-2"></div>
                        <div className="font-bold mb-1">{tm('posCashierStaffTurnover')}</div>
                        <div className="space-y-2 mb-3">
                          {cashierStats.map((c) => (
                            <div key={c.name} className="text-xs border-b border-gray-200 pb-1 last:border-0">
                              <div className="flex justify-between font-semibold text-gray-900">
                                <span>{c.name}</span>
                                <span>{tm('posReceiptCountSuffix').replace('{count}', String(c.salesCount))}</span>
                              </div>
                              <div className="flex justify-between text-gray-800">
                                <span>{tm('posNetTurnover')}</span>
                                <span className="font-bold">{formatNumber(c.netRevenue, 2, false)}</span>
                              </div>
                              <div className="flex justify-between text-gray-600 text-[10px]">
                                <span>{tm('posCashCard')}</span>
                                <span>{formatNumber(c.cashTotal, 2, false)} / {formatNumber(c.cardTotal, 2, false)}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </>
                    )}

                    <div className="border-t border-dashed border-gray-400 my-2"></div>

                    <div className="font-bold mb-1">{cashSession ? tm('posCashStatusSession') : tm('posCashStatusCaps')}</div>
                    <div className="space-y-1 mb-3">
                      <div className="flex justify-between">
                        <span>{tm('posOpeningHandover')}</span>
                        <span>{formatNumber(bd.openingCash, 2, false)}</span>
                      </div>
                      {bd.handoverFrom && (
                        <div className="flex justify-between text-xs">
                          <span>{tm('posHandoverFrom')} {bd.handoverFrom}</span>
                          {bd.handoverAmount != null && bd.handoverAmount > 0 && (
                            <span>{formatNumber(bd.handoverAmount, 2, false)}</span>
                          )}
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span>{t.sessionCashSales}:</span>
                        <span>{formatNumber(bd.sessionCashSales, 2, false)}</span>
                      </div>
                      {bd.sessionCashReturns > 0 && (
                        <div className="flex justify-between">
                          <span>{t.sessionCashReturns}:</span>
                          <span>-{formatNumber(bd.sessionCashReturns, 2, false)}</span>
                        </div>
                      )}
                      <div className="flex justify-between font-bold">
                        <span>{tm('posExpectedLabel')}</span>
                        <span>{formatNumber(bd.expectedCash, 2, false)}</span>
                      </div>
                      <div className="flex justify-between font-bold">
                        <span>{tm('posCountedLabel')}</span>
                        <span>{formatNumber(actualCash, 2, false)}</span>
                      </div>
                      <div className="flex justify-between font-bold text-base">
                        <span>{tm('posDifferenceCaps')}</span>
                        <span>{difference > 0 ? '+' : ''}{formatNumber(difference, 2, false)}</span>
                      </div>
                    </div>

                    {note && (
                      <>
                        <div className="border-t border-dashed border-gray-400 my-2"></div>
                        <div className="mb-2">
                          <div className="font-bold mb-1">{tm('posNoteCaps')}</div>
                          <div className="text-xs">{note}</div>
                        </div>
                      </>
                    )}

                    <div className="border-t border-dashed border-gray-400 my-2"></div>

                    <div className="text-center text-xs">
                      <div>ExRetailOS</div>
                      <div className="text-[10px]">{tm('posStoreSalesMgmtSystem')}</div>
                    </div>
                  </div>
                ) : (
                  /* A4 Format */
                  <div>
                    <div className="text-center mb-6">
                      <h1 className="text-2xl font-bold mb-2">ExRetailOS</h1>
                      <p className="text-sm text-gray-600">{tm('posStoreSalesMgmtSystem')}</p>
                      <h2 className="text-xl font-bold mt-4 border-t border-b border-gray-300 py-2">
                        {tm('posCashCloseReport')}
                      </h2>
                    </div>

                    <div className="grid grid-cols-2 gap-6 mb-6">
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between border-b border-gray-200 pb-1">
                          <span className="font-medium">{t.dateLabel}:</span>
                          <span>{new Date().toLocaleDateString('tr-TR')}</span>
                        </div>
                        <div className="flex justify-between border-b border-gray-200 pb-1">
                          <span className="font-medium">{t.timeLabel}:</span>
                          <span>{new Date().toLocaleTimeString('tr-TR')}</span>
                        </div>
                      </div>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between border-b border-gray-200 pb-1">
                          <span className="font-medium">{t.cashierLabel}:</span>
                          <span>{currentStaff}</span>
                        </div>
                        <div className="flex justify-between border-b border-gray-200 pb-1">
                          <span className="font-medium">{t.cashRegister}:</span>
                          <span>{tm('posCashRegister1')}</span>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-6 mb-6">
                      <div className="bg-blue-50 border border-blue-200 p-4">
                        <h3 className="font-bold mb-3 text-blue-900">{tm('reportsSalesSummarySection')}</h3>
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span>{tm('posTotalSalesCount')}</span>
                            <span className="font-medium">{positiveSales.length}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>{tm('posGrossSalesLabel')}</span>
                            <span className="font-medium">{formatNumber(totalSales, 2, false)}</span>
                          </div>
                          <div className="flex justify-between text-red-600">
                            <span>{tm('posReturnTotalLabel')}</span>
                            <span className="font-medium">-{formatNumber(returnTotal, 2, false)}</span>
                          </div>
                          <div className="flex justify-between pt-2 border-t border-blue-300 font-bold">
                            <span>{tm('posNetSalesLabel')}</span>
                            <span>{formatNumber(netSales, 2, false)}</span>
                          </div>
                        </div>
                      </div>

                      <div className="bg-green-50 border border-green-200 p-4">
                        <h3 className="font-bold mb-3 text-green-900">{tm('posPaymentMethodsCaps')}</h3>
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span>{tm('posCashSalesLabel')} ({paymentBreakdown.cashCount}):</span>
                            <span className="font-medium">{formatNumber(cashTotal, 2, false)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>{t.creditCard} ({paymentBreakdown.cardCount}):</span>
                            <span className="font-medium">{formatNumber(cardTotal, 2, false)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>{tm('posCreditAccount')} ({paymentBreakdown.creditCount}):</span>
                            <span className="font-medium">{formatNumber(creditTotal, 2, false)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>{t.other} ({paymentBreakdown.otherCount}):</span>
                            <span className="font-medium">{formatNumber(otherTotal, 2, false)}</span>
                          </div>
                          <div className="flex justify-between pt-2 border-t border-green-300 font-bold">
                            <span>{tm('posTotalCollection')}</span>
                            <span>{formatNumber(cashTotal + cardTotal + creditTotal + otherTotal, 2, false)}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {cashierStats.length > 0 && (
                      <div className="bg-indigo-50 border border-indigo-200 p-4 mb-6">
                        <h3 className="font-bold mb-3 text-indigo-900">{tm('posCashierStaffTurnover')}</h3>
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-left text-xs font-semibold text-indigo-800 border-b border-indigo-200">
                              <th className="py-1 pr-2">{t.cashier}</th>
                              <th className="py-1 pr-2 text-right">{tm('posReceiptCountCol')}</th>
                              <th className="py-1 pr-2 text-right">{tm('posNetTurnoverCol')}</th>
                              <th className="py-1 pr-2 text-right">{t.cashLabel}</th>
                              <th className="py-1 text-right">{t.cardLabel}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {cashierStats.map((c) => (
                              <tr key={c.name} className="border-b border-indigo-100 last:border-0 text-gray-900">
                                <td className="py-1.5 pr-2 font-medium">{c.name}</td>
                                <td className="py-1.5 pr-2 text-right tabular-nums">{c.salesCount}</td>
                                <td className="py-1.5 pr-2 text-right tabular-nums font-bold">{formatNumber(c.netRevenue, 2, false)}</td>
                                <td className="py-1.5 pr-2 text-right tabular-nums">{formatNumber(c.cashTotal, 2, false)}</td>
                                <td className="py-1.5 text-right tabular-nums">{formatNumber(c.cardTotal, 2, false)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    <div className="bg-orange-50 border border-orange-200 p-4 mb-6">
                      <h3 className="font-bold mb-3 text-orange-900">{tm('posCashStatusCaps')}</h3>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span>{tm('posOpeningCashLabel')}</span>
                            <span className="font-medium">{formatNumber(openingCash, 2, false)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>{tm('posCashSalesLabel')}:</span>
                            <span className="font-medium">{formatNumber(cashTotal, 2, false)}</span>
                          </div>
                          <div className="flex justify-between font-bold">
                            <span>{tm('posExpectedCashLabel')}</span>
                            <span>{formatNumber(expectedCash, 2, false)}</span>
                          </div>
                        </div>
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between font-bold">
                            <span>{tm('posCountedCashLabel')}</span>
                            <span>{formatNumber(actualCash, 2, false)}</span>
                          </div>
                          <div className="flex justify-between text-lg font-bold pt-2 border-t border-orange-300">
                            <span>{tm('posDifferenceCaps')}</span>
                            <span className={difference > 0 ? 'text-blue-700' : difference < 0 ? 'text-red-700' : 'text-green-700'}>
                              {difference > 0 ? '+' : ''}{formatNumber(difference, 2, false)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {note && (
                      <div className="bg-gray-50 border border-gray-200 p-4 mb-6">
                        <h3 className="font-bold mb-2">{tm('posNoteCaps')}</h3>
                        <p className="text-sm">{note}</p>
                      </div>
                    )}

                    <div className="mt-8 pt-4 border-t border-gray-300">
                      <div className="flex justify-between text-sm text-gray-600">
                        <div>{tm('posCashierSign')} _______________</div>
                        <div>{tm('posManagerSign')} _______________</div>
                      </div>
                    </div>

                    <div className="text-center text-xs text-gray-500 mt-6">
                      {tm('posStoreSalesMgmtWithBrand')}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-gray-200 bg-gray-50 flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2.5 text-sm bg-gray-200 text-gray-700 hover:bg-gray-300 transition-colors"
            >
              Geri
            </button>
            <button
              onClick={onPrint}
              className="flex-1 px-4 py-2.5 text-sm bg-blue-600 text-white hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
            >
              <Printer className="w-4 h-4" />
              {t.print}
            </button>
          </div>
        </div>
      </ModalLayer>

      {/* Print Version - Only Prints */}
      <div className="hidden print:block">
        <style dangerouslySetInnerHTML={{__html: `
          @media print {
            * {
              visibility: hidden;
            }
            #print-content, #print-content * {
              visibility: visible;
            }
            #print-content {
              position: absolute;
              left: 0;
              top: 0;
              width: 100%;
            }
            @page {
              size: ${printFormat === '80mm' ? '80mm 297mm' : 'A4 portrait'};
              margin: ${printFormat === '80mm' ? '5mm' : '10mm'};
            }
            body {
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
              background: white !important;
            }
          }
        `}} />
        <div id="print-content" className={printFormat === '80mm' ? 'max-w-[80mm]' : 'max-w-[210mm]'}>
          {printFormat === '80mm' ? (
            /* 80mm Print */
            <div className="font-mono text-xs p-2">
              <div className="text-center mb-3">
                <div className="text-base font-bold">ExRetailOS</div>
                <div className="text-xs">{tm('posStoreSalesSystem')}</div>
                <div className="border-t border-b border-dashed border-black my-2 py-1">
                  {tm('posCashCloseReport')}
                </div>
              </div>

              <div className="space-y-0.5 mb-2">
                <div className="flex justify-between text-[10px]"><span>{t.dateLabel}:</span><span>{new Date().toLocaleDateString('tr-TR')}</span></div>
                <div className="flex justify-between text-[10px]"><span>{t.timeLabel}:</span><span>{new Date().toLocaleTimeString('tr-TR')}</span></div>
                <div className="flex justify-between text-[10px]"><span>{t.cashierLabel}:</span><span>{currentStaff}</span></div>
                <div className="flex justify-between text-[10px]"><span>{t.cashRegister}:</span><span>{tm('posCashRegister1')}</span></div>
              </div>

              <div className="border-t border-dashed border-black my-2"></div>
              <div className="font-bold text-[10px] mb-1">{tm('reportsSalesSummarySection')}</div>
              <div className="space-y-0.5 mb-2 text-[10px]">
                <div className="flex justify-between"><span>{tm('posSalesCountLabel')}</span><span>{positiveSales.length}</span></div>
                <div className="flex justify-between"><span>{tm('posGrossSalesLabel')}</span><span>{formatNumber(totalSales, 2, false)}</span></div>
                <div className="flex justify-between"><span>{t.return}:</span><span>-{formatNumber(returnTotal, 2, false)}</span></div>
                <div className="flex justify-between font-bold"><span>{tm('posNetSalesLabel')}</span><span>{formatNumber(netSales, 2, false)}</span></div>
              </div>

              <div className="border-t border-dashed border-black my-2"></div>
              <div className="font-bold text-[10px] mb-1">{tm('posPaymentMethodsCaps')}</div>
              <div className="space-y-0.5 mb-2 text-[10px]">
                <div className="flex justify-between"><span>{t.cashLabel} ({paymentBreakdown.cashCount}):</span><span>{formatNumber(cashTotal, 2, false)}</span></div>
                <div className="flex justify-between"><span>{tm('posCreditCardShort')} ({paymentBreakdown.cardCount}):</span><span>{formatNumber(cardTotal, 2, false)}</span></div>
                <div className="flex justify-between"><span>{tm('veresiye')} ({paymentBreakdown.creditCount}):</span><span>{formatNumber(creditTotal, 2, false)}</span></div>
                <div className="flex justify-between"><span>{t.other} ({paymentBreakdown.otherCount}):</span><span>{formatNumber(otherTotal, 2, false)}</span></div>
                <div className="flex justify-between font-bold"><span>{t.total}:</span><span>{formatNumber(cashTotal + cardTotal + creditTotal + otherTotal, 2, false)}</span></div>
              </div>

              {cashierStats.length > 0 && (
                <>
                  <div className="border-t border-dashed border-black my-2"></div>
                  <div className="font-bold text-[10px] mb-1">{tm('posCashierTurnoverShort')}</div>
                  <div className="space-y-1 mb-2 text-[10px]">
                    {cashierStats.map((c) => (
                      <div key={c.name}>
                        <div className="flex justify-between font-bold"><span>{c.name}</span><span>{tm('posReceiptCountSuffix').replace('{count}', String(c.salesCount))}</span></div>
                        <div className="flex justify-between"><span>{tm('posNetShort')}</span><span>{formatNumber(c.netRevenue, 2, false)}</span></div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              <div className="border-t border-dashed border-black my-2"></div>
              <div className="font-bold text-[10px] mb-1">{tm('posCashStatusCaps')}</div>
              <div className="space-y-0.5 mb-2 text-[10px]">
                <div className="flex justify-between"><span>{tm('posOpeningShort')}</span><span>{formatNumber(openingCash, 2, false)}</span></div>
                <div className="flex justify-between"><span>{tm('posCashSaleShort')}</span><span>{formatNumber(cashTotal, 2, false)}</span></div>
                <div className="flex justify-between font-bold"><span>{tm('posExpectedLabel')}</span><span>{formatNumber(expectedCash, 2, false)}</span></div>
                <div className="flex justify-between font-bold"><span>{tm('posCountedLabel')}</span><span>{formatNumber(actualCash, 2, false)}</span></div>
                <div className="flex justify-between font-bold text-xs"><span>{tm('posDifferenceCaps')}</span><span>{difference > 0 ? '+' : ''}{formatNumber(difference, 2, false)}</span></div>
              </div>

              {note && (
                <>
                  <div className="border-t border-dashed border-black my-2"></div>
                  <div className="mb-2 text-[10px]">
                    <div className="font-bold mb-0.5">{tm('posNoteCaps')}</div>
                    <div>{note}</div>
                  </div>
                </>
              )}

              <div className="border-t border-dashed border-black my-2"></div>
              <div className="text-center text-[9px]">
                <div>ExRetailOS</div>
                <div>{tm('posStoreSalesMgmtSystem')}</div>
              </div>
            </div>
          ) : (
            /* A4 Print - same as preview */
            <div className="p-8">
              <div className="text-center mb-6">
                <h1 className="text-2xl font-bold mb-2">ExRetailOS</h1>
                <p className="text-sm text-gray-600">{tm('posStoreSalesMgmtSystem')}</p>
                <h2 className="text-xl font-bold mt-4 border-t border-b border-gray-300 py-2">
                  {tm('posCashCloseReport')}
                </h2>
              </div>

              <div className="grid grid-cols-2 gap-6 mb-6">
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between border-b border-gray-200 pb-1">
                    <span className="font-medium">{t.dateLabel}:</span>
                    <span>{new Date().toLocaleDateString('tr-TR')}</span>
                  </div>
                  <div className="flex justify-between border-b border-gray-200 pb-1">
                    <span className="font-medium">{t.timeLabel}:</span>
                    <span>{new Date().toLocaleTimeString('tr-TR')}</span>
                  </div>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between border-b border-gray-200 pb-1">
                    <span className="font-medium">{t.cashierLabel}:</span>
                    <span>{currentStaff}</span>
                  </div>
                  <div className="flex justify-between border-b border-gray-200 pb-1">
                    <span className="font-medium">{t.cashRegister}:</span>
                    <span>{tm('posCashRegister1')}</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6 mb-6">
                <div className="bg-blue-50 border border-blue-200 p-4">
                  <h3 className="font-bold mb-3 text-blue-900">{tm('reportsSalesSummarySection')}</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between"><span>{tm('posTotalSalesCount')}</span><span className="font-medium">{positiveSales.length}</span></div>
                    <div className="flex justify-between"><span>{tm('posGrossSalesLabel')}</span><span className="font-medium">{formatNumber(totalSales, 2, false)}</span></div>
                    <div className="flex justify-between text-red-600"><span>{tm('posReturnTotalLabel')}</span><span className="font-medium">-{formatNumber(returnTotal, 2, false)}</span></div>
                    <div className="flex justify-between pt-2 border-t border-blue-300 font-bold"><span>{tm('posNetSalesLabel')}</span><span>{formatNumber(netSales, 2, false)}</span></div>
                  </div>
                </div>

                <div className="bg-green-50 border border-green-200 p-4">
                  <h3 className="font-bold mb-3 text-green-900">{tm('posPaymentMethodsCaps')}</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between"><span>{tm('posCashSalesLabel')} ({paymentBreakdown.cashCount}):</span><span className="font-medium">{formatNumber(cashTotal, 2, false)}</span></div>
                    <div className="flex justify-between"><span>{t.creditCard} ({paymentBreakdown.cardCount}):</span><span className="font-medium">{formatNumber(cardTotal, 2, false)}</span></div>
                    <div className="flex justify-between"><span>{tm('veresiye')} ({paymentBreakdown.creditCount}):</span><span className="font-medium">{formatNumber(creditTotal, 2, false)}</span></div>
                    <div className="flex justify-between"><span>{t.other} ({paymentBreakdown.otherCount}):</span><span className="font-medium">{formatNumber(otherTotal, 2, false)}</span></div>
                    <div className="flex justify-between pt-2 border-t border-green-300 font-bold"><span>{tm('posTotalCollection')}</span><span>{formatNumber(cashTotal + cardTotal + creditTotal + otherTotal, 2, false)}</span></div>
                  </div>
                </div>
              </div>

              {cashierStats.length > 0 && (
                <div className="bg-indigo-50 border border-indigo-200 p-4 mb-6">
                  <h3 className="font-bold mb-3 text-indigo-900">{tm('posCashierStaffTurnover')}</h3>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs font-semibold text-indigo-800 border-b border-indigo-200">
                        <th className="py-1 pr-2">{t.cashier}</th>
                        <th className="py-1 pr-2 text-right">{tm('posReceiptCountCol')}</th>
                        <th className="py-1 pr-2 text-right">{tm('posNetTurnoverCol')}</th>
                        <th className="py-1 text-right">{tm('posCashCard')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cashierStats.map((c) => (
                        <tr key={c.name} className="border-b border-indigo-100 last:border-0">
                          <td className="py-1.5 pr-2 font-medium">{c.name}</td>
                          <td className="py-1.5 pr-2 text-right">{c.salesCount}</td>
                          <td className="py-1.5 pr-2 text-right font-bold">{formatNumber(c.netRevenue, 2, false)}</td>
                          <td className="py-1.5 text-right">{formatNumber(c.cashTotal, 2, false)} / {formatNumber(c.cardTotal, 2, false)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="bg-orange-50 border border-orange-200 p-4 mb-6">
                <h3 className="font-bold mb-3 text-orange-900">{tm('posCashStatusCaps')}</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between"><span>{tm('posOpeningCashLabel')}</span><span className="font-medium">{formatNumber(openingCash, 2, false)}</span></div>
                    <div className="flex justify-between"><span>{tm('posCashSalesLabel')}:</span><span className="font-medium">{formatNumber(cashTotal, 2, false)}</span></div>
                    <div className="flex justify-between font-bold"><span>{tm('posExpectedCashLabel')}</span><span>{formatNumber(expectedCash, 2, false)}</span></div>
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between font-bold"><span>{tm('posCountedCashLabel')}</span><span>{formatNumber(actualCash, 2, false)}</span></div>
                    <div className="flex justify-between text-lg font-bold pt-2 border-t border-orange-300">
                      <span>{tm('posDifferenceCaps')}</span>
                      <span className={difference > 0 ? 'text-blue-700' : difference < 0 ? 'text-red-700' : 'text-green-700'}>
                        {difference > 0 ? '+' : ''}{formatNumber(difference, 2, false)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {note && (
                <div className="bg-gray-50 border border-gray-200 p-4 mb-6">
                  <h3 className="font-bold mb-2">{tm('posNoteCaps')}</h3>
                  <p className="text-sm">{note}</p>
                </div>
              )}

              <div className="mt-8 pt-4 border-t border-gray-300">
                <div className="flex justify-between text-sm text-gray-600">
                  <div>{tm('posCashierSign')} _______________</div>
                  <div>{tm('posManagerSign')} _______________</div>
                </div>
              </div>

              <div className="text-center text-xs text-gray-500 mt-6">
                {tm('posStoreSalesMgmtWithBrand')}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
