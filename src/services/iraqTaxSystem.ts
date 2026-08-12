/**
 * ExRetailOS - Iraq Tax System
 * 
 * Irak vergi sistemi implementasyonu.
 * Kurumlar vergisi, gelir vergisi, stopaj hesaplamaları.
 * 
 * @created 2024-12-18
 * @market Iraq (IQD)
 */

import { logger } from '../utils/logger';

// Vergi türleri
export type TaxType =
  | 'CORPORATE_TAX'      // Kurumlar Vergisi
  | 'INCOME_TAX'         // Gelir Vergisi
  | 'WITHHOLDING_TAX'    // Stopaj Vergisi
  | 'VAT'                // TAX (Irak'ta yok, gelecekte eklenebilir)
  | 'SALARY_TAX'         // Maaş Vergisi
  | 'PROFESSIONAL_TAX';  // Meslek Vergisi

// Vergi dilimleri (Income Tax)
export interface TaxBracket {
  min: number;
  max: number | null; // null = unlimited
  rate: number; // 0-100 arası yüzde
  fixedAmount: number; // Sabit tutar
}

// Vergi hesaplama sonucu
export interface TaxCalculationResult {
  taxType: TaxType;
  baseAmount: number;
  taxableAmount: number;
  taxRate: number;
  taxAmount: number;
  netAmount: number;
  breakdown?: TaxBreakdown[];
  exemptions?: TaxExemption[];
}

// Vergi dökümü (dilimli vergiler için)
export interface TaxBreakdown {
  bracketIndex: number;
  min: number;
  max: number | null;
  rate: number;
  amountInBracket: number;
  taxInBracket: number;
}

// Vergi muafiyetleri
export interface TaxExemption {
  type: string;
  description: string;
  amount: number;
}

/**
 * Iraq Tax System Service
 */
export class IraqTaxSystem {

  // ===== IRAQ TAX RATES (2024) =====

  /**
   * Kurumlar Vergisi - Corporate Tax
   * Irak'ta kurumlar vergisi %15 (standart)
   */
  static readonly CORPORATE_TAX_RATE = 15; // %15

  /**
   * Gelir Vergisi Dilimleri - Income Tax Brackets
   * Irak'ta gelir vergisi progressive (artan oranlı)
   * 
   * Kaynak: Iraq Tax Law 2024
   */
  static readonly INCOME_TAX_BRACKETS: TaxBracket[] = [
    // 0 - 1,000,000 IQD: %0
    { min: 0, max: 1_000_000, rate: 0, fixedAmount: 0 },

    // 1,000,000 - 10,000,000 IQD: %3
    { min: 1_000_001, max: 10_000_000, rate: 3, fixedAmount: 0 },

    // 10,000,000 - 25,000,000 IQD: %5
    { min: 10_000_001, max: 25_000_000, rate: 5, fixedAmount: 270_000 },

    // 25,000,000 - 50,000,000 IQD: %10
    { min: 25_000_001, max: 50_000_000, rate: 10, fixedAmount: 1_020_000 },

    // 50,000,000 - 100,000,000 IQD: %15
    { min: 50_000_001, max: 100_000_000, rate: 15, fixedAmount: 3_520_000 },

    // 100,000,000+ IQD: %20
    { min: 100_000_001, max: null, rate: 20, fixedAmount: 11_020_000 },
  ];

  /**
   * Stopaj Vergisi Oranları - Withholding Tax Rates
   */
  static readonly WITHHOLDING_TAX_RATES = {
    SALARY: 3,           // Maaş stopajı %3
    PROFESSIONAL: 5,     // Serbest meslek %5
    RENT: 5,             // Kira geliri %5
    INTEREST: 10,        // Faiz geliri %10
    DIVIDENDS: 15,       // Temettü %15
    SERVICES: 7,         // Hizmet alımı %7
    GOODS: 3,            // Mal alımı %3
  };

