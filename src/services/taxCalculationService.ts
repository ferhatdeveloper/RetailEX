/**
 * ExRetailOS - Tax Calculation Service
 * 
 * Comprehensive tax calculation system supporting:
 * - VAT/TAX calculation (multiple rates)
 * - Withholding tax (stopaj/tevkifat)
 * - Iraq-specific tax rules
 * - Tax-free/exempt items
 * - Tax reports and summaries
 * 
 * @created 2024-12-24
 */

// ===== TYPES =====

export interface TaxRate {
  id: string;
  name: string;
  rate: number; // Percentage (e.g., 20 for 20%)
  country: 'TR' | 'IQ' | 'GLOBAL';
  isDefault: boolean;
  isActive: boolean;
}

export interface WithholdingTaxRate {
  id: string;
  name: string;
  rate: number; // Percentage
  description: string;
  isActive: boolean;
}

export interface TaxCalculationInput {
  amount: number; // Net amount or gross amount
  taxRate: number; // Percentage
  includesTax: boolean; // true = gross amount, false = net amount
  quantity?: number;
  withholding?: {
    enabled: boolean;
    rate: number;
  };
}

export interface TaxCalculationResult {
  netAmount: number; // Amount before tax
  taxAmount: number; // Tax value
  grossAmount: number; // Amount including tax
  withholdingTaxAmount?: number; // Withholding tax if applicable
  finalAmount?: number; // After withholding tax deduction
  details: {
    taxRate: number;
    taxBase: number; // Tax base (matrah)
    withholdingRate?: number;
  };
}

export interface InvoiceTaxSummary {
  invoiceType: 'SALES' | 'PURCHASE';
  subtotal: number; // Before tax
  items: InvoiceItemTax[];
  totalTax: number;
  totalWithholdingTax: number;
  grandTotal: number;
  taxByRate: {
    rate: number;
    taxBase: number;
    taxAmount: number;
  }[];
}

export interface InvoiceItemTax {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  netAmount: number;
  taxRate: number;
  taxAmount: number;
  withholdingTaxAmount?: number;
  grossAmount: number;
}

// ===== TAX RATES DATABASE =====

// Standard VAT/TAX rates
export const TAX_RATES: TaxRate[] = [
  {
    id: 'vat-0',
    name: 'İstisna (0%)',
    rate: 0,
    country: 'GLOBAL',
    isDefault: false,
    isActive: true
  },
  {
    id: 'vat-1',
    name: 'TAX %1',
    rate: 1,
    country: 'TR',
    isDefault: false,
    isActive: true
  },
  {
    id: 'vat-10',
    name: 'TAX %10',
    rate: 10,
    country: 'TR',
    isDefault: false,
    isActive: true
  },
  {
    id: 'vat-20',
    name: 'TAX %20',
    rate: 20,
    country: 'TR',
    isDefault: true,
    isActive: true
  },
  {
    id: 'vat-iraq-sales',
    name: 'Iraq Sales Tax',
    rate: 0, // Iraq typically has 0% VAT on most items
    country: 'IQ',
    isDefault: true,
    isActive: true
  }
];

// Withholding tax rates (Stopaj/Tevkifat)
export const WITHHOLDING_TAX_RATES: WithholdingTaxRate[] = [
  {
    id: 'stopaj-none',
    name: 'Stopaj Yok',
    rate: 0,
    description: 'No withholding tax',
    isActive: true
  },
  {
    id: 'stopaj-1',
    name: 'Stopaj %1',
    rate: 1,
    description: 'Professional services',
    isActive: true
  },
  {
    id: 'stopaj-3',
    name: 'Stopaj %3',
    rate: 3,
    description: 'Rental income',
    isActive: true
  },
  {
    id: 'stopaj-5',
    name: 'Stopaj %5',
    rate: 5,
    description: 'Freelance services',
    isActive: true
  },
  {
    id: 'stopaj-7',
    name: 'Iraq Withholding %7',
    rate: 7,
    description: 'Iraq standard withholding tax',
    isActive: true
  },
  {
    id: 'stopaj-10',
    name: 'Stopaj %10',
    rate: 10,
    description: 'Construction services',
    isActive: true
  },
  {
    id: 'stopaj-15',
    name: 'Iraq Withholding %15',
    rate: 15,
    description: 'Iraq high-rate withholding tax',
    isActive: true
  },
  {
    id: 'stopaj-20',
    name: 'Stopaj %20',
    rate: 20,
    description: 'Dividends and interest',
    isActive: true
  }
];

