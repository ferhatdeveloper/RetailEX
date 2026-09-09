/**
 * Report AI Service
 * Rapor verilerine göre soruları analiz edip cevaplar üretir
 */

import type { Sale, Product } from '../App';
import { formatNumber } from '../utils/formatNumber';
import { translate, type Language } from '../locales/module-translations';

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

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface AIResponse {
  answer: string;
  suggestedReports?: string[];
  data?: any;
}

function t(key: string, lang: Language): string {
  return translate(key, lang);
}

function hasAny(q: string, words: string[]): boolean {
  return words.some((w) => q.includes(w));
}

/**
 * Soruyu analiz et — TR/EN/AR/KU anahtar kelimeler
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

  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const lastWeek = new Date(today);
  lastWeek.setDate(lastWeek.getDate() - 7);
  const lastMonth = new Date(today);
  lastMonth.setMonth(lastMonth.getMonth() - 1);

  if (
    hasAny(lowerQuestion, [
      'bugün',
      'günlük',
      'today',
      'daily',
      'اليوم',
      'مبيعات اليوم',
      'ئەمڕۆ',
      'ڕۆژانە',
    ])
  ) {
    dateRange.start = today.toISOString().split('T')[0];
    dateRange.end = today.toISOString().split('T')[0];
    keywords.push('today');
  }
  if (hasAny(lowerQuestion, ['dün', 'yesterday', 'أمس', 'دوێنێ'])) {
    dateRange.start = yesterday.toISOString().split('T')[0];
    dateRange.end = yesterday.toISOString().split('T')[0];
    keywords.push('yesterday');
  }
  if (hasAny(lowerQuestion, ['bu hafta', 'haftalık', 'this week', 'weekly', 'هذا الأسبوع', 'ئەم هەفتە'])) {
    dateRange.start = lastWeek.toISOString().split('T')[0];
    dateRange.end = today.toISOString().split('T')[0];
    keywords.push('week');
  }
  if (hasAny(lowerQuestion, ['bu ay', 'aylık', 'this month', 'monthly', 'هذا الشهر', 'ئەم مانگە'])) {
    dateRange.start = lastMonth.toISOString().split('T')[0];
    dateRange.end = today.toISOString().split('T')[0];
    keywords.push('month');
  }

  if (hasAny(lowerQuestion, ['toplam', 'ciro', 'gelir', 'revenue', 'total', 'sales', 'إيراد', 'داهات', 'فرۆشتن'])) {
    intent = 'revenue';
    keywords.push('revenue');
  }
  if (hasAny(lowerQuestion, ['ürün', 'product', 'منتج', 'بەرهەم', 'satış'])) {
    intent = 'product';
    keywords.push('product');
  }
  if (hasAny(lowerQuestion, ['kasiyer', 'personel', 'cashier', 'أمين الصندوق', 'کاشێر'])) {
    intent = 'cashier';
    keywords.push('cashier');
  }
  if (hasAny(lowerQuestion, ['kategori', 'category', 'فئة', 'فئات', 'پۆل'])) {
    intent = 'category';
    keywords.push('category');
  }
  if (hasAny(lowerQuestion, ['saat', 'zaman', 'hour', 'peak', 'ساعة', 'کاتژمێر'])) {
    intent = 'hourly';
    keywords.push('hourly');
  }
  if (hasAny(lowerQuestion, ['stok', 'envanter', 'stock', 'inventory', 'مخزون', 'کۆگا'])) {
    intent = 'stock';
    keywords.push('stock');
  }
  if (hasAny(lowerQuestion, ['müşteri', 'customer', 'عميل', 'کڕیار'])) {
    intent = 'customer';
    keywords.push('customer');
  }
  if (hasAny(lowerQuestion, ['indirim', 'discount', 'خصم', 'داشکاندن'])) {
    intent = 'discount';
    keywords.push('discount');
  }
  if (hasAny(lowerQuestion, ['kar', 'zarar', 'profit', 'loss', 'ربح', 'قازانج'])) {
    intent = 'profit';
    keywords.push('profit');
  }
  if (hasAny(lowerQuestion, ['en çok', 'en iyi', 'top', 'best', 'أكثر', 'زۆرترین', 'باشترین'])) {
    intent = 'top';
    keywords.push('top');
  }

  return { intent, keywords, dateRange };
}

function suggest(keys: string[], lang: Language): string[] {
  return keys.map((k) => t(k, lang));
}

/**
 * Rapor verilerine göre cevap üret
 */
