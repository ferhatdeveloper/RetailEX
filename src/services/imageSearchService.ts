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

export interface ImageSearchResult {
    id: string;
    thumbnailUrl: string;
    fullUrl: string;
    photographer: string;
    alt: string;
}

class ImageSearchService {
    // Unsplash API access key - from user's account
    private readonly accessKey = '1FFOIAechGg0wI8QyeZG0710PE1uZRSfDmuNA6aZ5yo';
    private readonly baseUrl = 'https://api.unsplash.com';

    /**
     * Search for images using Unsplash API
     * @param query Search query (works with Turkish and English)
     * @param perPage Number of results per page (default: 20, max: 30)
     * @param page Page number (default: 1)
     * @returns Array of image search results
     */
    async searchImages(
        query: string,
        perPage: number = 20,
        page: number = 1
    ): Promise<ImageSearchResult[]> {
        if (!query || query.trim() === '') {
            throw new Error('Arama terimi boş olamaz.');
        }

        try {
            const url = `${this.baseUrl}/search/photos?query=${encodeURIComponent(query)}&per_page=${Math.min(perPage, 30)}&page=${page}&client_id=${this.accessKey}`;

            const response = await fetch(url);

            if (!response.ok) {
                if (response.status === 401) {
                    throw new Error('API erişim hatası. Lütfen daha sonra tekrar deneyin.');
                } else if (response.status === 403) {
                    throw new Error('API limit aşıldı. Lütfen daha sonra tekrar deneyin.');
                }
                throw new Error(`API hatası: ${response.status} ${response.statusText}`);
            }

            const data: UnsplashSearchResponse = await response.json();

            if (!data.results || data.results.length === 0) {
                return [];
            }

            // Convert to our simplified format
            return data.results.map((photo) => ({
                id: photo.id,
                thumbnailUrl: photo.urls.small, // 400px width
                fullUrl: photo.urls.regular, // 1080px width
                photographer: photo.user.name,
                alt: photo.alt_description || photo.description || query,
            }));
        } catch (error) {
            if (error instanceof Error) {
                throw error;
            }
            throw new Error('Resim arama sırasında bir hata oluştu.');
        }
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

