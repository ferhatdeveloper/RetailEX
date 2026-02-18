// src/services/voiceCommandRouter.ts
import { useNavigate } from 'react-router-dom';
import { dashboardAPI } from './api/dashboard';
import { VoiceCommandResult } from './voiceTypes';

export class VoiceCommandRouter {
    private navigate: any;

    constructor(navigate: any) {
        this.navigate = navigate;
    }

    /**
     * Route a voice command to the appropriate action
     */
    async routeCommand(result: VoiceCommandResult): Promise<void> {
        if (!result.success) {
            console.warn('Voice command failed:', result.response_text);
            return;
        }

        switch (result.action) {
            case 'navigate':
                await this.handleNavigation(result);
                break;
            case 'query':
                await this.handleQuery(result);
                break;
            case 'create':
                await this.handleCreate(result);
                break;
            case 'process':
                await this.handleProcess(result);
                break;
            case 'update':
                await this.handleUpdate(result);
                break;
            case 'query_data':
                await this.handleQueryData(result);
                break;
            default:
                console.warn('Unknown action:', result.action);
        }
    }

    /**
     * Handle navigation commands
     */
    private async handleNavigation(result: VoiceCommandResult): Promise<void> {
        if (result.navigation_path) {
            console.log('Navigating to:', result.navigation_path);

            // Store form data in sessionStorage if available
            if (result.form_data) {
                sessionStorage.setItem('voiceCommandFormData', JSON.stringify(result.form_data));
            }

            // Navigate to the path (URL change)
            this.navigate(result.navigation_path);

            // Trigger internal screen change for ManagementModule
            this.triggerInternalNavigation(result.navigation_path);

            // Fetch proactive insights for this path
            const insight = await this.getProactiveInsight(result.navigation_path);
            if (insight) {
                result.response_text = `${result.response_text}\n\nğŸ’¡ Not: ${insight}`;
                // Small delay before speaking the insight if speech is already happening
                setTimeout(() => {
                    const voiceService = (window as any).voiceService;
                    if (voiceService) voiceService.speak(insight);
                }, 2000);
            }

            // Dispatch custom event for components to listen
            window.dispatchEvent(new CustomEvent('voiceCommandNavigate', {
                detail: {
                    intent: result.intent,
                    path: result.navigation_path,
                    formData: result.form_data,
                }
            }));
        }
    }

    /**
     * Trigger internal navigation event for ManagementModule
     */
    private triggerInternalNavigation(path: string): void {
        const screenMap: Record<string, string> = {
            '/products': 'products',
            '/customers': 'customers',
            '/stock': 'stock',
            '/reports': 'reports',
            '/dashboard': 'dashboard',
            '/sales-invoice': 'salesinvoice',
            '/purchase-invoice': 'purchaseinvoice',
            '/products/new': 'products', // Add new product
            '/customers/new': 'customers', // Add new customer
            '/usermanagement': 'usermanagement',
        };

        const screen = screenMap[path];
        if (screen) {
            console.log('Triggering internal screen change:', screen);

            // If it's a management path, ensure MainLayout switches to management module
            const managementPaths = ['/products', '/customers', '/stock', '/reports', '/dashboard', '/sales-invoice', '/purchase-invoice', '/usermanagement'];
            if (managementPaths.some(p => path.startsWith(p))) {
                window.dispatchEvent(new CustomEvent('switchToManagement'));
            }

            window.dispatchEvent(new CustomEvent('navigateToScreen', { detail: screen }));
        }
    }

    /**
     * Handle query/search commands
     */
    private async handleQuery(result: VoiceCommandResult): Promise<void> {
        console.log('Executing query:', result.intent, result.parameters);

        // Dispatch event for query execution
        window.dispatchEvent(new CustomEvent('voiceCommandQuery', {
            detail: {
                intent: result.intent,
                parameters: result.parameters,
                formData: result.form_data,
            }
        }));

        // Navigate to appropriate module with search params
        const searchQuery = result.parameters.name || result.parameters.product || '';

        switch (result.intent) {
            case 'search_customer':
                this.navigate('/customers', { state: { searchQuery } });
                this.triggerInternalNavigation('/customers');
                break;
            case 'search_product':
                this.navigate('/products', { state: { searchQuery } });
                this.triggerInternalNavigation('/products');
                break;
            case 'check_stock':
                this.navigate('/stock', { state: { searchQuery } });
                this.triggerInternalNavigation('/stock');
                break;
            case 'show_today_sales':
                this.navigate('/reports', { state: { reportType: 'daily_sales' } });
                this.triggerInternalNavigation('/reports');
                break;
            case 'get_help':
                // Open help or show suggestions
                window.dispatchEvent(new CustomEvent('voiceCommandShowHelp'));
                break;
            default:
                console.log('Query intent not mapped:', result.intent);
        }
    }

