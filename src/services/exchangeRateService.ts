/**
 * Exchange Rate Service (v4.0)
 * 
 * Manages currency exchange rates using the centralized PostgreSQL + Rust infrastructure.
 * Provides real-time updates via WebSocket.
 */

import { postgres } from './postgres';
import { wsService } from './websocket';
import { logger } from '../utils/logger';

export interface ExchangeRate {
  id: string;
  currency_code: string;
  date: string;
  buy_rate: number;
  sell_rate: number;
  effective_buy?: number;
  effective_sell?: number;
  source: string;
  updated_at: string;
}

class ExchangeRateService {
  private listeners: Set<(rate: ExchangeRate) => void> = new Set();

  constructor() {
    // Subscribe to real-time updates from WebSocket
    wsService.on('EXCHANGE_RATE_UPDATED', (data: any) => {
      logger.info('?? Real-time exchange rate received:', data);

      const rate: ExchangeRate = {
        id: data.id || '',
        currency_code: data.currency_code,
        date: data.date,
        buy_rate: data.buy_rate,
        sell_rate: data.sell_rate,
        source: 'Logo',
        updated_at: new Date().toISOString()
      };

      this.notifyListeners(rate);
    });
  }

  /**
   * Get latest exchange rate for a currency from local PostgreSQL
   */
  async getLatestRate(currencyCode: string): Promise<ExchangeRate | null> {
    try {
      const result = await postgres.query<ExchangeRate>(`
                SELECT * FROM public.exchange_rates
                WHERE UPPER(TRIM(currency_code::text)) = UPPER(TRIM($1::text))
                ORDER BY date DESC, updated_at DESC
                LIMIT 1
            `, [currencyCode]);

      const row = result.rows[0];
      if (!row) return null;
      return {
        ...row,
        currency_code: String(row.currency_code ?? '').trim().toUpperCase()
      };
    } catch (error) {
      logger.error('Failed to fetch latest rate:', error);
      return null;
    }
  }

  /**
   * Get all rates for a specific date
   */
  async getRatesByDate(date: string): Promise<ExchangeRate[]> {
    try {
      const result = await postgres.query<ExchangeRate>(`
                SELECT * FROM public.exchange_rates 
                WHERE date = $1 
                ORDER BY currency_code ASC
            `, [date]);
      return result.rows;
    } catch (error) {
      logger.error('Failed to fetch rates by date:', error);
      return [];
    }
  }

  /**
   * Subscribe to real-time rate updates
   */
  subscribe(callback: (rate: ExchangeRate) => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  private notifyListeners(rate: ExchangeRate) {
    this.listeners.forEach(callback => {
      try {
        callback(rate);
      } catch (error) {
        logger.error('Error in exchange rate listener:', error);
      }
    });
  }

  /**
   * Convert amount between currencies using latest rates
   */
  async convert(amount: number, from: string, to: string): Promise<number> {
    if (from === to) return amount;

    const fromRate = from === 'IQD' ? { buy_rate: 1 } : await this.getLatestRate(from);
    const toRate = to === 'IQD' ? { buy_rate: 1 } : await this.getLatestRate(to);

    if (!fromRate || !toRate) {
      logger.warn(`Conversion failed: Rate missing for ${from} or ${to}`);
      return amount;
    }

    // Calculation: Amount * (FromRate / ToRate)
    // Example: 100 USD to IQD -> 100 * (1500 / 1) = 150,000 IQD
    return (amount * Number(fromRate.buy_rate)) / Number(toRate.buy_rate);
  }
}

export const exchangeRateService = new ExchangeRateService();


