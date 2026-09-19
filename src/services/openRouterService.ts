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
import { translate, type Language } from '../locales/module-translations';

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

function buildPayload(
  cfg: OpenRouterConfig,
  messages: OpenRouterChatMessage[],
  overrides?: { temperature?: number; maxTokens?: number; responseFormat?: 'json_object' },
) {
  const payload: Record<string, unknown> = {
    model: cfg.model,
    messages,
    temperature: overrides?.temperature ?? cfg.temperature,
    max_tokens: overrides?.maxTokens ?? cfg.maxTokens,
  };
  if (overrides?.responseFormat === 'json_object') {
    payload.response_format = { type: 'json_object' };
  }
  return payload;
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
  overrides?: { temperature?: number; maxTokens?: number; responseFormat?: 'json_object' },
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
      ...buildPayload(cfg, messages, overrides),
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
  overrides?: { temperature?: number; maxTokens?: number; responseFormat?: 'json_object' },
): Promise<OpenRouterChatResult> {
  const base = (cfg.baseUrl || 'https://openrouter.ai/api/v1').replace(/\/+$/, '');
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: buildOpenRouterHeaders(cfg, apiKey),
    body: JSON.stringify(buildPayload(cfg, messages, overrides)),
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
  options?: {
    config?: OpenRouterConfig;
    temperature?: number;
    maxTokens?: number;
    responseFormat?: 'json_object';
  },
): Promise<OpenRouterChatResult> {
  const cfg = options?.config ?? loadOpenRouterConfig();
  if (!cfg.enabled) {
    return { ok: false, content: '', error: translate('reportChatOpenRouterOff', 'tr') };
  }
  if (!cfg.model.trim()) {
    return { ok: false, content: '', error: 'OpenRouter model seçilmedi.' };
  }

  const overrides = {
    temperature: options?.temperature,
    maxTokens: options?.maxTokens,
    responseFormat: options?.responseFormat,
  };

  try {
    // Web / Tauri: köprü proxy (CORS + isteğe bağlı OPENROUTER_API_KEY env)
    if (typeof window !== 'undefined') {
      return await chatViaBridge(cfg, messages, overrides);
    }
    const key = cfg.apiKey.trim();
    if (!key) {
      return { ok: false, content: '', error: 'OpenRouter API anahtarı yok.' };
    }
    return await chatDirect(cfg, messages, key, overrides);
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
export function buildReportContextSummary(
  reportData: {
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
  },
  language: Language = 'tr',
): string {
  const t = (key: string) => translate(key, language);
  const topProducts = (reportData.productSales || [])
    .slice()
    .sort((a, b) => (b.revenue || 0) - (a.revenue || 0))
    .slice(0, 8)
    .map(
      (p, i) =>
        `${i + 1}. ${p.product?.name || '?'} — ${t('reportChatCtxPcs')} ${p.quantity ?? 0}, ${t('reportChatAnsRevenue')} ${p.revenue ?? 0}`,
    );
  const cashiers = (reportData.cashierPerformance || [])
    .slice(0, 6)
    .map(
      (c) =>
        `${c.name}: ${c.salesCount} ${t('reportChatCtxSalesSlash')} / ${c.totalRevenue} ${t('reportChatAnsRevenue')}`,
    );
  const cats = (reportData.categoryAnalysis || [])
    .slice(0, 6)
    .map((c) => `${c.name}: ${c.totalRevenue}`);
  const peak = (reportData.hourlyAnalysis || [])
    .slice()
    .sort((a, b) => (b.revenue || 0) - (a.revenue || 0))[0];

  return [
    `${t('reportChatCtxDailyRevenue')}: ${reportData.dailyTotal ?? 0}`,
    `${t('reportChatCtxDailyCash')}: ${reportData.dailyCash ?? 0}`,
    `${t('reportChatCtxDailyCard')}: ${reportData.dailyCard ?? 0}`,
    `${t('reportChatCtxDailyTxn')}: ${(reportData.dailySales || []).length}`,
    `${t('reportChatCtxTotalSales')}: ${(reportData.sales || []).length}`,
    `${t('reportChatCtxProductCards')}: ${(reportData.products || []).length}`,
    topProducts.length ? `${t('reportChatCtxTopSellers')}:\n${topProducts.join('\n')}` : '',
    cashiers.length ? `${t('reportChatCtxCashiers')}:\n${cashiers.join('\n')}` : '',
    cats.length ? `${t('reportChatCtxCategories')}:\n${cats.join('\n')}` : '',
    peak
      ? `${t('reportChatCtxPeakHour')}: ${peak.hour}:00 (${t('reportChatAnsRevenue')} ${peak.revenue})`
      : '',
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * Rapor sorusu — OpenRouter ile tutarlı (dil bağımsız sistem prompt + JSON) yanıt.
 * Aynı kaynak veri için tr/en/ar/ku yalnızca cevap dili değişir; sayılar/olgular sabit kalır.
 */
export async function analyzeReportWithOpenRouter(
  question: string,
  reportData: Parameters<typeof buildReportContextSummary>[0],
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [],
  language: Language = 'tr',
): Promise<{
  answer: string;
  suggested_reports: string[];
  insights?: string[];
}> {
  const cfg = loadOpenRouterConfig();
  if (!cfg.enabled) {
    throw new Error(translate('reportChatOpenRouterOff', language));
  }

  // Bağlam her zaman EN etiketleriyle — dil değişince sayı/olgu sapması azalır
  const context = buildReportContextSummary(reportData, 'en');
  const replyLang = REPLY_LANGUAGE_NAMES[language] || 'Turkish';
  const knownSuggestTr = [
    'reportChatSuggestDaily',
    'reportChatSuggestZ',
    'reportChatSuggestCompare',
    'reportChatSuggestTopProducts',
    'reportChatSuggestProductSales',
    'reportChatSuggestCategory',
    'reportChatSuggestCashier',
    'reportChatSuggestHourly',
    'reportChatSuggestStock',
  ].map((k) => translate(k, 'tr'));

  const system: OpenRouterChatMessage = {
    role: 'system',
    content: [
      'You are the RetailEX retail / restaurant / beauty ERP assistant.',
      'Use ONLY the provided report summary. Never invent numbers or facts.',
      'Be brief and deterministic: same question + same data must yield the same facts in every UI language.',
      `Write the "answer" field in ${replyLang} (locale code: ${language}).`,
      'Respond with valid JSON only (no markdown fences):',
      '{"answer":"string","suggested_reports":["string",...]}',
      `suggested_reports: 0–4 items chosen from this fixed Turkish catalog (keep these exact strings): ${JSON.stringify(knownSuggestTr)}`,
      'If no report suggestion fits, use an empty array.',
    ].join(' '),
  };
  const history: OpenRouterChatMessage[] = conversationHistory
    .slice(-8)
    .map((m) => ({ role: m.role, content: m.content }));
  const user: OpenRouterChatMessage = {
    role: 'user',
    content: `Report summary (canonical English labels):\n${context}\n\nUser question:\n${question}`,
  };

  // Düşük temperature — dil değiştirince tutarsız anlatımı azaltır
  const analysisTemp = Math.min(Number(cfg.temperature) || 0.15, 0.2);

  const result = await openRouterChat([system, ...history, user], {
    config: cfg,
    temperature: analysisTemp,
    responseFormat: 'json_object',
  });
  if (!result.ok) {
    throw new Error(result.error || 'OpenRouter yanıt vermedi');
  }

  const parsed = parseStructuredReportAnswer(result.content);
  const answer = parsed.answer || result.content;
  const suggested =
    parsed.suggested.length > 0
      ? localizeSuggestedReports(parsed.suggested, language)
      : extractSuggestedReports(answer, language);

  return {
    answer,
    suggested_reports: suggested,
  };
}

const REPLY_LANGUAGE_NAMES: Record<Language, string> = {
  tr: 'Turkish',
  en: 'English',
  ar: 'Arabic',
  ku: 'Kurdish (Sorani)',
};

function parseStructuredReportAnswer(raw: string): {
  answer: string;
  suggested: string[];
} {
  const trimmed = raw.trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return { answer: trimmed, suggested: [] };
  }
  try {
    const obj = JSON.parse(jsonMatch[0]) as {
      answer?: unknown;
      suggested_reports?: unknown;
    };
    const answer = typeof obj.answer === 'string' ? obj.answer.trim() : '';
    const suggested = Array.isArray(obj.suggested_reports)
      ? obj.suggested_reports.filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
      : [];
    return { answer: answer || trimmed, suggested };
  } catch {
    return { answer: trimmed, suggested: [] };
  }
}

/** Model TR katalog adlarını döndürür; UI diline çevir. */
function localizeSuggestedReports(names: string[], language: Language): string[] {
  const keys = [
    'reportChatSuggestDaily',
    'reportChatSuggestZ',
    'reportChatSuggestCompare',
    'reportChatSuggestTopProducts',
    'reportChatSuggestProductSales',
    'reportChatSuggestCategory',
    'reportChatSuggestCashier',
    'reportChatSuggestHourly',
    'reportChatSuggestStock',
  ];
  const out: string[] = [];
  for (const name of names) {
    const idx = keys.findIndex(
      (k) =>
        translate(k, 'tr') === name ||
        translate(k, language) === name ||
        translate(k, 'en') === name,
    );
    if (idx >= 0) out.push(translate(keys[idx], language));
  }
  return out.slice(0, 4);
}

function extractSuggestedReports(text: string, language: Language = 'tr'): string[] {
  const knownKeys = [
    'reportChatSuggestDaily',
    'reportChatSuggestZ',
    'reportChatSuggestCompare',
    'reportChatSuggestTopProducts',
    'reportChatSuggestProductSales',
    'reportChatSuggestCategory',
    'reportChatSuggestCashier',
    'reportChatSuggestHourly',
    'reportChatSuggestStock',
  ];
  const known = knownKeys.map((k) => translate(k, language));
  // Ayrıca TR isimleri de tanı (model bazen TR dönebilir)
  const knownTr = knownKeys.map((k) => translate(k, 'tr'));
  const matched = known.filter((k) => text.includes(k));
  if (matched.length > 0) return matched.slice(0, 4);
  return knownTr
    .map((tr, i) => (text.includes(tr) ? known[i] : null))
    .filter((x): x is string => Boolean(x))
    .slice(0, 4);
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