export async function generateAIResponse(
  question: string,
  reportData: ReportData,
  conversationHistory: ChatMessage[] = [],
  useChatGPT: boolean = true,
  language: Language = 'tr',
): Promise<AIResponse> {
  if (useChatGPT) {
    try {
      const { analyzeReportWithChatGPT } = await import('./openaiService');
      const chatGPTResponse = await analyzeReportWithChatGPT(
        question,
        reportData,
        conversationHistory,
        language,
      );

      return {
        answer: chatGPTResponse.answer,
        suggestedReports: chatGPTResponse.suggested_reports || [],
        data: chatGPTResponse.data_summary,
      };
    } catch (error: any) {
      console.warn('[ReportAI] LLM kullanılamadı, kural tabanlı fallback:', error.message);
    }
  }

  const analysis = analyzeQuestion(question);
  let answer = '';
  let suggestedReports: string[] = [];
  let data: any = null;

  try {
    switch (analysis.intent) {
      case 'revenue':
        answer = generateRevenueAnswer(question, reportData, language);
        suggestedReports = suggest(
          ['reportChatSuggestDaily', 'reportChatSuggestZ', 'reportChatSuggestCompare'],
          language,
        );
        break;

      case 'product':
        answer = generateProductAnswer(question, reportData, language);
        suggestedReports = suggest(
          ['reportChatSuggestTopProducts', 'reportChatSuggestProductSales', 'reportChatSuggestCategory'],
          language,
        );
        data = reportData.productSales.slice(0, 10);
        break;

      case 'cashier':
        answer = generateCashierAnswer(reportData, language);
        suggestedReports = suggest(['reportChatSuggestCashier'], language);
        data = reportData.cashierPerformance;
        break;

      case 'category':
        answer = generateCategoryAnswer(reportData, language);
        suggestedReports = suggest(['reportChatSuggestCategory'], language);
        data = reportData.categoryAnalysis;
        break;

      case 'hourly':
        answer = generateHourlyAnswer(reportData, language);
        suggestedReports = suggest(['reportChatSuggestHourly'], language);
        data = reportData.hourlyAnalysis;
        break;

      case 'stock':
        answer = generateStockAnswer(reportData, language);
        suggestedReports = suggest(['reportChatSuggestStock'], language);
        break;

      case 'top':
        answer = generateTopAnswer(question, reportData, language);
        suggestedReports = suggest(
          ['reportChatSuggestTopProducts', 'reportChatSuggestCashier', 'reportChatSuggestCategory'],
          language,
        );
        break;

      default:
        answer = generateGeneralAnswer(language);
        suggestedReports = suggest(['reportChatSuggestDaily', 'reportChatSuggestZ'], language);
    }

    return { answer, suggestedReports, data };
  } catch (error) {
    console.error('AI Response generation error:', error);
    return {
      answer: t('reportChatFallbackUnavailable', language),
      suggestedReports: suggest(['reportChatSuggestDaily', 'reportChatSuggestZ'], language),
    };
  }
}

