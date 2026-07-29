/**
 * OpenRouter istemcisi — OpenAI uyumlu chat completions.
 * Web: pg_bridge `/api/openrouter/chat` (CORS + anahtar sunucu tarafında iletilir).
 * Tauri / Node: doğrudan OpenRouter veya env anahtarı.
 */

import { getBridgeUrl } from '../utils/env';
import {
  isOpenRouterReady,
  loadOpenRouterConfig,
  type OpenRouterConfig,
} from './openRouterConfig';

export type OpenRouterChatRole = 'system' | 'user' | 'assistant';

export type OpenRouterChatMessage = {
  role: OpenRouterChatRole;
  content: string;
};

export type OpenRouterChatResult = {
  ok: boolean;
  content: string;
  model?: string;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  error?: string;
  raw?: unknown;
};

function buildPayload(cfg: OpenRouterConfig, messages: OpenRouterChatMessage[]) {
  return {
    model: cfg.model,
    messages,
    temperature: cfg.temperature,
    max_tokens: cfg.maxTokens,
  };
}

function buildOpenRouterHeaders(cfg: OpenRouterConfig, apiKey: string): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };
  if (cfg.siteUrl?.trim()) headers['HTTP-Referer'] = cfg.siteUrl.trim();
  if (cfg.siteName?.trim()) headers['X-Title'] = cfg.siteName.trim();
  return headers;
}

function extractAssistantText(data: unknown): string {
  if (!data || typeof data !== 'object') return '';
  const o = data as Record<string, unknown>;
  const choices = o.choices;
  if (!Array.isArray(choices) || !choices[0]) return '';
  const first = choices[0] as Record<string, unknown>;
  const msg = first.message as Record<string, unknown> | undefined;
  if (msg && typeof msg.content === 'string') return msg.content;
  if (typeof first.text === 'string') return first.text;
  return '';
}