// ===== CALCULATION FUNCTIONS =====

/**
 * Calculate tax from NET amount (tax-exclusive)
 * Example: 100 IQD + 20% VAT = 120 IQD
 */
export function calculateTaxFromNet(netAmount: number, taxRate: number): TaxCalculationResult {
  const taxAmount = (netAmount * taxRate) / 100;
  const grossAmount = netAmount + taxAmount;

  return {
    netAmount,
    taxAmount,
    grossAmount,
    details: {
      taxRate,
      taxBase: netAmount
    }
  };
}

/**
 * Calculate tax from GROSS amount (tax-inclusive)
 * Example: 120 IQD including 20% VAT = 100 IQD net + 20 IQD tax
 * 
 * Formula: Net = Gross / (1 + tax_rate/100)
 */
export function calculateTaxFromGross(grossAmount: number, taxRate: number): TaxCalculationResult {
  const divisor = 1 + (taxRate / 100);
  const netAmount = grossAmount / divisor;
  const taxAmount = grossAmount - netAmount;

  return {
    netAmount,
    taxAmount,
    grossAmount,
    details: {
      taxRate,
      taxBase: netAmount
    }
  };
}

/**
 * Universal tax calculation
 * Automatically determines if amount includes tax or not
 */
export function calculateTax(input: TaxCalculationInput): TaxCalculationResult {
  let result: TaxCalculationResult;

  if (input.includesTax) {
    // Gross amount provided
    result = calculateTaxFromGross(input.amount, input.taxRate);
  } else {
    // Net amount provided
    result = calculateTaxFromNet(input.amount, input.taxRate);
  }

  // Apply withholding tax if requested
  if (input.withholding?.enabled && input.withholding.rate > 0) {
    const withholdingTaxAmount = (result.netAmount * input.withholding.rate) / 100;
    const finalAmount = result.grossAmount - withholdingTaxAmount;

    return {
      ...result,
      withholdingTaxAmount,
      finalAmount,
      details: {
        ...result.details,
        withholdingRate: input.withholding.rate
      }
    };
  }

  return result;
}

/**
 * Calculate tax for invoice line item
 */
export function calculateLineItemTax(
  quantity: number,
  unitPrice: number,
  taxRate: number,
  withholdingRate: number = 0
): InvoiceItemTax {
  const netAmount = quantity * unitPrice;
  const taxAmount = (netAmount * taxRate) / 100;
  const grossAmount = netAmount + taxAmount;
  
  let withholdingTaxAmount: number | undefined;
  if (withholdingRate > 0) {
    withholdingTaxAmount = (netAmount * withholdingRate) / 100;
  }

  return {
    productId: '',
    productName: '',
    quantity,
    unitPrice,
    netAmount,
    taxRate,
    taxAmount,
    withholdingTaxAmount,
    grossAmount
  };
}

/**
 * Calculate tax summary for entire invoice
 */
