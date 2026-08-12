/**
 * AI rapor analizi — öncelik OpenRouter; yoksa eski VITE_BACKEND_API_URL yolu.
 */

import { loadOpenRouterConfig } from './openRouterConfig';

const BACKEND_API_URL = import.meta.env.VITE_BACKEND_API_URL || 'http://localhost:8000';

interface ReportData {
  sales: any[];
  products: any[];
  dailySales: any[];
  dailyTotal: number;
  dailyCash: number;
  dailyCard: number;
  productSales: Array<{
    product: any;
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
}

interface AIAnalysisResponse {
  answer: string;
  suggested_reports: string[];
  insights?: string[];
  data_summary?: any;
}

/**
 * Rapor analizi — OpenRouter (tercih) veya legacy backend.
 */
export async function analyzeReportWithChatGPT(
  question: string,
  reportData: ReportData,
  conversationHistory: ChatMessage[] = []
): Promise<AIAnalysisResponse> {
  const orCfg = loadOpenRouterConfig();
  // Etkinse OpenRouter (istemci anahtarı veya bridge OPENROUTER_API_KEY)
  if (orCfg.enabled) {
    const { analyzeReportWithOpenRouter } = await import('./openRouterService');
    return analyzeReportWithOpenRouter(question, reportData, conversationHistory);
  }

  try {
    const response = await fetch(`${BACKEND_API_URL}/api/v1/ai-reports/analyze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        question,
        report_data: reportData,
        conversation_history: conversationHistory.map((msg) => ({
          role: msg.role,
          content: msg.content,
        })),
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
      throw new Error(error.detail || `HTTP ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error: any) {
    console.error('[OpenAI Service] Error:', error);

    if (error.message?.includes('Failed to fetch') || error.message?.includes('API key')) {
      throw new Error(
        'Yapay zeka şu anda kullanılamıyor. Entegrasyonlar → Yapay Zeka (OpenRouter) bölümünden API anahtarını girip etkinleştirin.',
      );
    }

    throw error;
  }
}

/**
 * AI servis sağlık kontrolü
 */
export async function checkAIServiceHealth(): Promise<{
  status: string;
  openai_configured: boolean;
  openrouter_configured?: boolean;
  provider?: string;
}> {
  const orCfg = loadOpenRouterConfig();
  if (orCfg.enabled) {
    const { checkOpenRouterHealth } = await import('./openRouterService');
    const h = await checkOpenRouterHealth();
    return {
      status: h.status,
      openai_configured: h.openrouter_configured,
      openrouter_configured: h.openrouter_configured,
      provider: 'openrouter',
    };
  }

  try {
    const response = await fetch(`${BACKEND_API_URL}/api/v1/ai-reports/health`);
    if (!response.ok) {
      return { status: 'error', openai_configured: false, provider: 'legacy' };
    }
    const data = await response.json();
    return { ...data, provider: 'legacy' };
  } catch {
    return { status: 'error', openai_configured: false, provider: 'none' };
  }
}
