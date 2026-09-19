/**
 * OpenRouter model listesi — ssh reposu ile aynı yaklaşım:
 * doğrudan https://openrouter.ai/api/v1/models (CORS açık).
 */

export type OpenRouterModelItem = {
  id: string;
  name: string;
  /** örn. " · $0.15/M" */
  priceLabel: string;
  isFree: boolean;
};

export type OpenRouterModelGroups = {
  featured: OpenRouterModelItem[];
  free: OpenRouterModelItem[];
  paid: OpenRouterModelItem[];
};

/** ssh public/app.js featured listesi ile hizalı */
export const OPENROUTER_FEATURED_IDS: string[] = [
  'anthropic/claude-sonnet-4.5',
  'anthropic/claude-sonnet-5',
  'openai/gpt-4.1',
  'openai/gpt-4o',
  'openai/gpt-4o-mini',
  'google/gemini-2.5-pro',
  'google/gemini-2.5-flash',
  'x-ai/grok-4.5',
  'deepseek/deepseek-chat-v3.1',
  'deepseek/deepseek-r1',
  'meta-llama/llama-4-maverick',
  'qwen/qwen3-coder-plus',
  'mistralai/mistral-large-2512',
];

const PROVIDER_ORDER = [
  'anthropic',
  'openai',
  'google',
  'x-ai',
  'deepseek',
  'meta-llama',
  'qwen',
  'mistralai',
  'cohere',
];

function priceLabelFromPrompt(prompt?: string): string {
  try {
    const p = parseFloat(prompt || '0');
    if (!(p > 0)) return '';
    return ` · $${(p * 1_000_000).toFixed(p < 0.01 ? 3 : 2)}/M`;
  } catch {
    return '';
  }
}

function sortPaidByProvider(paid: OpenRouterModelItem[]): OpenRouterModelItem[] {
  const byProv = new Map<string, OpenRouterModelItem[]>();
  for (const m of paid) {
    const prov = m.id.split('/')[0] || 'other';
    if (!byProv.has(prov)) byProv.set(prov, []);
    byProv.get(prov)!.push(m);
  }
  for (const arr of byProv.values()) {
    arr.sort((a, b) => a.name.localeCompare(b.name));
  }
  const ordered: OpenRouterModelItem[] = [];
  for (const prov of PROVIDER_ORDER) {
    const arr = byProv.get(prov);
    if (arr?.length) ordered.push(...arr);
    byProv.delete(prov);
  }
  const rest = [...byProv.keys()].sort();
  for (const prov of rest) {
    ordered.push(...(byProv.get(prov) || []));
  }
  return ordered;
}

/**
 * OpenRouter public models API. Başarısızsa boş gruplar + error.
 */
export async function fetchOpenRouterModels(): Promise<{
  ok: boolean;
  groups: OpenRouterModelGroups;
  error?: string;
}> {
  const empty: OpenRouterModelGroups = { featured: [], free: [], paid: [] };
  try {
    const r = await fetch('https://openrouter.ai/api/v1/models', { cache: 'no-store' });
    if (!r.ok) {
      return { ok: false, groups: empty, error: `HTTP ${r.status}` };
    }
    const data = (await r.json()) as {
      data?: Array<{ id?: string; name?: string; pricing?: { prompt?: string } }>;
    };
    const free: OpenRouterModelItem[] = [];
    const paid: OpenRouterModelItem[] = [];
    for (const m of data.data || []) {
      const id = String(m.id || '').trim();
      if (!id) continue;
      const item: OpenRouterModelItem = {
        id,
        name: String(m.name || id),
        priceLabel: priceLabelFromPrompt(m.pricing?.prompt),
        isFree: id.includes(':free'),
      };
      if (item.isFree) free.push(item);
      else paid.push(item);
    }
    free.sort((a, b) => a.name.localeCompare(b.name));

    const featuredSet = new Set(OPENROUTER_FEATURED_IDS);
    const paidMap = new Map(paid.map((m) => [m.id, m]));
    const featured = OPENROUTER_FEATURED_IDS.map((id) => paidMap.get(id)).filter(
      (m): m is OpenRouterModelItem => Boolean(m),
    );
    const remainingPaid = sortPaidByProvider(paid.filter((m) => !featuredSet.has(m.id)));

    return {
      ok: true,
      groups: { featured, free, paid: remainingPaid },
    };
  } catch (e: unknown) {
    return {
      ok: false,
      groups: empty,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export function flattenModelGroups(groups: OpenRouterModelGroups): OpenRouterModelItem[] {
  const seen = new Set<string>();
  const out: OpenRouterModelItem[] = [];
  for (const list of [groups.featured, groups.free, groups.paid]) {
    for (const m of list) {
      if (seen.has(m.id)) continue;
      seen.add(m.id);
      out.push(m);
    }
  }
  return out;
}
