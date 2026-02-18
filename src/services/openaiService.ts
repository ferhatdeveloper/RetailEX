/**
 * OpenAI Service
 * ChatGPT API entegrasyonu için frontend servisi
 */

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
 * ChatGPT ile rapor analizi yap
 */
export async function analyzeReportWithChatGPT(
  question: string,
  reportData: ReportData,
  conversationHistory: ChatMessage[] = []
): Promise<AIAnalysisResponse> {
  try {
    const response = await fetch(`${BACKEND_API_URL}/api/v1/ai-reports/analyze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        question,
        report_data: reportData,
        conversation_history: conversationHistory.map(msg => ({
          role: msg.role,
          content: msg.content
        }))
      })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
      throw new Error(error.detail || `HTTP ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error: any) {
    console.error('[OpenAI Service] Error:', error);
    
    // Fallback: Eğer backend yoksa veya API key yoksa, basit analiz yap
    if (error.message?.includes('Failed to fetch') || error.message?.includes('API key')) {
      throw new Error(
        'ChatGPT entegrasyonu şu anda kullanılamıyor. ' +
        'Lütfen backend servisinin çalıştığından ve OPENAI_API_KEY\'in yapılandırıldığından emin olun.'
      );
    }
    
    throw error;
  }
}

/**
 * AI servis sağlık kontrolü
 */
export async function checkAIServiceHealth(): Promise<{ status: string; openai_configured: boolean }> {
  try {
    const response = await fetch(`${BACKEND_API_URL}/api/v1/ai-reports/health`);
    if (!response.ok) {
      return { status: 'error', openai_configured: false };
    }
    const data = await response.json();
    return data;
  } catch (error) {
    return { status: 'error', openai_configured: false };
  }
}




