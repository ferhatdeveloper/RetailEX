/**
 * OpenRouter yapılandırması — web `openRouterConfig` ile aynı anahtar/şekil (AsyncStorage).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export const OPENROUTER_CONFIG_KEY = 'retailex_openrouter_config_v1';
export const OPENROUTER_DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1';

export const OPENROUTER_MODEL_PRESETS: { value: string; label: string }[] = [
  { value: 'openai/gpt-4o-mini', label: 'OpenAI GPT-4o Mini' },
  { value: 'openai/gpt-4o', label: 'OpenAI GPT-4o' },
  { value: 'anthropic/claude-3.5-sonnet', label: 'Anthropic Claude 3.5 Sonnet' },
  { value: 'google/gemini-2.0-flash-001', label: 'Google Gemini 2.0 Flash' },
  { value: 'deepseek/deepseek-chat', label: 'DeepSeek Chat' },
];

export type OpenRouterConfig = {
  enabled: boolean;
  apiKey: string;
  baseUrl: string;
  model: string;
  siteUrl: string;
  siteName: string;
  temperature: number;
  maxTokens: number;
};

export const DEFAULT_OPENROUTER_CONFIG: OpenRouterConfig = {
  enabled: false,
  apiKey: '',
  baseUrl: OPENROUTER_DEFAULT_BASE_URL,
  model: 'openai/gpt-4o-mini',
  siteUrl: 'https://retailex.app',
  siteName: 'RetailEX',
  temperature: 0.3,
  maxTokens: 2048,
};

export async function loadOpenRouterConfig(): Promise<OpenRouterConfig> {
  try {
    const raw = await AsyncStorage.getItem(OPENROUTER_CONFIG_KEY);
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
      maxTokens: Number.isFinite(maxTok)
        ? Math.min(16000, Math.max(256, Math.round(maxTok)))
        : 2048,
    };
  } catch {
    return { ...DEFAULT_OPENROUTER_CONFIG };
  }
}

export async function saveOpenRouterConfig(
  patch: Partial<OpenRouterConfig>,
): Promise<OpenRouterConfig> {
  const prev = await loadOpenRouterConfig();
  const next: OpenRouterConfig = {
    ...prev,
    ...patch,
    baseUrl: String(patch.baseUrl ?? prev.baseUrl ?? OPENROUTER_DEFAULT_BASE_URL).replace(
      /\/+$/,
      '',
    ),
    model: String(patch.model ?? prev.model ?? DEFAULT_OPENROUTER_CONFIG.model).trim(),
  };
  await AsyncStorage.setItem(OPENROUTER_CONFIG_KEY, JSON.stringify(next));
  return next;
}