  /**
   * Maaş Vergisi - Salary Tax (Progressive)
   */
  static readonly SALARY_TAX_BRACKETS: TaxBracket[] = [
    // 0 - 500,000 IQD/month: %0
    { min: 0, max: 500_000, rate: 0, fixedAmount: 0 },

    // 500,000 - 1,000,000 IQD/month: %3
    { min: 500_001, max: 1_000_000, rate: 3, fixedAmount: 0 },

    // 1,000,000 - 2,000,000 IQD/month: %5
    { min: 1_000_001, max: 2_000_000, rate: 5, fixedAmount: 15_000 },

    // 2,000,000+ IQD/month: %10
    { min: 2_000_001, max: null, rate: 10, fixedAmount: 65_000 },
  ];

  // ===== TAX CALCULATION METHODS =====

  /**
   * Kurumlar Vergisi Hesapla
   */
  static calculateCorporateTax(
    annualProfit: number,
    exemptions?: TaxExemption[]
  ): TaxCalculationResult {

    let taxableAmount = annualProfit;

    // Muafiyetleri düş
    if (exemptions) {
      const totalExemption = exemptions.reduce((sum, ex) => sum + ex.amount, 0);
      taxableAmount = Math.max(0, annualProfit - totalExemption);
    }

    const taxAmount = (taxableAmount * this.CORPORATE_TAX_RATE) / 100;
    const netAmount = annualProfit - taxAmount;

    return {
      taxType: 'CORPORATE_TAX',
      baseAmount: annualProfit,
      taxableAmount,
      taxRate: this.CORPORATE_TAX_RATE,
      taxAmount,
      netAmount,
      exemptions,
    };
  }

  /**
   * Gelir Vergisi Hesapla (Progressive - Dilimli)
   */
  static calculateIncomeTax(
    annualIncome: number,
    exemptions?: TaxExemption[]
  ): TaxCalculationResult {

    let taxableAmount = annualIncome;

    // Muafiyetleri düş
    if (exemptions) {
      const totalExemption = exemptions.reduce((sum, ex) => sum + ex.amount, 0);
      taxableAmount = Math.max(0, annualIncome - totalExemption);
    }

    // Dilimli hesaplama
    const { taxAmount, breakdown } = this.calculateProgressiveTax(
      taxableAmount,
      this.INCOME_TAX_BRACKETS
    );

    const effectiveRate = taxableAmount > 0 ? (taxAmount / taxableAmount) * 100 : 0;
    const netAmount = annualIncome - taxAmount;

    return {
      taxType: 'INCOME_TAX',
      baseAmount: annualIncome,
      taxableAmount,
      taxRate: effectiveRate,
      taxAmount,
      netAmount,
      breakdown,
      exemptions,
    };
  }

  /**
   * Maaş Vergisi Hesapla
   */
  static calculateSalaryTax(
    monthlySalary: number,
    exemptions?: TaxExemption[]
  ): TaxCalculationResult {

    let taxableAmount = monthlySalary;

    // Muafiyetleri düş
    if (exemptions) {
      const totalExemption = exemptions.reduce((sum, ex) => sum + ex.amount, 0);
      taxableAmount = Math.max(0, monthlySalary - totalExemption);
    }

    // Dilimli hesaplama
    const { taxAmount, breakdown } = this.calculateProgressiveTax(
      taxableAmount,
      this.SALARY_TAX_BRACKETS
    );

    const effectiveRate = taxableAmount > 0 ? (taxAmount / taxableAmount) * 100 : 0;
    const netAmount = monthlySalary - taxAmount;

    return {
      taxType: 'SALARY_TAX',
      baseAmount: monthlySalary,
      taxableAmount,
      taxRate: effectiveRate,
      taxAmount,
      netAmount,
      breakdown,
      exemptions,
    };
  }