function generateRevenueAnswer(question: string, reportData: ReportData, lang: Language): string {
  const { dailyTotal, dailyCash, dailyCard, dailySales } = reportData;
  const totalSales = reportData.sales.length;
  const totalRevenue = reportData.sales.reduce((sum, s) => sum + s.total, 0);
  const q = question.toLowerCase();
  const isToday = hasAny(q, ['bugün', 'günlük', 'today', 'daily', 'اليوم', 'ئەمڕۆ']);

  if (isToday) {
    return (
      `${t('reportChatAnsTodaySales', lang)}\n\n` +
      `📊 ${t('reportChatAnsTotalSales', lang)}: ${dailySales.length} ${t('reportChatAnsTransactions', lang)}\n` +
      `💰 ${t('reportChatAnsTotalRevenue', lang)}: ${formatNumber(dailyTotal, 2, false)} IQD\n` +
      `💵 ${t('reportChatAnsCash', lang)}: ${formatNumber(dailyCash, 2, false)} IQD\n` +
      `💳 ${t('reportChatAnsCard', lang)}: ${formatNumber(dailyCard, 2, false)} IQD\n` +
      `📈 ${t('reportChatAnsAvgSale', lang)}: ${
        dailySales.length > 0
          ? formatNumber(dailyTotal / dailySales.length, 2, false) + ' IQD'
          : '0 IQD'
      }`
    );
  }

  return (
    `${t('reportChatAnsGeneralSales', lang)}\n\n` +
    `📊 ${t('reportChatAnsTotalSales', lang)}: ${totalSales} ${t('reportChatAnsTransactions', lang)}\n` +
    `💰 ${t('reportChatAnsTotalRevenue', lang)}: ${formatNumber(totalRevenue, 2, false)} IQD\n` +
    `📈 ${t('reportChatAnsAvgSale', lang)}: ${
      totalSales > 0 ? formatNumber(totalRevenue / totalSales, 2, false) + ' IQD' : '0 IQD'
    }`
  );
}

function generateProductAnswer(question: string, reportData: ReportData, lang: Language): string {
  const topProducts = reportData.productSales
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

  const q = question.toLowerCase();
  if (hasAny(q, ['en çok', 'top', 'أكثر', 'زۆرترین', 'best'])) {
    let answer = `${t('reportChatAnsTopProducts', lang)}\n\n`;
    topProducts.forEach((item, index) => {
      answer += `${index + 1}. ${item.product.name}\n`;
      answer += `   📦 ${t('reportChatAnsSaleQty', lang)}: ${item.quantity} ${t('reportChatAnsQty', lang)}\n`;
      answer += `   💰 ${t('reportChatAnsRevenue', lang)}: ${formatNumber(item.revenue, 2, false)} IQD\n\n`;
    });
    return answer;
  }

  return (
    `${t('reportChatAnsProductAnalysis', lang)}\n\n` +
    `📦 ${t('reportChatAnsTotalProducts', lang)}: ${reportData.products.length} ${t('reportChatAnsQty', lang)}\n` +
    `💰 ${t('reportChatAnsTotalProductRevenue', lang)}: ${formatNumber(
      reportData.productSales.reduce((sum, p) => sum + p.revenue, 0),
      2,
      false,
    )} IQD\n` +
    `📊 ${t('reportChatAnsTopProduct', lang)}: ${topProducts[0]?.product.name || 'N/A'}`
  );
}

function generateCashierAnswer(reportData: ReportData, lang: Language): string {
  const topCashier = reportData.cashierPerformance
    .sort((a, b) => b.totalRevenue - a.totalRevenue)[0];

  if (!topCashier) {
    return t('reportChatAnsCashierNone', lang);
  }

  return (
    `${t('reportChatAnsCashierSummary', lang)}\n\n` +
    `🏆 ${t('reportChatAnsBestPerf', lang)}: ${topCashier.name}\n` +
    `💰 ${t('reportChatAnsTotalRevenue', lang)}: ${formatNumber(topCashier.totalRevenue, 2, false)} IQD\n` +
    `📊 ${t('reportChatAnsTxnCount', lang)}: ${topCashier.salesCount}\n` +
    `📈 ${t('reportChatAnsAvgSale', lang)}: ${formatNumber(
      topCashier.totalRevenue / topCashier.salesCount,
      2,
      false,
    )} IQD\n\n` +
    t('reportChatAnsCashiersActive', lang).replace('{n}', String(reportData.cashierPerformance.length))
  );
}