    /**
     * Handle create/add commands
     */
    private async handleCreate(result: VoiceCommandResult): Promise<void> {
        console.log('Creating new record:', result.intent, result.form_data);

        // Store form data for the target page
        if (result.form_data) {
            sessionStorage.setItem('voiceCommandFormData', JSON.stringify(result.form_data));
        }

        // Navigate to creation page
        if (result.navigation_path) {
            this.navigate(result.navigation_path);
            this.triggerInternalNavigation(result.navigation_path);
        }

        // Dispatch event
        window.dispatchEvent(new CustomEvent('voiceCommandCreate', {
            detail: {
                intent: result.intent,
                formData: result.form_data,
            }
        }));
    }

    /**
     * Handle smart data queries (NLQ)
     */
    private async handleQueryData(result: VoiceCommandResult): Promise<void> {
        console.log('Executing smart query:', result.intent);
        let finalResponse = result.response_text;

        try {
            switch (result.intent) {
                case 'query_revenue': {
                    const stats = await dashboardAPI.getStats();
                    finalResponse = `Bugün toplam ${stats.totalRevenue.toLocaleString('tr-TR')} TL ciro yapıldı. Toplam işlem sayısı ${stats.totalTransactions}.`;
                    break;
                }
                case 'query_stock_summary': {
                    const stats = await dashboardAPI.getStats();
                    if (stats.criticalAlerts > 0) {
                        finalResponse = `Şu anda ${stats.criticalAlerts} adet ürünün stoğu kritik seviyenin altında. Detayları stok sayfasında görebilirsiniz.`;
                    } else {
                        finalResponse = "Stok durumunuz şu an mükemmel, kritik seviyede ürün bulunmuyor.";
                    }
                    break;
                }
                case 'query_top_performer': {
                    const stores = await dashboardAPI.getStoreList();
                    const topStore = stores.sort((a, b) => b.revenue - a.revenue)[0];
                    if (topStore) {
                        finalResponse = `Bugün en çok satışı ${topStore.revenue.toLocaleString('tr-TR')} TL ile ${topStore.name} mağazamız gerçekleştirdi.`;
                    } else {
                        finalResponse = "Satış verisi bulunan herhangi bir mağaza henüz kaydedilmemiş.";
                    }
                    break;
                }
            }

            // Speak and update result
            const voiceService = (window as any).voiceService;
            if (voiceService) {
                voiceService.speak(finalResponse);
            }

            // Dispatch event so UI can show the updated response
            window.dispatchEvent(new CustomEvent('voiceCommandDataResult', {
                detail: { response: finalResponse }
            }));

        } catch (error) {
            console.error('[VoiceCommandRouter] Smart query failed:', error);
        }
    }

    /**
     * Handle update commands for form fields
     */
    private async handleUpdate(result: VoiceCommandResult): Promise<void> {
        console.log('Executing update:', result.intent, result.parameters);

        // Dispatch event for form update
        window.dispatchEvent(new CustomEvent('voiceCommandUpdateForm', {
            detail: {
                field: result.parameters.field,
                value: result.parameters.value,
            }
        }));
    }

    /**
     * Handle process/action commands
     */
    private async handleProcess(result: VoiceCommandResult): Promise<void> {
        console.log('Processing action:', result.intent);

        if (result.intent === 'save_form') {
            window.dispatchEvent(new CustomEvent('voiceCommandSaveForm'));
            return;
        }

        // Dispatch event for processing
        window.dispatchEvent(new CustomEvent('voiceCommandProcess', {
            detail: {
                intent: result.intent,
                parameters: result.parameters,
            }
        }));
    }

