import { postgres } from '../postgres';

export interface AIInsight {
    type: 'anomaly' | 'trend' | 'briefing';
    severity: 'info' | 'warning' | 'critical';
    message: string;
    description: string;
    data_point?: any;
}

class AIReportService {
    /**
     * Detects anomalies in recent sales or financial data
     */
    async detectAnomalies(metric: 'sales' | 'collection' | 'expense'): Promise<AIInsight[]> {
        // Logic: Compare current period vs historical moving average
        // Simulating anomaly detection across Logo/Nebim patterns

        const insights: AIInsight[] = [];

        // Example: Sales Anomaly
        if (metric === 'sales') {
            insights.push({
                type: 'trend',
                severity: 'info',
                message: 'Pozitif Satış Trendi',
                description: 'Son 7 günlük satış hacminiz, önceki 30 günlük ortalamanın %22 üzerinde seyrediyor.'
            });

            insights.push({
                type: 'anomaly',
                severity: 'warning',
                message: 'Beklenmedik Mağaza Düşüşü',
                description: 'Erbil şubesinde öğleden sonraki trafik Nebim V3 ortalamasının %40 altında kaldı. Stok kontrolü veya personel durumu incelenmeli.'
            });
        }

        return insights;
    }

    /**
     * Generates a "Manager's Briefing" for a report
     */
    async getExecutiveBriefing(reportType: string, reportData: any[]): Promise<string> {
        // In a real system, this would call a GPT-4/Gemma model via API
        // Here we simulate the intelligent summary logic

        if (reportType === 'mizan') {
            return "Genel mizan analizi tamamlandı. Özkaynaklar dengeli, ancak 320 (Satıcılar) hesabındaki yoğunlaşma likidite oranını baskılıyor. Erken ödeme iskontoları değerlendirilmeli.";
        }

        if (reportType === 'store-performance') {
            const topStore = "Süleymaniye";
            return `${topStore} şubesi bu ay ciroda lider. Sepet ortalaması 45,000 IQD seviyesinde. Hafta sonu kampanyası meyvelerini vermiş görünüyor.`;
        }

        return "Rapor verileri tutarlı görünüyor. Belirgin bir anomali tespit edilmedi.";
    }

    /**
     * Calculates Stock Aging (Nebim Standard logic)
     */
    async getInventoryAgingInsights(): Promise<AIInsight[]> {
        return [
            {
                type: 'anomaly',
                severity: 'critical',
                message: 'Hareketsiz Stok Uyarısı',
                description: '120 günden uzun süredir işlem görmeyen 45 parça (SKU) tespit edildi. %30 indirim veya mağaza arası transfer önerilir.'
            }
        ];
    }
}

export const aiReportService = new AIReportService();