async function chatViaBridge(
  cfg: OpenRouterConfig,
  messages: OpenRouterChatMessage[],
): Promise<OpenRouterChatResult> {
  const bridge = getBridgeUrl();
  const res = await fetch(`${bridge}/api/openrouter/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      apiKey: cfg.apiKey,
      baseUrl: cfg.baseUrl,
      siteUrl: cfg.siteUrl,
      siteName: cfg.siteName,
      ...buildPayload(cfg, messages),
    }),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const err =
      (typeof data.error === 'string' && data.error) ||
      (data.error && typeof data.error === 'object'
        ? JSON.stringify(data.error)
        : null) ||
      `OpenRouter köprü hatası (${res.status})`;
    return { ok: false, content: '', error: err, raw: data };
  }
  const content =
    typeof data.content === 'string' ? data.content : extractAssistantText(data);
  if (!content.trim()) {
    return { ok: false, content: '', error: 'OpenRouter boş yanıt döndü.', raw: data };
  }
  return {
    ok: true,
    content,
    model: typeof data.model === 'string' ? data.model : cfg.model,
    usage: data.usage as OpenRouterChatResult['usage'],
    raw: data,
  };
}

async function chatDirect(
  cfg: OpenRouterConfig,
  messages: OpenRouterChatMessage[],
  apiKey: string,
): Promise<OpenRouterChatResult> {
  const base = (cfg.baseUrl || 'https://openrouter.ai/api/v1').replace(/\/+$/, '');
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: buildOpenRouterHeaders(cfg, apiKey),
    body: JSON.stringify(buildPayload(cfg, messages)),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const errObj = (data as { error?: { message?: string } | string })?.error;
    const err =
      typeof errObj === 'string'
        ? errObj
        : errObj?.message || `OpenRouter HTTP ${res.status}`;
    return { ok: false, content: '', error: err, raw: data };
  }
  const content = extractAssistantText(data);
  if (!content.trim()) {
    return { ok: false, content: '', error: 'OpenRouter boş yanıt döndü.', raw: data };
  }
  const usage = (data as { usage?: OpenRouterChatResult['usage'] }).usage;
  const model = (data as { model?: string }).model;
  return { ok: true, content, model: model || cfg.model, usage, raw: data };
}

/**
 * Genel chat completion — yapılandırma açıksa OpenRouter kullanır.
 */
export async function openRouterChat(
  messages: OpenRouterChatMessage[],
  options?: { config?: OpenRouterConfig },
): Promise<OpenRouterChatResult> {
  const cfg = options?.config ?? loadOpenRouterConfig();
  if (!cfg.enabled) {
    return { ok: false, content: '', error: 'OpenRouter kapalı. Entegrasyonlar → Yapay Zeka ile açın.' };
  }
  if (!cfg.model.trim()) {
    return { ok: false, content: '', error: 'OpenRouter model seçilmedi.' };
  }

  try {
    // Web / Tauri: köprü proxy (CORS + isteğe bağlı OPENROUTER_API_KEY env)
    if (typeof window !== 'undefined') {
      return await chatViaBridge(cfg, messages);
    }
    const key = cfg.apiKey.trim();
    if (!key) {
      return { ok: false, content: '', error: 'OpenRouter API anahtarı yok.' };
    }
    return await chatDirect(cfg, messages, key);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === 'Failed to fetch' || /NetworkError|köprü/i.test(msg)) {
      return {
        ok: false,
        content: '',
        error:
          'OpenRouter’a ulaşılamadı. pg_bridge çalışıyor mu ve API anahtarı doğru mu?',
      };
    }
    return { ok: false, content: '', error: msg };
  }
}

/** Bağlantı / anahtar testi */
export async function testOpenRouterConnection(
  cfg?: OpenRouterConfig,
): Promise<{ ok: boolean; message: string; model?: string }> {
  const config = cfg ?? loadOpenRouterConfig();
  if (!config.apiKey.trim() && !config.enabled) {
    return { ok: false, message: 'API anahtarı girin ve etkinleştirin.' };
  }
  const result = await openRouterChat(
    [
      {
        role: 'user',
        content: 'Yanıt olarak yalnızca OK yaz.',
      },
    ],
    {
      config: {
        ...config,
        enabled: true,
        maxTokens: 16,
        temperature: 0,
      },
    },
  );
  if (!result.ok) {
    return { ok: false, message: result.error || 'Bağlantı başarısız' };
  }
  return {
    ok: true,
    message: `Bağlantı başarılı · model ${result.model || config.model}`,
    model: result.model,
  };
}

/** Rapor özeti için sıkıştırılmış bağlam (token tasarrufu) */
export function buildReportContextSummary(reportData: {
  dailyTotal?: number;
  dailyCash?: number;
  dailyCard?: number;
  dailySales?: unknown[];
  sales?: unknown[];
  products?: unknown[];
  productSales?: Array<{ product?: { name?: string }; quantity?: number; revenue?: number }>;
  cashierPerformance?: Array<{ name?: string; salesCount?: number; totalRevenue?: number }>;
  categoryAnalysis?: Array<{ name?: string; totalRevenue?: number; totalQuantity?: number }>;
  hourlyAnalysis?: Array<{ hour?: number; sales?: number; revenue?: number }>;
}): string {
  const topProducts = (reportData.productSales || [])
    .slice()
    .sort((a, b) => (b.revenue || 0) - (a.revenue || 0))
    .slice(0, 8)
    .map(
      (p, i) =>
        `${i + 1}. ${p.product?.name || '?'} — adet ${p.quantity ?? 0}, ciro ${p.revenue ?? 0}`,
    );
  const cashiers = (reportData.cashierPerformance || [])
    .slice(0, 6)
    .map((c) => `${c.name}: ${c.salesCount} satış / ${c.totalRevenue} ciro`);
  const cats = (reportData.categoryAnalysis || [])
    .slice(0, 6)
    .map((c) => `${c.name}: ${c.totalRevenue}`);
  const peak = (reportData.hourlyAnalysis || [])
    .slice()
    .sort((a, b) => (b.revenue || 0) - (a.revenue || 0))[0];

  return [
    `Günlük ciro: ${reportData.dailyTotal ?? 0}`,
    `Günlük nakit: ${reportData.dailyCash ?? 0}`,
    `Günlük kart: ${reportData.dailyCard ?? 0}`,
    `Günlük işlem: ${(reportData.dailySales || []).length}`,
    `Toplam satış kaydı: ${(reportData.sales || []).length}`,
    `Ürün kartı: ${(reportData.products || []).length}`,
    topProducts.length ? `En çok satanlar:\n${topProducts.join('\n')}` : '',
    cashiers.length ? `Kasiyerler:\n${cashiers.join('\n')}` : '',
    cats.length ? `Kategoriler:\n${cats.join('\n')}` : '',
    peak ? `En yoğun saat: ${peak.hour}:00 (ciro ${peak.revenue})` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * Rapor sorusu — OpenRouter ile Türkçe perakende asistan yanıtı.
 */
export async function analyzeReportWithOpenRouter(
  question: string,
  reportData: Parameters<typeof buildReportContextSummary>[0],
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [],
): Promise<{
  answer: string;
  suggested_reports: string[];
  insights?: string[];
}> {
  const cfg = loadOpenRouterConfig();
  if (!cfg.enabled) {
    throw new Error('OpenRouter kapalı');
  }

  const context = buildReportContextSummary(reportData);
  const system: OpenRouterChatMessage = {
    role: 'system',
    content:
      'Sen RetailEX perakende ERP asistanısın. Türkçe, net ve kısa yanıt ver. ' +
      'Yalnızca verilen rapor özetine dayan; uydurma sayı yazma. ' +
      'Uygunsa sonunda 2–4 önerilen rapor adı listele (örn. Günlük Rapor, Z Raporu).',
  };
  const history: OpenRouterChatMessage[] = conversationHistory
    .slice(-8)
    .map((m) => ({ role: m.role, content: m.content }));
  const user: OpenRouterChatMessage = {
    role: 'user',
    content: `Rapor özeti:\n${context}\n\nSoru: ${question}`,
  };

  const result = await openRouterChat([system, ...history, user], { config: cfg });
  if (!result.ok) {
    throw new Error(result.error || 'OpenRouter yanıt vermedi');
  }

  const suggested = extractSuggestedReports(result.content);
  return {
    answer: result.content,
    suggested_reports: suggested,
  };
}

function extractSuggestedReports(text: string): string[] {
  const known = [
    'Günlük Rapor',
    'Z Raporu',
    'Karşılaştırma',
    'Top Ürünler',
    'Ürün Satış Analizi',
    'Kategori Analizi',
    'Kasiyer Performansı',
    'Saatlik Analiz',
    'Stok Durumu',
  ];
  return known.filter((k) => text.includes(k)).slice(0, 4);
}

export async function checkOpenRouterHealth(): Promise<{
  status: string;
  openrouter_configured: boolean;
  enabled: boolean;
  model?: string;
}> {
  const cfg = loadOpenRouterConfig();
  return {
    status: isOpenRouterReady(cfg) ? 'ok' : 'idle',
    openrouter_configured: Boolean(cfg.apiKey.trim()),
    enabled: cfg.enabled,
    model: cfg.model,
  };
}