export function calculateInvoiceTax(
  items: {
    quantity: number;
    unitPrice: number;
    taxRate: number;
    productId?: string;
    productName?: string;
  }[],
  invoiceType: 'SALES' | 'PURCHASE',
  withholdingRate: number = 0
): InvoiceTaxSummary {
  const itemTaxes: InvoiceItemTax[] = items.map(item => {
    const itemTax = calculateLineItemTax(
      item.quantity,
      item.unitPrice,
      item.taxRate,
      withholdingRate
    );
    return {
      ...itemTax,
      productId: item.productId || '',
      productName: item.productName || ''
    };
  });

  const subtotal = itemTaxes.reduce((sum, item) => sum + item.netAmount, 0);
  const totalTax = itemTaxes.reduce((sum, item) => sum + item.taxAmount, 0);
  const totalWithholdingTax = itemTaxes.reduce((sum, item) => sum + (item.withholdingTaxAmount || 0), 0);
  const grandTotal = subtotal + totalTax;

  // Group by tax rate
  const taxByRateMap = new Map<number, { taxBase: number; taxAmount: number }>();
  
  itemTaxes.forEach(item => {
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
    ...data
  }));

  return {
    invoiceType,
    subtotal,
    items: itemTaxes,
    totalTax,
    totalWithholdingTax,
    grandTotal,
    taxByRate
  };
}

/**
 * Get default tax rate for country
 */
export function getDefaultTaxRate(country: 'TR' | 'IQ' | 'GLOBAL' = 'IQ'): TaxRate {
  const defaultRate = TAX_RATES.find(r => r.country === country && r.isDefault);
  return defaultRate || TAX_RATES[0];
}

/**
 * Get tax rate by ID
 */
export function getTaxRateById(id: string): TaxRate | undefined {
  return TAX_RATES.find(r => r.id === id);
}

/**
 * Get withholding tax rate by ID
 */
export function getWithholdingTaxRateById(id: string): WithholdingTaxRate | undefined {
  return WITHHOLDING_TAX_RATES.find(r => r.id === id);
}

// ===== TAX REPORTING =====

export interface VATReportPeriod {
  startDate: string;
  endDate: string;
  salesVAT: {
    taxBase: number;
    taxAmount: number;
    invoiceCount: number;
  };
  purchaseVAT: {
    taxBase: number;
    taxAmount: number;
    invoiceCount: number;
  };
  netVAT: number; // salesVAT - purchaseVAT
  vatToPayOrRefund: number; // Positive = pay, Negative = refund
}

/**
 * Calculate VAT report for a period
 * This would normally query the database for invoices in the period
 */
export function calculateVATReport(
  salesInvoices: InvoiceTaxSummary[],
  purchaseInvoices: InvoiceTaxSummary[],
  startDate: string,
  endDate: string
): VATReportPeriod {
  const salesVATTaxBase = salesInvoices.reduce((sum, inv) => sum + inv.subtotal, 0);
  const salesVATAmount = salesInvoices.reduce((sum, inv) => sum + inv.totalTax, 0);

  const purchaseVATTaxBase = purchaseInvoices.reduce((sum, inv) => sum + inv.subtotal, 0);
  const purchaseVATAmount = purchaseInvoices.reduce((sum, inv) => sum + inv.totalTax, 0);

  const netVAT = salesVATAmount - purchaseVATAmount;

  return {
    startDate,
    endDate,
    salesVAT: {
      taxBase: salesVATTaxBase,
      taxAmount: salesVATAmount,
      invoiceCount: salesInvoices.length
    },
    purchaseVAT: {
      taxBase: purchaseVATTaxBase,
      taxAmount: purchaseVATAmount,
      invoiceCount: purchaseInvoices.length
    },
    netVAT,
    vatToPayOrRefund: netVAT
  };
}

/**
 * Format amount with thousand separators (Turkey format)
 */
export function formatTaxAmount(amount: number, currencyCode: string = 'IQD'): string {
  return new Intl.NumberFormat('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount) + ' ' + currencyCode;
}

/**
 * Round tax amount to 2 decimal places
 */
export function roundTaxAmount(amount: number): number {
  return Math.round(amount * 100) / 100;
}

// ===== EXPORT =====

export default {
  calculateTax,
  calculateTaxFromNet,
  calculateTaxFromGross,
  calculateLineItemTax,
  calculateInvoiceTax,
  calculateVATReport,
  getDefaultTaxRate,
  getTaxRateById,
  getWithholdingTaxRateById,
  formatTaxAmount,
  roundTaxAmount,
  TAX_RATES,
  WITHHOLDING_TAX_RATES
};

