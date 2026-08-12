/**
 * OpenRouter yapay zeka yapılandırması (localStorage).
 * API anahtarı istemcide saklanır; çağrılar pg_bridge üzerinden OpenRouter’a iletilir.
 */

export const OPENROUTER_CONFIG_KEY = 'retailex_openrouter_config_v1';

export const OPENROUTER_DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1';

/** Önerilen modeller (OpenRouter model id) */
export const OPENROUTER_MODEL_PRESETS: { value: string; label: string }[] = [
  { value: 'openai/gpt-4o-mini', label: 'OpenAI GPT-4o Mini (hızlı / ucuz)' },
  { value: 'openai/gpt-4o', label: 'OpenAI GPT-4o' },
  { value: 'anthropic/claude-3.5-sonnet', label: 'Anthropic Claude 3.5 Sonnet' },
  { value: 'google/gemini-2.0-flash-001', label: 'Google Gemini 2.0 Flash' },
  { value: 'meta-llama/llama-3.3-70b-instruct', label: 'Meta Llama 3.3 70B' },
  { value: 'deepseek/deepseek-chat', label: 'DeepSeek Chat' },
];

export interface OpenRouterConfig {
  enabled: boolean;
  apiKey: string;
  baseUrl: string;
  model: string;
  /** OpenRouter HTTP-Referer (isteğe bağlı) */
  siteUrl: string;
  /** OpenRouter X-Title */
  siteName: string;
  temperature: number;
  maxTokens: number;
}

export const DEFAULT_OPENROUTER_CONFIG: OpenRouterConfig = {
  enabled: false,
  apiKey: '',
  baseUrl: OPENROUTER_DEFAULT_BASE_URL,
  model: 'openai/gpt-4o-mini',
  siteUrl: typeof window !== 'undefined' ? window.location.origin : 'https://retailex.app',
  siteName: 'RetailEX',
  temperature: 0.3,
  maxTokens: 2048,
};

export function loadOpenRouterConfig(): OpenRouterConfig {
  if (typeof window === 'undefined') {
    return { ...DEFAULT_OPENROUTER_CONFIG };
  }
  try {
    const raw = localStorage.getItem(OPENROUTER_CONFIG_KEY);
    if (!raw) return { ...DEFAULT_OPENROUTER_CONFIG };
    const parsed = JSON.parse(raw) as Partial<OpenRouterConfig>;
    const temp = Number(parsed.temperature);
    const maxTok = Number(parsed.maxTokens);
    return {
      ...DEFAULT_OPENROUTER_CONFIG,
      ...parsed,
      enabled: Boolean(parsed.enabled),
      apiKey: String(parsed.apiKey ?? ''),
      baseUrl: String(parsed.baseUrl || OPENROUTER_DEFAULT_BASE_URL).replace(/\/+$/, ''),
      model: String(parsed.model || DEFAULT_OPENROUTER_CONFIG.model).trim(),
      siteUrl: String(parsed.siteUrl ?? DEFAULT_OPENROUTER_CONFIG.siteUrl),
      siteName: String(parsed.siteName || 'RetailEX'),
      temperature: Number.isFinite(temp) ? Math.min(2, Math.max(0, temp)) : 0.3,
      maxTokens: Number.isFinite(maxTok) ? Math.min(16000, Math.max(256, Math.round(maxTok))) : 2048,
    };
  } catch {
    return { ...DEFAULT_OPENROUTER_CONFIG };
  }
}

export function saveOpenRouterConfig(patch: Partial<OpenRouterConfig>): OpenRouterConfig {
  const next = { ...loadOpenRouterConfig(), ...patch };
  next.baseUrl = String(next.baseUrl || OPENROUTER_DEFAULT_BASE_URL).replace(/\/+$/, '');
  next.model = String(next.model || DEFAULT_OPENROUTER_CONFIG.model).trim();
  if (typeof window !== 'undefined') {
    localStorage.setItem(OPENROUTER_CONFIG_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent('retailex:openrouter-config', { detail: next }));
  }
  return next;
}

export function isOpenRouterReady(cfg?: OpenRouterConfig): boolean {
  const c = cfg ?? loadOpenRouterConfig();
  // Anahtar UI’da veya bridge OPENROUTER_API_KEY env ile olabilir
  return Boolean(c.enabled && c.model.trim() && (c.apiKey.trim() || typeof window !== 'undefined'));
}
