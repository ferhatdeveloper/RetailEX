import React, { useState, useEffect } from 'react';
import { X, Search, Loader2, AlertCircle, Download } from 'lucide-react';
import { imageSearchService, type ImageSearchResult } from '../../services/imageSearchService';
import { toast } from 'sonner';
import { formatBytes, getBase64Size } from '../../utils/imageUtils';

interface ImageSearchModalProps {
    onSelect: (base64Image: string) => void;
    onClose: () => void;
    initialQuery?: string;
}

export const ImageSearchModal: React.FC<ImageSearchModalProps> = ({
    onSelect,
    onClose,
    initialQuery = '',
}) => {
    const [searchQuery, setSearchQuery] = useState(initialQuery);
    const [searchResults, setSearchResults] = useState<ImageSearchResult[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [isConverting, setIsConverting] = useState(false);
    const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Auto-search on mount if initial query is provided
    useEffect(() => {
        if (initialQuery && initialQuery.trim() !== '') {
            handleSearch();
        }
    }, []);

    const handleSearch = async () => {
        if (!searchQuery || searchQuery.trim() === '') {
            setError('Lütfen bir arama terimi girin.');
            return;
        }

        setIsSearching(true);
        setError(null);
        setSearchResults([]);

        try {
            const results = await imageSearchService.searchImages(searchQuery.trim(), 20);

            if (results.length === 0) {
                setError('Sonuç bulunamadı. Farklı bir arama terimi deneyin.');
            } else {
                setSearchResults(results);
            }
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Resim arama sırasında bir hata oluştu.';
            setError(errorMessage);
            toast.error(errorMessage);
        } finally {
            setIsSearching(false);
        }
    };

    const handleImageSelect = async (result: ImageSearchResult) => {
        setSelectedImageId(result.id);
        setIsConverting(true);

        try {
            // Download and convert to base64 (800x800, 70% quality)
            const base64Image = await imageSearchService.downloadAndConvertToBase64(
                result.fullUrl,
                800,
                0.7
            );

            const sizeInBytes = getBase64Size(base64Image);
            toast.success(`Resim seçildi (${formatBytes(sizeInBytes)})`);

            onSelect(base64Image);
            onClose();
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Resim işlenirken bir hata oluştu.';
            toast.error(errorMessage);
            setSelectedImageId(null);
        } finally {
            setIsConverting(false);
        }
    };

    const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            handleSearch();
        }
    };

    return (
        <div className="fixed inset-0 z-[10001] flex items-center justify-center p-4 bg-black/40 backdrop-blur-md">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
                    <div>
                        <h2 className="text-lg font-bold text-gray-900">İnternetten Resim Ara</h2>
                        <p className="text-xs text-gray-500 mt-0.5">Unsplash üzerinden ücretsiz, yüksek kaliteli resimler</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                        title="Kapat"
                    >
                        <X className="w-5 h-5 text-gray-500" />
                    </button>
                </div>

                {/* Search Bar */}
                <div className="px-6 py-4 border-b border-gray-200">
                    <div className="flex gap-2">
                        <div className="flex-1 relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                onKeyPress={handleKeyPress}
                                placeholder="Ürün açıklaması girin (örn: laptop, phone, coffee cup)"
                                className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                disabled={isSearching}
                            />
                        </div>
                        <button
                            onClick={handleSearch}
                            disabled={isSearching || !searchQuery.trim()}
                            className="px-6 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                        >
                            {isSearching ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Aranıyor...
                                </>
                            ) : (
                                <>
                                    <Search className="w-4 h-4" />
                                    Ara
                                </>
                            )}
                        </button>
                    </div>

                    {/* Info */}
                    <p className="text-xs text-gray-500 mt-2">
                        💡 İpucu: İngilizce arama terimleri daha iyi sonuç verir
                    </p>
                </div>

                {/* Results Area */}
                <div className="flex-1 overflow-y-auto p-6">
                    {/* Error State */}
                    {error && (
                        <div className="flex flex-col items-center justify-center py-12 text-center">
                            <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mb-4">
                                <AlertCircle className="w-8 h-8" />
                            </div>
                            <p className="text-sm font-medium text-gray-900 mb-1">Bir Hata Oluştu</p>
                            <p className="text-xs text-gray-500 max-w-md">{error}</p>
                        </div>
                    )}

                    {/* Loading State */}
                    {isSearching && (
                        <div className="flex flex-col items-center justify-center py-12">
                            <Loader2 className="w-12 h-12 text-blue-600 animate-spin mb-4" />
                            <p className="text-sm font-medium text-gray-700">Resimler aranıyor...</p>
                            <p className="text-xs text-gray-500 mt-1">Lütfen bekleyin</p>
                        </div>
                    )}

                    {/* Empty State */}
                    {!isSearching && !error && searchResults.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-12 text-center">
                            <div className="w-16 h-16 bg-gray-100 text-gray-400 rounded-full flex items-center justify-center mb-4">
                                <Search className="w-8 h-8" />
                            </div>
                            <p className="text-sm font-medium text-gray-700 mb-1">Resim Aramaya Başlayın</p>
                            <p className="text-xs text-gray-500 max-w-md">
                                Yukarıdaki arama kutusuna ürün açıklaması girerek resim arayabilirsiniz
                            </p>
                        </div>
                    )}

                    {/* Results Grid */}
                    {!isSearching && !error && searchResults.length > 0 && (
                        <>
                            <div className="mb-4">
                                <p className="text-sm font-medium text-gray-700">
                                    {searchResults.length} sonuç bulundu
                                </p>
                            </div>

                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                                {searchResults.map((result) => (
                                    <div
                                        key={result.id}
                                        className={`group relative cursor-pointer rounded-lg overflow-hidden border-2 transition-all ${selectedImageId === result.id
                                            ? 'border-blue-500 ring-2 ring-blue-200'
                                            : 'border-gray-200 hover:border-blue-300'
                                            }`}
                                        onClick={() => handleImageSelect(result)}
                                    >
                                        {/* Image */}
                                        <div className="aspect-square bg-gray-100">
                                            <img
                                                src={result.thumbnailUrl}
                                                alt={result.alt}
                                                className="w-full h-full object-cover"
                                                loading="lazy"
                                            />
                                        </div>

                                        {/* Overlay on Hover */}
                                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all flex items-center justify-center">
                                            <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                                                <div className="bg-white rounded-full p-3 shadow-lg">
                                                    <Download className="w-5 h-5 text-blue-600" />
                                                </div>
                                            </div>
                                        </div>

                                        {/* Loading Overlay */}
                                        {selectedImageId === result.id && isConverting && (
                                            <div className="absolute inset-0 bg-white/90 flex flex-col items-center justify-center">
                                                <Loader2 className="w-8 h-8 text-blue-600 animate-spin mb-2" />
                                                <p className="text-xs font-medium text-gray-700">İşleniyor...</p>
                                            </div>
                                        )}

                                        {/* Photographer Credit */}
                                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-2">
                                            <p className="text-[10px] text-white truncate">
                                                📷 {result.photographer}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-3 border-t border-gray-200 bg-gray-50">
                    <p className="text-xs text-gray-500 text-center">
                        Resimler{' '}
                        <a
                            href="https://unsplash.com"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline font-medium"
                        >
                            Unsplash
                        </a>
                        {' '}tarafından sağlanmaktadır • Seçilen resimler 800x800 boyutunda optimize edilir
                    </p>
                </div>
            </div>
        </div>
    );
};

