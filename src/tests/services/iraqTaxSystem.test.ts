/**
 * Iraq Tax System Tests
 */

import { describe, it, expect } from 'vitest';
import {
    IraqTaxSystem,
    calculateCorporateTax,
    calculateIncomeTax,
    calculateSalaryTax,
    calculateWithholdingTax
} from '../../services/iraqTaxSystem';

describe('Iraq Tax System', () => {
    describe('Corporate Tax', () => {
        it('should calculate corporate tax at 15%', () => {
            const result = calculateCorporateTax(100_000_000);
            expect(result.taxAmount).toBe(15_000_000);
            expect(result.netAmount).toBe(85_000_000);
        });

        it('should handle exemptions in corporate tax', () => {
            const exemptions = [{ type: 'Incentive', description: 'desc', amount: 10_000_000 }];
            const result = calculateCorporateTax(100_000_000, exemptions);
            expect(result.taxableAmount).toBe(90_000_000);
            expect(result.taxAmount).toBe(13_500_000);
        });
    });

    describe('Salary Tax (Progressive)', () => {
        it('should calculate 0% tax for salary <= 500,000', () => {
            const result = calculateSalaryTax(400_000);
            expect(result.taxAmount).toBe(0);
        });

        it('should calculate tax for middle bracket salary', () => {
            // 750,000 IQD: 
            // 0-500,000 -> 0%
            // 500,001-750,000 -> 250,000 * 3% = 7,500
            const result = calculateSalaryTax(750_000);
            expect(result.taxAmount).toBe(7_500);
        });

        it('should calculate tax for higher bracket salary', () => {
            // 1,500,000 IQD:
            // 0-500,000 -> 0
            // 500,001-1,000,000 -> 500,000 * 3% = 15,000 (matched by fixedAmount in next bracket)
            // 1,000,001-1,500,000 -> 500,000 * 5% = 25,000
            // Total = 15,000 + 25,000 = 40,000
            const result = calculateSalaryTax(1_500_000);
            expect(result.taxAmount).toBe(40_000);
        });
    });

    describe('Withholding Tax', () => {
        it('should calculate professional withholding tax at 5%', () => {
            const result = calculateWithholdingTax(1_000_000, 'PROFESSIONAL');
            expect(result.taxAmount).toBe(50_000);
        });

        it('should calculate goods withholding tax at 3%', () => {
            const result = calculateWithholdingTax(1_000_000, 'GOODS');
            expect(result.taxAmount).toBe(30_000);
        });
    });
});