    /**
     * Get suggested commands based on current location
     */
    static getSuggestedCommands(currentPath: string): string[] {
        const suggestions: Record<string, string[]> = {
            '/': [
                'Satış faturası aç',
                'Ürünleri göster',
                'Müşteri listesi',
                'Bugünkü satışlar',
            ],
            '/products': [
                'Yeni ürün ekle',
                'Çikolata ara',
                'Stok durumu',
            ],
            '/customers': [
                'Yeni müşteri ekle',
                'Ahmet Yılmaz ara',
            ],
            '/sales-invoice': [
                'Yeni fatura oluştur',
                'Bugünkü satışlar',
            ],
        };

        return suggestions[currentPath] || suggestions['/'];
    }

    /**
     * Get command history from localStorage
     */
    static getCommandHistory(): string[] {
        const history = localStorage.getItem('voiceCommandHistory');
        return history ? JSON.parse(history) : [];
    }

    /**
     * Save command to history
     */
    static saveCommandToHistory(transcript: string): void {
        const history = this.getCommandHistory();
        history.unshift(transcript);

        // Keep only last 20 commands
        const trimmedHistory = history.slice(0, 20);
        localStorage.setItem('voiceCommandHistory', JSON.stringify(trimmedHistory));
    }

    /**
     * Clear command history
     */
    /**
     * Clear command history
     */
    static clearCommandHistory(): void {
        localStorage.removeItem('voiceCommandHistory');
    }

    /**
     * Get proactive insights based on navigation using REAL data
     */
    private async getProactiveInsight(path: string): Promise<string | null> {
        try {
            switch (path) {
                case '/dashboard': {
                    const stats = await dashboardAPI.getStats();
                    if (stats.criticalAlerts > 0) {
                        return `Dashboard hazır. Bugün toplam ${stats.totalRevenue.toLocaleString('tr-TR')} TL satış yapıldı. Dikkat: ${stats.criticalAlerts} ürün kritik stok seviyesinde.`;
                    }
                    return `Dashboard açıldı. Bugün toplam ${stats.totalRevenue.toLocaleString('tr-TR')} TL tutarında ${stats.totalTransactions} işlem gerçekleşti.`;
                }
                case '/stock': {
                    const alerts = await dashboardAPI.getCriticalAlerts(3);
                    if (alerts.length > 0) {
                        return `Stok yönetimi açıldı. ${alerts[0].message} gibi kritik uyarılar var.`;
                    }
                    return "Stok durumu güncel, kritik bir uyarı bulunmuyor.";
                }
                case '/customers': {
                    const stores = await dashboardAPI.getStoreList();
                    const topStore = stores.sort((a, b) => b.revenue - a.revenue)[0];
                    if (topStore) {
                        return `Müşteri listesi açıldı. Bugün en iyi performansı ${topStore.revenue.toLocaleString('tr-TR')} TL ciro ile ${topStore.name} mağazası gösteriyor.`;
                    }
                    return "Müşteri listesi hazır.";
                }
                case '/reports':
                    return "Raporlar ekranı hazır. Hangi raporu incelemek istersiniz?";
                default:
                    return null;
            }
        } catch (error) {
            console.error('[VoiceCommandRouter] Insight fetch failed:', error);
            // Fallback to static insights if API fails
            const fallbacks: Record<string, string> = {
                '/dashboard': "Gözden geçirmeniz gereken vadesi geçmiş faturalar olabilir.",
                '/stock': "Bazı ürünlerin stok seviyesi düşmüş olabilir.",
                '/sales-invoice': "Bugün yeni satışlar kaydedildi."
            };
            return fallbacks[path] || null;
        }
    }
}

/**
 * Hook to use voice command router
 */
export function useVoiceCommandRouter() {
    const navigate = useNavigate();
    const router = new VoiceCommandRouter(navigate);

    return {
        routeCommand: (result: VoiceCommandResult) => router.routeCommand(result),
        getSuggestedCommands: (path: string) => VoiceCommandRouter.getSuggestedCommands(path),
        getCommandHistory: () => VoiceCommandRouter.getCommandHistory(),
        saveCommandToHistory: (transcript: string) => VoiceCommandRouter.saveCommandToHistory(transcript),
        clearCommandHistory: () => VoiceCommandRouter.clearCommandHistory(),
    };
}

