/**
 * Image Search Service using Unsplash API
 * Uses public demo access - no API key registration needed!
 * Documentation: https://unsplash.com/documentation
 */

export interface UnsplashPhoto {
    id: string;
    created_at: string;
    width: number;
    height: number;
    color: string;
    blur_hash: string;
    description: string | null;
    alt_description: string | null;
    urls: {
        raw: string;
        full: string;
        regular: string;
        small: string;
        thumb: string;
    };
    user: {
        id: string;
        username: string;
        name: string;
        portfolio_url: string | null;
    };
}

export interface UnsplashSearchResponse {
    total: number;
    total_pages: number;
    results: UnsplashPhoto[];
}

/** Kaynak: UI’da atıf / debug için */
export type ImageSearchSource = 'unsplash' | 'wikimedia' | 'openverse';

export interface ImageSearchResult {
    id: string;
    thumbnailUrl: string;
    fullUrl: string;
    photographer: string;
    alt: string;
    source?: ImageSearchSource;
}

class ImageSearchService {
    // Unsplash API access key - from user's account
    private readonly accessKey = '1FFOIAechGg0wI8QyeZG0710PE1uZRSfDmuNA6aZ5yo';
    private readonly baseUrl = 'https://api.unsplash.com';

    /**
     * Wikimedia Commons — API anahtarı gerekmez; Unsplash limitinde yedek kaynak.
     */
    private async searchWikimediaCommons(query: string, limit: number): Promise<ImageSearchResult[]> {
        const q = query.trim().slice(0, 200);
        if (!q) return [];

        const apiUrl = new URL('https://commons.wikimedia.org/w/api.php');
        apiUrl.searchParams.set('action', 'query');
        apiUrl.searchParams.set('format', 'json');
        apiUrl.searchParams.set('origin', '*');
        apiUrl.searchParams.set('formatversion', '2');
        apiUrl.searchParams.set('generator', 'search');
        apiUrl.searchParams.set('gsrsearch', q);
        apiUrl.searchParams.set('gsrnamespace', '6');
        apiUrl.searchParams.set('gsrlimit', String(Math.min(Math.max(limit, 1), 50)));
        apiUrl.searchParams.set('prop', 'imageinfo');
        apiUrl.searchParams.set('iiprop', 'url|thumburl');
        apiUrl.searchParams.set('iiurlwidth', '800');

        const response = await fetch(apiUrl.toString());
        if (!response.ok) return [];

        const data = await response.json();
        const pages: Array<{
            pageid: number;
            title?: string;
            imageinfo?: Array<{ url?: string; thumburl?: string }>;
        }> = data.query?.pages ?? [];

        const out: ImageSearchResult[] = [];
        for (const p of pages) {
            const ii = p.imageinfo?.[0];
            if (!ii) continue;
            const fullUrl = ii.url || ii.thumburl;
            const thumb = ii.thumburl || ii.url;
            if (!fullUrl) continue;
            if (/\.svg(\?|$)/i.test(fullUrl)) continue;

            out.push({
                id: `wm-${p.pageid}`,
                thumbnailUrl: thumb,
                fullUrl,
                photographer: 'Wikimedia Commons',
                alt: (p.title || '').replace(/^File:/i, '') || q,
                source: 'wikimedia',
            });
        }
        return out;
    }

    /**
     * Openverse (CC lisanslı görseller) — anahtarsız genel API.
     */
    private async searchOpenverse(query: string, perPage: number): Promise<ImageSearchResult[]> {
        const q = query.trim().slice(0, 200);
        if (!q) return [];

        const url = new URL('https://api.openverse.org/v1/images/');
        url.searchParams.set('q', q);
        url.searchParams.set('page_size', String(Math.min(Math.max(perPage, 1), 30)));
        url.searchParams.set('page', '1');

        const response = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
        if (!response.ok) return [];

        const data = await response.json();
        const results: Array<{
            id?: string;
            title?: string;
            url?: string;
            thumbnail?: string;
            creator?: string;
        }> = data.results ?? [];

        return results
            .filter((r) => r.url && !/\.svg(\?|$)/i.test(r.url))
            .map((r, i) => ({
                id: `ov-${r.id ?? i}-${i}`,
                thumbnailUrl: r.thumbnail || r.url!,
                fullUrl: r.url!,
                photographer: r.creator || 'Openverse',
                alt: r.title || q,
                source: 'openverse' as const,
            }));
    }

