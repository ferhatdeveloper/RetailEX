/**
 * Bağlı profesyonel Instagram hesabının kendi gönderileri.
 * Belirteç veya sayısal hesap kimliği yoksa boş liste.
 * Başka bir hesabın özel fotoğrafı istenmez; yalnız `/{kendi-id}/media`.
 */

export type InstagramOwnPost = {
    id: string;
    caption: string;
    mediaType: string;
    permalink: string;
    timestamp: string;
};

const OWN_MEDIA_FIELDS = 'id,caption,media_type,permalink,timestamp';

export async function listOwnInstagramMedia(input: {
    token?: string | null;
    igUserId?: string | null;
    fetchImpl?: typeof fetch;
}): Promise<InstagramOwnPost[]> {
    const token = String(input.token ?? '').trim();
    const igUserId = String(input.igUserId ?? '').trim();
    if (!token || !/^\d+$/.test(igUserId)) return [];
    const fetchImpl = input.fetchImpl ?? fetch;
    const url = new URL(`https://graph.facebook.com/v21.0/${igUserId}/media`);
    url.searchParams.set('fields', OWN_MEDIA_FIELDS);
    url.searchParams.set('access_token', token);
    try {
        const res = await fetchImpl(url.toString(), { method: 'GET' });
        if (!res.ok) return [];
        const payload = await res.json() as { data?: unknown };
        if (!Array.isArray(payload.data)) return [];
        return payload.data.flatMap((item) => {
            if (!item || typeof item !== 'object') return [];
            const row = item as Record<string, unknown>;
            const id = String(row.id ?? '').trim();
            if (!id) return [];
            return [{
                id,
                caption: String(row.caption ?? ''),
                mediaType: String(row.media_type ?? ''),
                permalink: String(row.permalink ?? ''),
                timestamp: String(row.timestamp ?? ''),
            }];
        });
    } catch {
        return [];
    }
}
