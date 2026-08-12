import { X, Printer } from 'lucide-react';
import type { Sale } from '../../core/types';
import { formatNumber } from '../../utils/formatNumber';
import { aggregatePosPayments, buildPosZReport } from '../../utils/posZReport';
import type { PosCashSession, PosSessionCashBreakdown } from '../../utils/posCashSession';

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
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[70] p-4 print:hidden">
        <div className="bg-white w-full max-w-4xl shadow-2xl max-h-[90vh] overflow-hidden flex flex-col">
          {/* Header */}
          <div className="p-4 border-b border-gray-200 bg-gradient-to-r from-blue-600 to-blue-700 flex items-center justify-between">
            <h3 className="text-lg text-white flex items-center gap-2">
              <Printer className="w-6 h-6" />
              Yazdırma Önizlemesi
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
            <h4 className="text-sm font-medium text-gray-700 mb-3">Yazdırma Formatı Seçin:</h4>
            <div className="flex gap-3">
              <button
                onClick={() => setPrintFormat('80mm')}
                className={`flex-1 px-6 py-4 border-2 transition-all ${
                  printFormat === '80mm'
                    ? 'border-blue-600 bg-blue-50 text-blue-700'
                    : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'
                }`}
              >
                <div className="font-medium mb-1">80mm Termal Fiş</div>
                <div className="text-xs text-gray-500">Fiş yazıcısı için ideal</div>
              </button>
              <button
                onClick={() => setPrintFormat('a4')}
                className={`flex-1 px-6 py-4 border-2 transition-all ${
                  printFormat === 'a4'
                    ? 'border-blue-600 bg-blue-50 text-blue-700'
                    : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'
                }`}
              >
                <div className="font-medium mb-1">A4 Sayfa</div>
                <div className="text-xs text-gray-500">Klasör arşivleme için</div>
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
                      <div className="text-xs">Mağaza Satış Sistemi</div>
                      <div className="border-t border-b border-dashed border-gray-400 my-2 py-1">
                        KASA KAPATMA RAPORU
                      </div>
                    </div>

                    <div className="space-y-1 mb-3">
                      <div className="flex justify-between">
                        <span>Tarih:</span>
                        <span>{new Date().toLocaleDateString('tr-TR')}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Saat:</span>
                        <span>{new Date().toLocaleTimeString('tr-TR')}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Kasiyer:</span>
                        <span>{currentStaff}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Kasa:</span>
                        <span>KASA #1</span>
                      </div>
                    </div>

                    <div className="border-t border-dashed border-gray-400 my-2"></div>

                    <div className="font-bold mb-1">SATIŞ ÖZETİ</div>
                    <div className="space-y-1 mb-3">
                      <div className="flex justify-between">
                        <span>Satış Adedi:</span>
                        <span>{positiveSales.length}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Brüt Satış:</span>
                        <span>{formatNumber(totalSales, 2, false)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>İade:</span>
                        <span>-{formatNumber(returnTotal, 2, false)}</span>
                      </div>
                      <div className="flex justify-between font-bold">
                        <span>Net Satış:</span>
                        <span>{formatNumber(netSales, 2, false)}</span>
                      </div>
                    </div>

                    <div className="border-t border-dashed border-gray-400 my-2"></div>

                    <div className="font-bold mb-1">ÖDEME YÖNTEMLERİ</div>
                    <div className="space-y-1 mb-3">
                      <div className="flex justify-between">
                        <span>Nakit ({paymentBreakdown.cashCount}):</span>
                        <span>{formatNumber(cashTotal, 2, false)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>K.Kartı ({paymentBreakdown.cardCount}):</span>
                        <span>{formatNumber(cardTotal, 2, false)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Veresiye ({paymentBreakdown.creditCount}):</span>
                        <span>{formatNumber(creditTotal, 2, false)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Diğer ({paymentBreakdown.otherCount}):</span>
                        <span>{formatNumber(otherTotal, 2, false)}</span>
                      </div>
                      <div className="flex justify-between font-bold">
                        <span>Toplam:</span>
                        <span>{formatNumber(cashTotal + cardTotal + creditTotal + otherTotal, 2, false)}</span>
                      </div>
                    </div>

                    {cashierStats.length > 0 && (
                      <>
                        <div className="border-t border-dashed border-gray-400 my-2"></div>
                        <div className="font-bold mb-1">KASİYER / PERSONEL CİROSU</div>
                        <div className="space-y-2 mb-3">
                          {cashierStats.map((c) => (
                            <div key={c.name} className="text-xs border-b border-gray-200 pb-1 last:border-0">
                              <div className="flex justify-between font-semibold text-gray-900">
                                <span>{c.name}</span>
                                <span>{c.salesCount} fiş</span>
                              </div>
                              <div className="flex justify-between text-gray-800">
                                <span>Net ciro</span>
                                <span className="font-bold">{formatNumber(c.netRevenue, 2, false)}</span>
                              </div>
                              <div className="flex justify-between text-gray-600 text-[10px]">
                                <span>Nakit / Kart</span>
                                <span>{formatNumber(c.cashTotal, 2, false)} / {formatNumber(c.cardTotal, 2, false)}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </>
                    )}

                    <div className="border-t border-dashed border-gray-400 my-2"></div>

                    <div className="font-bold mb-1">KASA DURUMU{cashSession ? ' (OTURUM)' : ''}</div>
                    <div className="space-y-1 mb-3">
                      <div className="flex justify-between">
                        <span>Açılış / devir:</span>
                        <span>{formatNumber(bd.openingCash, 2, false)}</span>
                      </div>
                      {bd.handoverFrom && (
                        <div className="flex justify-between text-xs">
                          <span>Devreden: {bd.handoverFrom}</span>
                          {bd.handoverAmount != null && bd.handoverAmount > 0 && (
                            <span>{formatNumber(bd.handoverAmount, 2, false)}</span>
                          )}
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span>Oturum nakit satış:</span>
                        <span>{formatNumber(bd.sessionCashSales, 2, false)}</span>
                      </div>
                      {bd.sessionCashReturns > 0 && (
                        <div className="flex justify-between">
                          <span>Oturum nakit iade (-):</span>
                          <span>-{formatNumber(bd.sessionCashReturns, 2, false)}</span>
                        </div>
                      )}
                      <div className="flex justify-between font-bold">
                        <span>Beklenen:</span>
                        <span>{formatNumber(bd.expectedCash, 2, false)}</span>
                      </div>
                      <div className="flex justify-between font-bold">
                        <span>Sayılan:</span>
                        <span>{formatNumber(actualCash, 2, false)}</span>
                      </div>
                      <div className="flex justify-between font-bold text-base">
                        <span>FARK:</span>
                        <span>{difference > 0 ? '+' : ''}{formatNumber(difference, 2, false)}</span>
                      </div>
                    </div>

                    {note && (
                      <>
                        <div className="border-t border-dashed border-gray-400 my-2"></div>
                        <div className="mb-2">
                          <div className="font-bold mb-1">NOT:</div>
                          <div className="text-xs">{note}</div>
                        </div>
                      </>
                    )}

                    <div className="border-t border-dashed border-gray-400 my-2"></div>

                    <div className="text-center text-xs">
                      <div>ExRetailOS</div>
                      <div className="text-[10px]">Mağaza Satış Yönetim Sistemi</div>
                    </div>
                  </div>
                ) : (
                  /* A4 Format */
                  <div>
                    <div className="text-center mb-6">
                      <h1 className="text-2xl font-bold mb-2">ExRetailOS</h1>
                      <p className="text-sm text-gray-600">Mağaza Satış Yönetim Sistemi</p>
                      <h2 className="text-xl font-bold mt-4 border-t border-b border-gray-300 py-2">
                        KASA KAPATMA RAPORU
                      </h2>
                    </div>

                    <div className="grid grid-cols-2 gap-6 mb-6">
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between border-b border-gray-200 pb-1">
                          <span className="font-medium">Tarih:</span>
                          <span>{new Date().toLocaleDateString('tr-TR')}</span>
                        </div>
                        <div className="flex justify-between border-b border-gray-200 pb-1">
                          <span className="font-medium">Saat:</span>
                          <span>{new Date().toLocaleTimeString('tr-TR')}</span>
                        </div>
                      </div>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between border-b border-gray-200 pb-1">
                          <span className="font-medium">Kasiyer:</span>
                          <span>{currentStaff}</span>
                        </div>
                        <div className="flex justify-between border-b border-gray-200 pb-1">
                          <span className="font-medium">Kasa:</span>
                          <span>KASA #1</span>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-6 mb-6">
                      <div className="bg-blue-50 border border-blue-200 p-4">
                        <h3 className="font-bold mb-3 text-blue-900">SATIŞ ÖZETİ</h3>
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span>Toplam Satış Adedi:</span>
                            <span className="font-medium">{positiveSales.length}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Brüt Satış:</span>
                            <span className="font-medium">{formatNumber(totalSales, 2, false)}</span>
                          </div>
                          <div className="flex justify-between text-red-600">
                            <span>İade Toplamı:</span>
                            <span className="font-medium">-{formatNumber(returnTotal, 2, false)}</span>
                          </div>
                          <div className="flex justify-between pt-2 border-t border-blue-300 font-bold">
                            <span>Net Satış:</span>
                            <span>{formatNumber(netSales, 2, false)}</span>
                          </div>
                        </div>
                      </div>

                      <div className="bg-green-50 border border-green-200 p-4">
                        <h3 className="font-bold mb-3 text-green-900">ÖDEME YÖNTEMLERİ</h3>
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span>Nakit Satışlar ({paymentBreakdown.cashCount}):</span>
                            <span className="font-medium">{formatNumber(cashTotal, 2, false)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Kredi Kartı ({paymentBreakdown.cardCount}):</span>
                            <span className="font-medium">{formatNumber(cardTotal, 2, false)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Veresiye / Cari ({paymentBreakdown.creditCount}):</span>
                            <span className="font-medium">{formatNumber(creditTotal, 2, false)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Diğer ({paymentBreakdown.otherCount}):</span>
                            <span className="font-medium">{formatNumber(otherTotal, 2, false)}</span>
                          </div>
                          <div className="flex justify-between pt-2 border-t border-green-300 font-bold">
                            <span>Toplam Tahsilat:</span>
                            <span>{formatNumber(cashTotal + cardTotal + creditTotal + otherTotal, 2, false)}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {cashierStats.length > 0 && (
                      <div className="bg-indigo-50 border border-indigo-200 p-4 mb-6">
                        <h3 className="font-bold mb-3 text-indigo-900">KASİYER / PERSONEL CİROSU</h3>
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-left text-xs font-semibold text-indigo-800 border-b border-indigo-200">
                              <th className="py-1 pr-2">Kasiyer</th>
                              <th className="py-1 pr-2 text-right">Fiş</th>
                              <th className="py-1 pr-2 text-right">Net Ciro</th>
                              <th className="py-1 pr-2 text-right">Nakit</th>
                              <th className="py-1 text-right">Kart</th>
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
                      <h3 className="font-bold mb-3 text-orange-900">KASA DURUMU</h3>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span>Açılış Kasası:</span>
                            <span className="font-medium">{formatNumber(openingCash, 2, false)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Nakit Satışlar:</span>
                            <span className="font-medium">{formatNumber(cashTotal, 2, false)}</span>
                          </div>
                          <div className="flex justify-between font-bold">
                            <span>Beklenen Kasa:</span>
                            <span>{formatNumber(expectedCash, 2, false)}</span>
                          </div>
                        </div>
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between font-bold">
                            <span>Sayılan Kasa:</span>
                            <span>{formatNumber(actualCash, 2, false)}</span>
                          </div>
                          <div className="flex justify-between text-lg font-bold pt-2 border-t border-orange-300">
                            <span>FARK:</span>
                            <span className={difference > 0 ? 'text-blue-700' : difference < 0 ? 'text-red-700' : 'text-green-700'}>
                              {difference > 0 ? '+' : ''}{formatNumber(difference, 2, false)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {note && (
                      <div className="bg-gray-50 border border-gray-200 p-4 mb-6">
                        <h3 className="font-bold mb-2">NOT:</h3>
                        <p className="text-sm">{note}</p>
                      </div>
                    )}

                    <div className="mt-8 pt-4 border-t border-gray-300">
                      <div className="flex justify-between text-sm text-gray-600">
                        <div>Kasiyer İmzası: _______________</div>
                        <div>Yönetici İmzası: _______________</div>
                      </div>
                    </div>

                    <div className="text-center text-xs text-gray-500 mt-6">
                      ExRetailOS - Mağaza Satış Yönetim Sistemi
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
              Yazdır
            </button>
          </div>
        </div>
      </div>

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
                <div className="text-xs">Mağaza Satış Sistemi</div>
                <div className="border-t border-b border-dashed border-black my-2 py-1">
                  KASA KAPATMA RAPORU
                </div>
              </div>

              <div className="space-y-0.5 mb-2">
                <div className="flex justify-between text-[10px]"><span>Tarih:</span><span>{new Date().toLocaleDateString('tr-TR')}</span></div>
                <div className="flex justify-between text-[10px]"><span>Saat:</span><span>{new Date().toLocaleTimeString('tr-TR')}</span></div>
                <div className="flex justify-between text-[10px]"><span>Kasiyer:</span><span>{currentStaff}</span></div>
                <div className="flex justify-between text-[10px]"><span>Kasa:</span><span>KASA #1</span></div>
              </div>

              <div className="border-t border-dashed border-black my-2"></div>
              <div className="font-bold text-[10px] mb-1">SATIŞ ÖZETİ</div>
              <div className="space-y-0.5 mb-2 text-[10px]">
                <div className="flex justify-between"><span>Satış Adedi:</span><span>{positiveSales.length}</span></div>
                <div className="flex justify-between"><span>Brüt Satış:</span><span>{formatNumber(totalSales, 2, false)}</span></div>
                <div className="flex justify-between"><span>İade:</span><span>-{formatNumber(returnTotal, 2, false)}</span></div>
                <div className="flex justify-between font-bold"><span>Net Satış:</span><span>{formatNumber(netSales, 2, false)}</span></div>
              </div>

              <div className="border-t border-dashed border-black my-2"></div>
              <div className="font-bold text-[10px] mb-1">ÖDEME YÖNTEMLERİ</div>
              <div className="space-y-0.5 mb-2 text-[10px]">
                <div className="flex justify-between"><span>Nakit ({paymentBreakdown.cashCount}):</span><span>{formatNumber(cashTotal, 2, false)}</span></div>
                <div className="flex justify-between"><span>K.Kartı ({paymentBreakdown.cardCount}):</span><span>{formatNumber(cardTotal, 2, false)}</span></div>
                <div className="flex justify-between"><span>Veresiye ({paymentBreakdown.creditCount}):</span><span>{formatNumber(creditTotal, 2, false)}</span></div>
                <div className="flex justify-between"><span>Diğer ({paymentBreakdown.otherCount}):</span><span>{formatNumber(otherTotal, 2, false)}</span></div>
                <div className="flex justify-between font-bold"><span>Toplam:</span><span>{formatNumber(cashTotal + cardTotal + creditTotal + otherTotal, 2, false)}</span></div>
              </div>

              {cashierStats.length > 0 && (
                <>
                  <div className="border-t border-dashed border-black my-2"></div>
                  <div className="font-bold text-[10px] mb-1">KASİYER CİROSU</div>
                  <div className="space-y-1 mb-2 text-[10px]">
                    {cashierStats.map((c) => (
                      <div key={c.name}>
                        <div className="flex justify-between font-bold"><span>{c.name}</span><span>{c.salesCount} fiş</span></div>
                        <div className="flex justify-between"><span>Net</span><span>{formatNumber(c.netRevenue, 2, false)}</span></div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              <div className="border-t border-dashed border-black my-2"></div>
              <div className="font-bold text-[10px] mb-1">KASA DURUMU</div>
              <div className="space-y-0.5 mb-2 text-[10px]">
                <div className="flex justify-between"><span>Açılış:</span><span>{formatNumber(openingCash, 2, false)}</span></div>
                <div className="flex justify-between"><span>Nakit Satış:</span><span>{formatNumber(cashTotal, 2, false)}</span></div>
                <div className="flex justify-between font-bold"><span>Beklenen:</span><span>{formatNumber(expectedCash, 2, false)}</span></div>
                <div className="flex justify-between font-bold"><span>Sayılan:</span><span>{formatNumber(actualCash, 2, false)}</span></div>
                <div className="flex justify-between font-bold text-xs"><span>FARK:</span><span>{difference > 0 ? '+' : ''}{formatNumber(difference, 2, false)}</span></div>
              </div>

              {note && (
                <>
                  <div className="border-t border-dashed border-black my-2"></div>
                  <div className="mb-2 text-[10px]">
                    <div className="font-bold mb-0.5">NOT:</div>
                    <div>{note}</div>
                  </div>
                </>
              )}

              <div className="border-t border-dashed border-black my-2"></div>
              <div className="text-center text-[9px]">
                <div>ExRetailOS</div>
                <div>Mağaza Satış Yönetim Sistemi</div>
              </div>
            </div>
          ) : (
            /* A4 Print - same as preview */
            <div className="p-8">
              <div className="text-center mb-6">
                <h1 className="text-2xl font-bold mb-2">ExRetailOS</h1>
                <p className="text-sm text-gray-600">Mağaza Satış Yönetim Sistemi</p>
                <h2 className="text-xl font-bold mt-4 border-t border-b border-gray-300 py-2">
                  KASA KAPATMA RAPORU
                </h2>
              </div>

              <div className="grid grid-cols-2 gap-6 mb-6">
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between border-b border-gray-200 pb-1">
                    <span className="font-medium">Tarih:</span>
                    <span>{new Date().toLocaleDateString('tr-TR')}</span>
                  </div>
                  <div className="flex justify-between border-b border-gray-200 pb-1">
                    <span className="font-medium">Saat:</span>
                    <span>{new Date().toLocaleTimeString('tr-TR')}</span>
                  </div>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between border-b border-gray-200 pb-1">
                    <span className="font-medium">Kasiyer:</span>
                    <span>{currentStaff}</span>
                  </div>
                  <div className="flex justify-between border-b border-gray-200 pb-1">
                    <span className="font-medium">Kasa:</span>
                    <span>KASA #1</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6 mb-6">
                <div className="bg-blue-50 border border-blue-200 p-4">
                  <h3 className="font-bold mb-3 text-blue-900">SATIŞ ÖZETİ</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between"><span>Toplam Satış Adedi:</span><span className="font-medium">{positiveSales.length}</span></div>
                    <div className="flex justify-between"><span>Brüt Satış:</span><span className="font-medium">{formatNumber(totalSales, 2, false)}</span></div>
                    <div className="flex justify-between text-red-600"><span>İade Toplamı:</span><span className="font-medium">-{formatNumber(returnTotal, 2, false)}</span></div>
                    <div className="flex justify-between pt-2 border-t border-blue-300 font-bold"><span>Net Satış:</span><span>{formatNumber(netSales, 2, false)}</span></div>
                  </div>
                </div>

                <div className="bg-green-50 border border-green-200 p-4">
                  <h3 className="font-bold mb-3 text-green-900">ÖDEME YÖNTEMLERİ</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between"><span>Nakit Satışlar ({paymentBreakdown.cashCount}):</span><span className="font-medium">{formatNumber(cashTotal, 2, false)}</span></div>
                    <div className="flex justify-between"><span>Kredi Kartı ({paymentBreakdown.cardCount}):</span><span className="font-medium">{formatNumber(cardTotal, 2, false)}</span></div>
                    <div className="flex justify-between"><span>Veresiye ({paymentBreakdown.creditCount}):</span><span className="font-medium">{formatNumber(creditTotal, 2, false)}</span></div>
                    <div className="flex justify-between"><span>Diğer ({paymentBreakdown.otherCount}):</span><span className="font-medium">{formatNumber(otherTotal, 2, false)}</span></div>
                    <div className="flex justify-between pt-2 border-t border-green-300 font-bold"><span>Toplam Tahsilat:</span><span>{formatNumber(cashTotal + cardTotal + creditTotal + otherTotal, 2, false)}</span></div>
                  </div>
                </div>
              </div>

              {cashierStats.length > 0 && (
                <div className="bg-indigo-50 border border-indigo-200 p-4 mb-6">
                  <h3 className="font-bold mb-3 text-indigo-900">KASİYER / PERSONEL CİROSU</h3>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs font-semibold text-indigo-800 border-b border-indigo-200">
                        <th className="py-1 pr-2">Kasiyer</th>
                        <th className="py-1 pr-2 text-right">Fiş</th>
                        <th className="py-1 pr-2 text-right">Net Ciro</th>
                        <th className="py-1 text-right">Nakit / Kart</th>
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
                <h3 className="font-bold mb-3 text-orange-900">KASA DURUMU</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between"><span>Açılış Kasası:</span><span className="font-medium">{formatNumber(openingCash, 2, false)}</span></div>
                    <div className="flex justify-between"><span>Nakit Satışlar:</span><span className="font-medium">{formatNumber(cashTotal, 2, false)}</span></div>
                    <div className="flex justify-between font-bold"><span>Beklenen Kasa:</span><span>{formatNumber(expectedCash, 2, false)}</span></div>
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between font-bold"><span>Sayılan Kasa:</span><span>{formatNumber(actualCash, 2, false)}</span></div>
                    <div className="flex justify-between text-lg font-bold pt-2 border-t border-orange-300">
                      <span>FARK:</span>
                      <span className={difference > 0 ? 'text-blue-700' : difference < 0 ? 'text-red-700' : 'text-green-700'}>
                        {difference > 0 ? '+' : ''}{formatNumber(difference, 2, false)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {note && (
                <div className="bg-gray-50 border border-gray-200 p-4 mb-6">
                  <h3 className="font-bold mb-2">NOT:</h3>
                  <p className="text-sm">{note}</p>
                </div>
              )}

              <div className="mt-8 pt-4 border-t border-gray-300">
                <div className="flex justify-between text-sm text-gray-600">
                  <div>Kasiyer İmzası: _______________</div>
                  <div>Yönetici İmzası: _______________</div>
                </div>
              </div>

              <div className="text-center text-xs text-gray-500 mt-6">
                ExRetailOS - Mağaza Satış Yönetim Sistemi
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
