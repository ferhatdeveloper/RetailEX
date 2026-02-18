/**
 * Report AI Service
 * Rapor verilerine göre soruları analiz edip cevaplar üretir
 */

import type { Sale, Product } from '../App';
import { formatNumber } from '../utils/formatNumber';

interface ReportData {
  sales: Sale[];
  products: Product[];
  dailySales: Sale[];
  dailyTotal: number;
  dailyCash: number;
  dailyCard: number;
  productSales: Array<{
    product: Product;
    quantity: number;
    revenue: number;
  }>;
  cashierPerformance: Array<{
    name: string;
    salesCount: number;
    totalRevenue: number;
  }>;
  categoryAnalysis: Array<{
    name: string;
    totalRevenue: number;
    totalQuantity: number;
  }>;
  hourlyAnalysis: Array<{
    hour: number;
    sales: number;
    revenue: number;
  }>;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface AIResponse {
  answer: string;
  suggestedReports?: string[];
  data?: any;
}

/**
 * Soruyu analiz et ve anahtar kelimeleri çıkar
 */
function analyzeQuestion(question: string): {
  intent: string;
  keywords: string[];
  dateRange?: { start?: string; end?: string };
} {
  const lowerQuestion = question.toLowerCase();
  const keywords: string[] = [];
  let intent = 'general';
  const dateRange: { start?: string; end?: string } = {};

  // Tarih aralığı tespiti
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const lastWeek = new Date(today);
  lastWeek.setDate(lastWeek.getDate() - 7);
  const lastMonth = new Date(today);
  lastMonth.setMonth(lastMonth.getMonth() - 1);

  if (lowerQuestion.includes('bugün') || lowerQuestion.includes('günlük')) {
    dateRange.start = today.toISOString().split('T')[0];
    dateRange.end = today.toISOString().split('T')[0];
    keywords.push('bugün', 'günlük');
  }
  if (lowerQuestion.includes('dün')) {
    dateRange.start = yesterday.toISOString().split('T')[0];
    dateRange.end = yesterday.toISOString().split('T')[0];
    keywords.push('dün');
  }
  if (lowerQuestion.includes('bu hafta') || lowerQuestion.includes('haftalık')) {
    dateRange.start = lastWeek.toISOString().split('T')[0];
    dateRange.end = today.toISOString().split('T')[0];
    keywords.push('hafta');
  }
  if (lowerQuestion.includes('bu ay') || lowerQuestion.includes('aylık')) {
    dateRange.start = lastMonth.toISOString().split('T')[0];
    dateRange.end = today.toISOString().split('T')[0];
    keywords.push('ay');
  }

  // Intent tespiti
  if (lowerQuestion.includes('toplam') || lowerQuestion.includes('ciro') || lowerQuestion.includes('gelir')) {
    intent = 'revenue';
    keywords.push('ciro', 'gelir', 'toplam');
  }
  if (lowerQuestion.includes('ürün') || lowerQuestion.includes('satış')) {
    intent = 'product';
    keywords.push('ürün', 'satış');
  }
  if (lowerQuestion.includes('kasiyer') || lowerQuestion.includes('personel')) {
    intent = 'cashier';
    keywords.push('kasiyer', 'personel');
  }
  if (lowerQuestion.includes('kategori')) {
    intent = 'category';
    keywords.push('kategori');
  }
  if (lowerQuestion.includes('saat') || lowerQuestion.includes('zaman')) {
    intent = 'hourly';
    keywords.push('saat', 'zaman');
  }
  if (lowerQuestion.includes('stok') || lowerQuestion.includes('envanter')) {
    intent = 'stock';
    keywords.push('stok', 'envanter');
  }
  if (lowerQuestion.includes('müşteri')) {
    intent = 'customer';
    keywords.push('müşteri');
  }
  if (lowerQuestion.includes('indirim')) {
    intent = 'discount';
    keywords.push('indirim');
  }
  if (lowerQuestion.includes('kar') || lowerQuestion.includes('zarar')) {
    intent = 'profit';
    keywords.push('kar', 'zarar');
  }
  if (lowerQuestion.includes('en çok') || lowerQuestion.includes('en iyi') || lowerQuestion.includes('top')) {
    intent = 'top';
    keywords.push('en çok', 'top');
  }

  return { intent, keywords, dateRange };
}

/**
 * Rapor verilerine göre cevap üret
 * ChatGPT entegrasyonu ile gerçek analiz yapar
 */
export async function generateAIResponse(
  question: string,
  reportData: ReportData,
  conversationHistory: ChatMessage[] = [],
  useChatGPT: boolean = true
): Promise<AIResponse> {
  // ChatGPT kullanılabilirse önce onu dene
  if (useChatGPT) {
    try {
      // Dinamik import - circular dependency önlemek için
      const { analyzeReportWithChatGPT } = await import('./openaiService');
      const chatGPTResponse = await analyzeReportWithChatGPT(question, reportData, conversationHistory);

      return {
        answer: chatGPTResponse.answer,
        suggestedReports: chatGPTResponse.suggested_reports || [],
        data: chatGPTResponse.data_summary
      };
    } catch (error: any) {
      // ChatGPT başarısız olursa fallback'e geç
      console.warn('[ReportAI] ChatGPT kullanılamadı, fallback kullanılıyor:', error.message);
      // Fallback ile devam et
    }
  }

  // Fallback: Basit analiz (ChatGPT yoksa veya başarısız olursa)
  const analysis = analyzeQuestion(question);
  let answer = '';
  let suggestedReports: string[] = [];
  let data: any = null;

  try {
    switch (analysis.intent) {
      case 'revenue':
        answer = generateRevenueAnswer(question, reportData, analysis);
        suggestedReports = ['Günlük Rapor', 'Z Raporu', 'Karşılaştırma'];
        break;

      case 'product':
        answer = generateProductAnswer(question, reportData, analysis);
        suggestedReports = ['Top Ürünler', 'Ürün Satış Analizi', 'Kategori Analizi'];
        data = reportData.productSales.slice(0, 10);
        break;

      case 'cashier':
        answer = generateCashierAnswer(question, reportData, analysis);
        suggestedReports = ['Kasiyer Performansı'];
        data = reportData.cashierPerformance;
        break;

      case 'category':
        answer = generateCategoryAnswer(question, reportData, analysis);
        suggestedReports = ['Kategori Analizi'];
        data = reportData.categoryAnalysis;
        break;

      case 'hourly':
        answer = generateHourlyAnswer(question, reportData, analysis);
        suggestedReports = ['Saatlik Analiz'];
        data = reportData.hourlyAnalysis;
        break;

      case 'stock':
        answer = generateStockAnswer(question, reportData, analysis);
        suggestedReports = ['Stok Durumu'];
        break;

      case 'top':
        answer = generateTopAnswer(question, reportData, analysis);
        suggestedReports = ['Top Ürünler', 'Kasiyer Performansı', 'Kategori Analizi'];
        break;

      default:
        answer = generateGeneralAnswer(question, reportData, analysis);
        suggestedReports = ['Günlük Rapor', 'Z Raporu'];
    }

    return {
      answer,
      suggestedReports,
      data
    };
  } catch (error) {
    console.error('AI Response generation error:', error);
    return {
      answer: 'Üzgünüm, bu soruyu şu anda cevaplayamıyorum. Lütfen daha spesifik bir soru sorun veya raporlar sekmesinden ilgili raporu inceleyin.',
      suggestedReports: ['Günlük Rapor', 'Z Raporu']
    };
  }
}

function generateRevenueAnswer(question: string, reportData: ReportData, analysis: any): string {
  const { dailyTotal, dailyCash, dailyCard, dailySales } = reportData;
  const totalSales = reportData.sales.length;
  const totalRevenue = reportData.sales.reduce((sum, s) => sum + s.total, 0);

  if (question.toLowerCase().includes('bugün') || question.toLowerCase().includes('günlük')) {
    return `Bugünkü satış özeti:\n\n` +
      `📊 Toplam Satış: ${dailySales.length} işlem\n` +
      `💰 Toplam Ciro: ${formatNumber(dailyTotal, 2, false)} IQD\n` +
      `💵 Nakit: ${formatNumber(dailyCash, 2, false)} IQD\n` +
      `💳 Kart: ${formatNumber(dailyCard, 2, false)} IQD\n` +
      `📈 Ortalama Satış: ${dailySales.length > 0 ? formatNumber(dailyTotal / dailySales.length, 2, false) + ' IQD' : '0 IQD'}`;
  }

  return `Genel satış özeti:\n\n` +
    `📊 Toplam Satış: ${totalSales} işlem\n` +
    `💰 Toplam Ciro: ${formatNumber(totalRevenue, 2, false)} IQD\n` +
    `📈 Ortalama Satış: ${totalSales > 0 ? formatNumber(totalRevenue / totalSales, 2, false) + ' IQD' : '0 IQD'}`;
}

function generateProductAnswer(question: string, reportData: ReportData, analysis: any): string {
  const topProducts = reportData.productSales
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

  if (question.toLowerCase().includes('en çok') || question.toLowerCase().includes('top')) {
    let answer = 'En çok satan ürünler:\n\n';
    topProducts.forEach((item, index) => {
      answer += `${index + 1}. ${item.product.name}\n`;
      answer += `   📦 Satış: ${item.quantity} adet\n`;
      answer += `   💰 Ciro: ${formatNumber(item.revenue, 2, false)} IQD\n\n`;
    });
    return answer;
  }

  return `Ürün satış analizi:\n\n` +
    `📦 Toplam Ürün: ${reportData.products.length} adet\n` +
    `💰 Toplam Ürün Ciro: ${formatNumber(reportData.productSales.reduce((sum, p) => sum + p.revenue, 0), 2, false)} IQD\n` +
    `📊 En çok satan ürün: ${topProducts[0]?.product.name || 'N/A'}`;
}

function generateCashierAnswer(question: string, reportData: ReportData, analysis: any): string {
  const topCashier = reportData.cashierPerformance
    .sort((a, b) => b.totalRevenue - a.totalRevenue)[0];

  if (!topCashier) {
    return 'Kasiyer performans verisi bulunamadı.';
  }

  return `Kasiyer performans özeti:\n\n` +
    `🏆 En iyi performans: ${topCashier.name}\n` +
    `💰 Toplam Ciro: ${formatNumber(topCashier.totalRevenue, 2, false)} IQD\n` +
    `📊 İşlem Sayısı: ${topCashier.salesCount}\n` +
    `📈 Ortalama Satış: ${formatNumber(topCashier.totalRevenue / topCashier.salesCount, 2, false)} IQD\n\n` +
    `Toplam ${reportData.cashierPerformance.length} kasiyer aktif.`;
}

function generateCategoryAnswer(question: string, reportData: ReportData, analysis: any): string {
  const topCategory = reportData.categoryAnalysis
    .sort((a, b) => b.totalRevenue - a.totalRevenue)[0];

  if (!topCategory) {
    return 'Kategori analiz verisi bulunamadı.';
  }

  return `Kategori analiz özeti:\n\n` +
    `🏆 En çok satan kategori: ${topCategory.name}\n` +
    `💰 Ciro: ${formatNumber(topCategory.totalRevenue, 2, false)} IQD\n` +
    `📦 Satış Adedi: ${topCategory.totalQuantity} adet\n\n` +
    `Toplam ${reportData.categoryAnalysis.length} kategori aktif.`;
}

function generateHourlyAnswer(question: string, reportData: ReportData, analysis: any): string {
  const peakHour = reportData.hourlyAnalysis
    .sort((a, b) => b.revenue - a.revenue)[0];

  if (!peakHour) {
    return 'Saatlik analiz verisi bulunamadı.';
  }

  return `Saatlik satış analizi:\n\n` +
    `⏰ En yoğun saat: ${peakHour.hour}:00\n` +
    `💰 Ciro: ${formatNumber(peakHour.revenue, 2, false)} IQD\n` +
    `📊 Satış Sayısı: ${peakHour.sales} işlem`;
}

function generateStockAnswer(question: string, reportData: ReportData, analysis: any): string {
  const lowStock = reportData.products.filter(p => (p.stock || 0) < 30);
  const outOfStock = reportData.products.filter(p => (p.stock || 0) === 0);

  return `Stok durumu:\n\n` +
    `📦 Toplam Ürün: ${reportData.products.length} adet\n` +
    `⚠️ Düşük Stok: ${lowStock.length} ürün\n` +
    `❌ Tükenen: ${outOfStock.length} ürün\n` +
    `✅ Normal Stok: ${reportData.products.length - lowStock.length} ürün`;
}

function generateTopAnswer(question: string, reportData: ReportData, analysis: any): string {
  if (question.toLowerCase().includes('ürün')) {
    return generateProductAnswer(question, reportData, analysis);
  }
  if (question.toLowerCase().includes('kasiyer')) {
    return generateCashierAnswer(question, reportData, analysis);
  }
  if (question.toLowerCase().includes('kategori')) {
    return generateCategoryAnswer(question, reportData, analysis);
  }

  return 'Lütfen daha spesifik bir soru sorun. Örneğin: "En çok satan ürünler neler?" veya "En iyi performans gösteren kasiyer kim?"';
}

function generateGeneralAnswer(question: string, reportData: ReportData, analysis: any): string {
  return `Merhaba! Size nasıl yardımcı olabilirim?\n\n` +
    `Raporlar hakkında sorular sorabilirsiniz:\n` +
    `• "Bugünkü satışlar nasıl?"\n` +
    `• "En çok satan ürünler neler?"\n` +
    `• "Kasiyer performansı nasıl?"\n` +
    `• "Stok durumu nedir?"\n` +
    `• "Kategori analizi göster"\n\n` +
    `Daha detaylı bilgi için raporlar sekmesini kullanabilirsiniz.`;
}

/**
 * Chat geçmişini yönet
 */
export class ChatHistory {
  private messages: ChatMessage[] = [];

  addMessage(role: 'user' | 'assistant', content: string) {
    this.messages.push({
      role,
      content,
      timestamp: new Date()
    });
  }

  getMessages(): ChatMessage[] {
    return this.messages;
  }

  clear() {
    this.messages = [];
  }

  getLastN(n: number): ChatMessage[] {
    return this.messages.slice(-n);
  }
}


