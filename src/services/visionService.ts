/**
 * Vision Service - Image Analysis and OCR for ExRetailOS
 * Extracted data is used for automatic form filling and product identification.
 */

export interface ExtractedItem {
    id?: string;
    product_id?: string;
    code?: string;
    name?: string;
    barcode?: string;
    quantity: number;
    price: number;
    total: number;
}

export interface VisionResult {
    success: boolean;
    type: 'invoice' | 'product' | 'barcode' | 'unknown';
    confidence: number;
    items: ExtractedItem[];
    supplier?: string;
    customer?: string;
    totalAmount?: number;
    date?: string;
    rawText?: string;
}

import Tesseract from 'tesseract.js';

class VisionService {
    /**
     * Process an image (base64) to extract business data using Tesseract.js
     */
    async analyzeImage(base64: string): Promise<VisionResult> {
        console.log('[VisionService] Analyzing image with Tesseract.js...');

        try {
            const { data: { text } } = await Tesseract.recognize(
                base64,
                'eng+tur', // Support English and Turkish
                { logger: m => console.log(m) }
            );

            console.log('[VisionService] OCR Text:', text);
            return this.parseInvoiceText(text);

        } catch (error) {
            console.error('[VisionService] OCR Error:', error);
            // Fallback to error result
            return {
                success: false,
                type: 'unknown',
                confidence: 0,
                items: [],
                rawText: ''
            };
        }
    }

    /**
     * Parse raw OCR text into structured data
     */
    /**
     * Parse raw OCR text into structured data
     */
    private parseInvoiceText(text: string): VisionResult {
        const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

        let supplier = '';
        let date = '';
        let totalAmount = 0;
        const items: ExtractedItem[] = [];

        // 1. Extract Supplier (First non-empty line that isn't a date or standard header)
        for (const line of lines) {
            if (line.length > 3 && !/^\d+$/.test(line) && !line.toLowerCase().includes('invoice') && !line.toLowerCase().includes('date')) {
                supplier = line;
                break;
            }
        }

        // 2. Extract Date (Improved regex)
        // Matches: DD/MM/YYYY, DD.MM.YYYY, YYYY-MM-DD, Jan 01 2024, 01 Jan 2024
        const dateRegex = /(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})|([A-Za-z]+\s\d{1,2},?\s\d{4})|(\d{1,2}\s[A-Za-z]+\s\d{4})/;
        const dateMatch = text.match(dateRegex);
        if (dateMatch) {
            date = dateMatch[0];
        }

        // 3. Extract Total Amount
        // Look for explicit Total lines first
        const totalRegex = /(?:total|toplam|amount paid|grand total|tutar)[^0-9$£€]*([$£€]?\s?[\d,.]+)/i;
        const matchTotal = text.match(totalRegex);
        if (matchTotal) {
            totalAmount = this.parseMoney(matchTotal[1]);
        }

        // 4. Extract Items (Reviewing distinct patterns)
        // OpenAI-style: "ChatGPT Plus Subscription 1 $20.00 ..."
        // Generic: "Item Name 2 10.00 20.00"