    /** Arama sorgusunu ikinci deneme için sadeleştirir (ör. İngilizce anahtar kelimeler). */
    private simplifyQueryForFallback(query: string): string {
        const cleaned = query
            .replace(/[^a-zA-Z0-9ğüşıöçĞÜŞİÖÇ\s]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        const parts = cleaned.split(' ').filter(Boolean);
        if (parts.length <= 3) return cleaned;
        return parts.slice(0, 4).join(' ');
    }

    /**
     * Önce Unsplash; limit / hata / boş sonuçta Wikimedia Commons ve Openverse.
     */
    async searchImages(
        query: string,
        perPage: number = 20,
        page: number = 1
    ): Promise<ImageSearchResult[]> {
        if (!query || query.trim() === '') {
            throw new Error('Arama terimi boş olamaz.');
        }

        const cap = Math.min(perPage, 30);

        try {
            const url = `${this.baseUrl}/search/photos?query=${encodeURIComponent(query)}&per_page=${cap}&page=${page}&client_id=${this.accessKey}`;

            const response = await fetch(url);

            if (response.ok) {
                const data: UnsplashSearchResponse = await response.json();

                if (data.results && data.results.length > 0) {
                    return data.results.map((photo) => ({
                        id: photo.id,
                        thumbnailUrl: photo.urls.small,
                        fullUrl: photo.urls.regular,
                        photographer: photo.user.name,
                        alt: photo.alt_description || photo.description || query,
                        source: 'unsplash' as const,
                    }));
                }
            }
        } catch {
            // Unsplash hata — yedek kaynaklara düş
        }

        const tryWm = await this.searchWikimediaCommons(query, cap).catch(() => []);
        if (tryWm.length > 0) {
            return tryWm.slice(0, cap);
        }

        const tryOv = await this.searchOpenverse(query, cap).catch(() => []);
        if (tryOv.length > 0) {
            return tryOv.slice(0, cap);
        }

        const simple = this.simplifyQueryForFallback(query);
        if (simple && simple !== query.trim()) {
            const tryWm2 = await this.searchWikimediaCommons(simple, cap).catch(() => []);
            if (tryWm2.length > 0) return tryWm2.slice(0, cap);
            const tryOv2 = await this.searchOpenverse(simple, cap).catch(() => []);
            if (tryOv2.length > 0) return tryOv2.slice(0, cap);
        }

        return [];
    }

    /**
     * Download image from URL and convert to base64
     * @param imageUrl URL of the image to download
     * @param targetSize Target size for width and height (default: 800)
     * @param quality JPEG quality 0-1 (default: 0.7)
     * @returns Base64 encoded image string
     */
    async downloadAndConvertToBase64(
        imageUrl: string,
        targetSize: number = 800,
        quality: number = 0.7
    ): Promise<string> {
        try {
            // Fetch the image with CORS mode
            const response = await fetch(imageUrl, { mode: 'cors' });
            if (!response.ok) {
                throw new Error('Resim indirilemedi.');
            }

            const blob = await response.blob();

            // Convert blob to base64 and resize
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = (e) => {
                    const img = new Image();
                    img.crossOrigin = 'anonymous';
                    img.onload = () => {
                        // Create canvas for resizing
                        const canvas = document.createElement('canvas');
                        const ctx = canvas.getContext('2d');

                        if (!ctx) {
                            reject(new Error('Canvas context oluşturulamadı.'));
                            return;
                        }

                        // Calculate dimensions to maintain aspect ratio
                        let width = img.width;
                        let height = img.height;

                        if (width > height) {
                            if (width > targetSize) {
                                height = (height * targetSize) / width;
                                width = targetSize;
                            }
                        } else {
                            if (height > targetSize) {
                                width = (width * targetSize) / height;
                                height = targetSize;
                            }
                        }

                        // Set canvas size
                        canvas.width = width;
                        canvas.height = height;

                        // Fill white background (for transparency)
                        ctx.fillStyle = '#FFFFFF';
                        ctx.fillRect(0, 0, width, height);

                        // Draw and compress
                        ctx.drawImage(img, 0, 0, width, height);

                        // Convert to base64 with compression
                        const base64 = canvas.toDataURL('image/jpeg', quality);
                        resolve(base64);
                    };

                    img.onerror = () => {
                        reject(new Error('Resim yüklenemedi.'));
                    };

                    img.src = e.target?.result as string;
                };

                reader.onerror = () => {
                    reject(new Error('Dosya okunamadı.'));
                };

                reader.readAsDataURL(blob);
            });
        } catch (error) {
            if (error instanceof Error) {
                throw error;
            }
            throw new Error('Resim işlenirken bir hata oluştu.');
        }
    }

    /**
     * Build search query from Turkish and English descriptions
     * @param descriptionTr Turkish description
     * @param descriptionEn English description
     * @returns Combined search query
     */
    buildSearchQuery(descriptionTr?: string, descriptionEn?: string): string {
        const queries: string[] = [];

        if (descriptionEn && descriptionEn.trim() !== '') {
            queries.push(descriptionEn.trim());
        } else if (descriptionTr && descriptionTr.trim() !== '') {
            // If only Turkish is available, use it (Unsplash can handle Turkish queries)
            queries.push(descriptionTr.trim());
        }

        if (queries.length === 0) {
            throw new Error('En az bir açıklama (TR veya EN) gereklidir.');
        }

        // Use English description if available, otherwise Turkish
        return queries[0];
    }
}

// Export singleton instance
export const imageSearchService = new ImageSearchService();