  /**
   * Stopaj Vergisi Hesapla
   */
  static calculateWithholdingTax(
    amount: number,
    category: keyof typeof IraqTaxSystem.WITHHOLDING_TAX_RATES
  ): TaxCalculationResult {

    const rate = this.WITHHOLDING_TAX_RATES[category];
    const taxAmount = (amount * rate) / 100;
    const netAmount = amount - taxAmount;

    return {
      taxType: 'WITHHOLDING_TAX',
      baseAmount: amount,
      taxableAmount: amount,
      taxRate: rate,
      taxAmount,
      netAmount,
    };
  }

  /**
   * Progressive (Dilimli) Vergi Hesaplama
   * Her dilim için ayrı hesaplama yapar
   */
  private static calculateProgressiveTax(
    amount: number,
    brackets: TaxBracket[]
  ): { taxAmount: number; breakdown: TaxBreakdown[] } {

    let totalTax = 0;
    const breakdown: TaxBreakdown[] = [];

    // Find the highest applicable bracket
    const activeBracketIndex = brackets.findIndex((b, i) => {
      const nextBracket = brackets[i + 1];
      return amount >= b.min && (!nextBracket || amount < nextBracket.min);
    });

    if (activeBracketIndex === -1) {
      return { taxAmount: 0, breakdown: [] };
    }

    const activeBracket = brackets[activeBracketIndex];
    const amountInActiveBracket = amount - activeBracket.min + 1;
    totalTax = activeBracket.fixedAmount + (amountInActiveBracket * activeBracket.rate) / 100;

    // Document the breakdown for transparency
    // Add all fully covered brackets
    for (let i = 0; i < activeBracketIndex; i++) {
      const b = brackets[i];
      const nextB = brackets[i + 1];
      const qty = nextB.min - b.min;
      breakdown.push({
        bracketIndex: i,
        min: b.min,
        max: b.max,
        rate: b.rate,
        amountInBracket: qty,
        taxInBracket: (qty * b.rate) / 100
      });
    }

    // Add the active bracket
    breakdown.push({
      bracketIndex: activeBracketIndex,
      min: activeBracket.min,
      max: activeBracket.max,
      rate: activeBracket.rate,
      amountInBracket: amountInActiveBracket,
      taxInBracket: totalTax - (activeBracketIndex > 0 ? brackets[activeBracketIndex].fixedAmount : 0) // This is just for display
    });

    return { taxAmount: totalTax, breakdown };
  }

  // ===== HELPER METHODS =====

  /**
   * Vergi dilimini bul
   */
  static findTaxBracket(amount: number, brackets: TaxBracket[]): TaxBracket | null {
    for (const bracket of brackets) {
      if (amount >= bracket.min && (bracket.max === null || amount <= bracket.max)) {
        return bracket;
      }
    }
    return null;
  }

  /**
   * Yıllık vergi yükünü hesapla (effective tax rate)
   */
  static calculateEffectiveTaxRate(
    grossIncome: number,
    totalTaxPaid: number
  ): number {
    if (grossIncome <= 0) return 0;
    return (totalTaxPaid / grossIncome) * 100;
  }

  /**
   * Aylık maaştan yıllık gelir vergisi tahmini
   */
  static estimateAnnualIncomeTax(monthlySalary: number): TaxCalculationResult {
    const annualSalary = monthlySalary * 12;
    return this.calculateIncomeTax(annualSalary);
  }