        // Loop through lines to find potential item rows
        for (const line of lines) {
            // Regex to match a line ending in a number (Price/Total)
            // It might have a Quantity before the price or just a price
            // Example: "Widget Name 2 x 50.00" or "Widget Name 100.00"

            // OpenAI Specific / Subscription: "ChatGPT Plus Subscription 1 $20.00 20% $20.00"
            // Capture: (Description) (Qty) (Price) ... (Total)
            const itemRegex = /^(.+?)\s+(\d+)\s+([$£€]?[\d,.]+).+?([$£€]?[\d,.]+)$/i;

            // OpenAI Specific: sometimes quantity is implicit or 1
            const subscriptionRegex = /^(ChatGPT|Subscription|Service|Hizmet).+?([$£€]?[\d,.]+)$/i;

            const simpleItemRegex = /^(.+?)\s+([$£€]?[\d,.]+)$/i;

            const complexMatch = line.match(itemRegex);
            const subMatch = line.match(subscriptionRegex);
            const simpleMatch = line.match(simpleItemRegex);

            if (complexMatch) {
                const name = complexMatch[1].trim();
                const qty = parseInt(complexMatch[2]);
                const price = this.parseMoney(complexMatch[3]);
                const total = this.parseMoney(complexMatch[4]);

                if (name.toLowerCase() !== 'description' && price > 0) {
                    items.push({
                        name,
                        quantity: qty,
                        price: price,
                        total: total
                    });
                }
            }
            // Handle specific subscription lines like "ChatGPT Plus Subscription $20.00"
            else if (subMatch) {
                const name = subMatch[1].trim() + (line.substring(subMatch[1].length, line.indexOf(subMatch[2])).trim());
                const val = this.parseMoney(subMatch[2]);
                if (val > 0) {
                    items.push({
                        name: name.trim(),
                        quantity: 1,
                        price: val,
                        total: val
                    });
                }
            }
            // Only use simple match if we haven't found complex ones and the amount is likely the item price
            // And avoid lines that look like "Total 100.00"
            else if (simpleMatch && !line.toLowerCase().includes('total') && !line.toLowerCase().includes('amount') && !line.toLowerCase().includes('toplam')) {
                const name = simpleMatch[1].trim();
                const val = this.parseMoney(simpleMatch[2]);

                // Heuristic: If value is smallish or typically item-priced, take it.
                // Also ignore short garbage lines
                if (name.length > 5 && val > 0) {
                    items.push({
                        name,
                        quantity: 1,
                        price: val,
                        total: val
                    });
                }
            }
        }

        // Fallback if no items found but we have a total
        if (items.length === 0 && totalAmount > 0) {
            items.push({
                quantity: 1,
                name: 'Genel Hizmet/Ürün Bedeli', // Changed from "Tespit Edilen Kalemler" to look more professional
                price: totalAmount,
                total: totalAmount
            });
        }

        return {
            success: true,
            type: 'invoice',
            confidence: items.length > 0 ? 0.9 : 0.6,
            supplier: supplier || 'Bilinmeyen Tedarikçi',
            totalAmount,
            date: date || new Date().toLocaleDateString('tr-TR'),
            items,
            rawText: text
        };
    }

    private parseMoney(str: string): number {
        if (!str) return 0;
        // Verify it's not just a year (e.g. 2025) which regex might pick up
        if (/^20\d{2}$/.test(str)) return 0;

        // Remove currency symbols and spaces
        let clean = str.replace(/[$£€\s]/g, '');

        // Handle 1,000.00 vs 1.000,00
        // If both , and . exist
        if (clean.includes(',') && clean.includes('.')) {
            if (clean.lastIndexOf(',') > clean.lastIndexOf('.')) {
                // 1.000,00 -> remove dots, replace comma with dot
                clean = clean.replace(/\./g, '').replace(',', '.');
            } else {
                // 1,000.00 -> remove commas
                clean = clean.replace(/,/g, '');
            }
        } else if (clean.includes(',')) {
            // If only comma, assume it's like 10,00 or 1,000 (ambiguous, usually decimal in TR, thousands in US)
            // For OpenAI receipt ($20.00), it uses dot. 
            // If we see $ sign in original text, it's likely dot-decimal.
            // Let's assume standard programming format if ambiguous for now or try to parse
            if (clean.split(',').length > 2) {
                // 1,000,000 -> thousands sep
                clean = clean.replace(/,/g, '');
            } else {
                // 10,50 -> decimal
                clean = clean.replace(',', '.');
            }
        }

        return parseFloat(clean) || 0;
    }

    /**
     * Helper to check if a string is a valid barcode
     */
    isBarcode(text: string): boolean {
        return /^\d{8,14}$/.test(text.trim());
    }
}

export const visionService = new VisionService();

