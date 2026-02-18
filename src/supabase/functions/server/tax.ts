/**
 * ExRetailOS - Tax Service (Backend)
 * 
 * Tax calculation and reporting endpoints
 * 
 * @created 2024-12-24
 */

import { Hono } from "npm:hono";
import { createClient } from 'jsr:@supabase/supabase-js@2';

const app = new Hono();

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

// ===== TAX CALCULATION =====

/**
 * POST /tax/calculate-vat
 * Calculate VAT for a single amount
 */
app.post("/calculate-vat", async (c) => {
  try {
    const { amount, taxRate, includesTax } = await c.req.json();

    if (typeof amount !== 'number' || typeof taxRate !== 'number') {
      return c.json({ error: 'Invalid input: amount and taxRate must be numbers' }, 400);
    }

    let netAmount: number;
    let taxAmount: number;
    let grossAmount: number;

    if (includesTax) {
      // Calculate from gross amount
      const divisor = 1 + (taxRate / 100);
      netAmount = amount / divisor;
      taxAmount = amount - netAmount;
      grossAmount = amount;
    } else {
      // Calculate from net amount
      netAmount = amount;
      taxAmount = (amount * taxRate) / 100;
      grossAmount = amount + taxAmount;
    }

    return c.json({
      success: true,
      result: {
        netAmount: Math.round(netAmount * 100) / 100,
        taxAmount: Math.round(taxAmount * 100) / 100,
        grossAmount: Math.round(grossAmount * 100) / 100,
        taxRate
      }
    });
  } catch (error: any) {
    console.error('[Tax] Calculate VAT error:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

/**
 * POST /tax/withholding-tax
 * Calculate withholding tax
 */
app.post("/withholding-tax", async (c) => {
  try {
    const { amount, withholdingRate } = await c.req.json();

    if (typeof amount !== 'number' || typeof withholdingRate !== 'number') {
      return c.json({ error: 'Invalid input: amount and withholdingRate must be numbers' }, 400);
    }

    const withholdingAmount = (amount * withholdingRate) / 100;
    const netPayable = amount - withholdingAmount;

    return c.json({
      success: true,
      result: {
        grossAmount: amount,
        withholdingRate,
        withholdingAmount: Math.round(withholdingAmount * 100) / 100,
        netPayable: Math.round(netPayable * 100) / 100
      }
    });
  } catch (error: any) {
    console.error('[Tax] Calculate withholding tax error:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

/**
 * POST /tax/invoice-tax
 * Calculate tax for entire invoice
 */
app.post("/invoice-tax", async (c) => {
  try {
    const { items, invoiceType, withholdingRate = 0 } = await c.req.json();

    if (!Array.isArray(items)) {
      return c.json({ error: 'Invalid input: items must be an array' }, 400);
    }

    const itemTaxes = items.map((item: any) => {
      const netAmount = item.quantity * item.unitPrice;
      const taxAmount = (netAmount * item.taxRate) / 100;
      const grossAmount = netAmount + taxAmount;
      
      let withholdingTaxAmount: number | undefined;
      if (withholdingRate > 0) {
        withholdingTaxAmount = (netAmount * withholdingRate) / 100;
      }

      return {
        productId: item.productId || '',
        productName: item.productName || '',
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        netAmount: Math.round(netAmount * 100) / 100,
        taxRate: item.taxRate,
        taxAmount: Math.round(taxAmount * 100) / 100,
        withholdingTaxAmount: withholdingTaxAmount ? Math.round(withholdingTaxAmount * 100) / 100 : undefined,
        grossAmount: Math.round(grossAmount * 100) / 100
      };
    });

    const subtotal = itemTaxes.reduce((sum: number, item: any) => sum + item.netAmount, 0);
    const totalTax = itemTaxes.reduce((sum: number, item: any) => sum + item.taxAmount, 0);
    const totalWithholdingTax = itemTaxes.reduce((sum: number, item: any) => sum + (item.withholdingTaxAmount || 0), 0);
    const grandTotal = subtotal + totalTax;

    // Group by tax rate
    const taxByRateMap = new Map<number, { taxBase: number; taxAmount: number }>();
    
    itemTaxes.forEach((item: any) => {
      const existing = taxByRateMap.get(item.taxRate);
      if (existing) {
        existing.taxBase += item.netAmount;
        existing.taxAmount += item.taxAmount;
      } else {
        taxByRateMap.set(item.taxRate, {
          taxBase: item.netAmount,
          taxAmount: item.taxAmount
        });
      }
    });

    const taxByRate = Array.from(taxByRateMap.entries()).map(([rate, data]) => ({
      rate,
      taxBase: Math.round(data.taxBase * 100) / 100,
      taxAmount: Math.round(data.taxAmount * 100) / 100
    }));

    return c.json({
      success: true,
      result: {
        invoiceType,
        subtotal: Math.round(subtotal * 100) / 100,
        items: itemTaxes,
        totalTax: Math.round(totalTax * 100) / 100,
        totalWithholdingTax: Math.round(totalWithholdingTax * 100) / 100,
        grandTotal: Math.round(grandTotal * 100) / 100,
        taxByRate
      }
    });
  } catch (error: any) {
    console.error('[Tax] Calculate invoice tax error:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

/**
 * GET /tax/vat-report
 * Generate VAT report for a period
 */
app.get("/vat-report", async (c) => {
  try {
    const firma_id = c.req.query("firma_id");
    const donem_id = c.req.query("donem_id");
    const startDate = c.req.query("start_date");
    const endDate = c.req.query("end_date");

    if (!firma_id || !donem_id || !startDate || !endDate) {
      return c.json({ 
        error: 'Missing required parameters: firma_id, donem_id, start_date, end_date' 
      }, 400);
    }

    // In a real implementation, query invoices from database
    // For now, return a mock structure
    const report = {
      startDate,
      endDate,
      salesVAT: {
        taxBase: 0,
        taxAmount: 0,
        invoiceCount: 0
      },
      purchaseVAT: {
        taxBase: 0,
        taxAmount: 0,
        invoiceCount: 0
      },
      netVAT: 0,
      vatToPayOrRefund: 0
    };

    return c.json({
      success: true,
      report
    });
  } catch (error: any) {
    console.error('[Tax] VAT report error:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

/**
 * GET /tax/monthly-declaration
 * Get monthly tax declaration summary
 */
app.get("/monthly-declaration", async (c) => {
  try {
    const firma_id = c.req.query("firma_id");
    const donem_id = c.req.query("donem_id");
    const year = c.req.query("year");
    const month = c.req.query("month");

    if (!firma_id || !donem_id || !year || !month) {
      return c.json({ 
        error: 'Missing required parameters: firma_id, donem_id, year, month' 
      }, 400);
    }

    // In a real implementation, aggregate all invoices for the month
    const declaration = {
      year: parseInt(year),
      month: parseInt(month),
      salesVAT: 0,
      purchaseVAT: 0,
      netVAT: 0,
      withholdingTax: 0,
      status: 'DRAFT' // DRAFT, SUBMITTED, APPROVED
    };

    return c.json({
      success: true,
      declaration
    });
  } catch (error: any) {
    console.error('[Tax] Monthly declaration error:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

export default app;