function generateCategoryAnswer(reportData: ReportData, lang: Language): string {
  const topCategory = reportData.categoryAnalysis
    .sort((a, b) => b.totalRevenue - a.totalRevenue)[0];

  if (!topCategory) {
    return t('reportChatAnsCategoryNone', lang);
  }

  return (
    `${t('reportChatAnsCategorySummary', lang)}\n\n` +
    `🏆 ${t('reportChatAnsTopCategory', lang)}: ${topCategory.name}\n` +
    `💰 ${t('reportChatAnsRevenue', lang)}: ${formatNumber(topCategory.totalRevenue, 2, false)} IQD\n` +
    `📦 ${t('reportChatAnsSoldQty', lang)}: ${topCategory.totalQuantity} ${t('reportChatAnsQty', lang)}\n\n` +
    t('reportChatAnsCategoriesActive', lang).replace('{n}', String(reportData.categoryAnalysis.length))
  );
}

function generateHourlyAnswer(reportData: ReportData, lang: Language): string {
  const peakHour = reportData.hourlyAnalysis
    .sort((a, b) => b.revenue - a.revenue)[0];

  if (!peakHour) {
    return t('reportChatAnsHourlyNone', lang);
  }

  return (
    `${t('reportChatAnsHourlySummary', lang)}\n\n` +
    `⏰ ${t('reportChatAnsPeakHour', lang)}: ${peakHour.hour}:00\n` +
    `💰 ${t('reportChatAnsRevenue', lang)}: ${formatNumber(peakHour.revenue, 2, false)} IQD\n` +
    `📊 ${t('reportChatAnsSalesCount', lang)}: ${peakHour.sales} ${t('reportChatAnsTransactions', lang)}`
  );
}

function generateStockAnswer(reportData: ReportData, lang: Language): string {
  const lowStock = reportData.products.filter((p) => (p.stock || 0) < 30);
  const outOfStock = reportData.products.filter((p) => (p.stock || 0) === 0);

  return (
    `${t('reportChatAnsStockStatus', lang)}\n\n` +
    `📦 ${t('reportChatAnsTotalProducts', lang)}: ${reportData.products.length} ${t('reportChatAnsQty', lang)}\n` +
    `⚠️ ${t('reportChatAnsLowStock', lang)}: ${lowStock.length} ${t('reportChatAnsProductsUnit', lang)}\n` +
    `❌ ${t('reportChatAnsOutOfStock', lang)}: ${outOfStock.length} ${t('reportChatAnsProductsUnit', lang)}\n` +
    `✅ ${t('reportChatAnsNormalStock', lang)}: ${reportData.products.length - lowStock.length} ${t('reportChatAnsProductsUnit', lang)}`
  );
}

function generateTopAnswer(question: string, reportData: ReportData, lang: Language): string {
  const q = question.toLowerCase();
  if (hasAny(q, ['ürün', 'product', 'منتج', 'بەرهەم'])) {
    return generateProductAnswer(question, reportData, lang);
  }
  if (hasAny(q, ['kasiyer', 'cashier', 'أمين الصندوق', 'کاشێر'])) {
    return generateCashierAnswer(reportData, lang);
  }
  if (hasAny(q, ['kategori', 'category', 'فئة', 'پۆل'])) {
    return generateCategoryAnswer(reportData, lang);
  }

  return t('reportChatAnsAskMoreSpecific', lang);
}

function generateGeneralAnswer(lang: Language): string {
  return t('reportChatAnsGeneralHelp', lang);
}

export class ChatHistory {
  private messages: ChatMessage[] = [];

  addMessage(role: 'user' | 'assistant', content: string) {
    this.messages.push({
      role,
      content,
      timestamp: new Date(),
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