  /**
   * Vergi hesaplama özeti (human-readable)
   */
  static describeTaxCalculation(result: TaxCalculationResult): string {
    const lines: string[] = [];

    lines.push(`Vergi Türü: ${this.describeTaxType(result.taxType)}`);
    lines.push(`Brüt Tutar: ${result.baseAmount.toLocaleString('tr-TR')} IQD`);

    if (result.exemptions && result.exemptions.length > 0) {
      lines.push(`\nMuafiyetler:`);
      result.exemptions.forEach(ex => {
        lines.push(`  - ${ex.description}: ${ex.amount.toLocaleString('tr-TR')} IQD`);
      });
    }

    lines.push(`\nMatrah (Vergi Matrahı): ${result.taxableAmount.toLocaleString('tr-TR')} IQD`);

    if (result.breakdown && result.breakdown.length > 0) {
      lines.push(`\nDilimli Vergi Hesaplaması:`);
      result.breakdown.forEach(b => {
        const maxStr = b.max ? b.max.toLocaleString('tr-TR') : '∞';
        lines.push(`  Dilim ${b.bracketIndex + 1}: ${b.min.toLocaleString('tr-TR')} - ${maxStr} IQD (%${b.rate})`);
        lines.push(`    Bu dilime giren: ${b.amountInBracket.toLocaleString('tr-TR')} IQD`);
        lines.push(`    Bu dilimdeki vergi: ${b.taxInBracket.toLocaleString('tr-TR')} IQD`);
      });
    }

    lines.push(`\nVergi Oranı: %${result.taxRate.toFixed(2)}`);
    lines.push(`Vergi Tutarı: ${result.taxAmount.toLocaleString('tr-TR')} IQD`);
    lines.push(`Net Tutar: ${result.netAmount.toLocaleString('tr-TR')} IQD`);

    return lines.join('\n');
  }

  /**
   * Vergi türü açıklaması
   */
  static describeTaxType(taxType: TaxType): string {
    const descriptions: Record<TaxType, string> = {
      'CORPORATE_TAX': 'Kurumlar Vergisi',
      'INCOME_TAX': 'Gelir Vergisi',
      'WITHHOLDING_TAX': 'Stopaj Vergisi',
      'VAT': 'TAX',
      'SALARY_TAX': 'Maaş Vergisi',
      'PROFESSIONAL_TAX': 'Meslek Vergisi',
    };
    return descriptions[taxType] || taxType;
  }

  /**
   * IQD formatında göster
   */
  static formatIQD(amount: number): string {
    return `${Math.round(amount).toLocaleString('tr-TR')} IQD`;
  }

  /**
   * Vergi raporu oluştur (JSON)
   */
  static generateTaxReport(
    calculations: TaxCalculationResult[]
  ): {
    totalGrossIncome: number;
    totalTaxableAmount: number;
    totalTaxPaid: number;
    totalNetIncome: number;
    effectiveTaxRate: number;
    byType: Record<TaxType, { count: number; totalTax: number }>;
  } {

    const totalGrossIncome = calculations.reduce((sum, c) => sum + c.baseAmount, 0);
    const totalTaxableAmount = calculations.reduce((sum, c) => sum + c.taxableAmount, 0);
    const totalTaxPaid = calculations.reduce((sum, c) => sum + c.taxAmount, 0);
    const totalNetIncome = calculations.reduce((sum, c) => sum + c.netAmount, 0);
    const effectiveTaxRate = this.calculateEffectiveTaxRate(totalGrossIncome, totalTaxPaid);

    const byType: Record<string, { count: number; totalTax: number }> = {};
    calculations.forEach(c => {
      if (!byType[c.taxType]) {
        byType[c.taxType] = { count: 0, totalTax: 0 };
      }
      byType[c.taxType].count++;
      byType[c.taxType].totalTax += c.taxAmount;
    });

    return {
      totalGrossIncome,
      totalTaxableAmount,
      totalTaxPaid,
      totalNetIncome,
      effectiveTaxRate,
      byType: byType as any,
    };
  }
}

// Export helper functions
export const calculateCorporateTax = IraqTaxSystem.calculateCorporateTax.bind(IraqTaxSystem);
export const calculateIncomeTax = IraqTaxSystem.calculateIncomeTax.bind(IraqTaxSystem);
export const calculateSalaryTax = IraqTaxSystem.calculateSalaryTax.bind(IraqTaxSystem);
export const calculateWithholdingTax = IraqTaxSystem.calculateWithholdingTax.bind(IraqTaxSystem);
export const formatIQD = IraqTaxSystem.formatIQD.bind(IraqTaxSystem);

