/**
 * Staff Management Service
 * Pattern: Strategy Pattern + State Pattern
 * Features: Shift management, commission calculation, performance tracking
 */

import { Sale } from '../App';

// Shift
export interface Shift {
  id: string;
  name: string;
  start_time: string;                                 // "09:00"
  end_time: string;                                   // "17:00"
  days: number[];                                     // [1,2,3,4,5] (Monday-Friday)
  is_active: boolean;
}

// Shift Assignment
export interface ShiftAssignment {
  id: string;
  staff_id: string;
  shift_id: string;
  date: string;
  status: ShiftStatus;
  clock_in?: string;
  clock_out?: string;
  break_minutes: number;
  worked_minutes?: number;
  notes?: string;
}

export type ShiftStatus = 'SCHEDULED' | 'ACTIVE' | 'COMPLETED' | 'ABSENT' | 'LATE';

// Commission Rule
export interface CommissionRule {
  id: string;
  name: string;
  type: CommissionType;
  rate: number;                                       // %5, %10
  threshold?: number;                                 // Minimum sales for commission
  max_amount?: number;                                // Maximum commission per period
  applies_to: 'ALL' | 'SPECIFIC_PRODUCTS' | 'SPECIFIC_CATEGORIES';
  product_ids?: string[];
  category_ids?: string[];
  valid_from: string;
  valid_to: string;
  is_active: boolean;
}

export type CommissionType = 
  | 'PERCENTAGE'          // % of sales
  | 'FIXED_PER_SALE'      // Fixed amount per sale
  | 'TIERED'              // Different rates for different ranges
  | 'BONUS';              // Achievement bonus

// Commission Calculation
export interface CommissionCalculation {
  staff_id: string;
  period_start: string;
  period_end: string;
  total_sales: number;
  total_sales_count: number;
  commission_breakdown: CommissionBreakdown[];
  total_commission: number;
  bonuses: Bonus[];
  deductions: Deduction[];
  net_commission: number;
}

export interface CommissionBreakdown {
  rule_id: string;
  rule_name: string;
  sales_amount: number;
  commission_rate: number;
  commission_amount: number;
}

export interface Bonus {
  reason: string;
  amount: number;
}

export interface Deduction {
  reason: string;
  amount: number;
}

// Performance Metrics
export interface StaffPerformance {
  staff_id: string;
  period_start: string;
  period_end: string;
  total_sales: number;
  sales_count: number;
  average_sale_value: number;
  items_per_sale: number;
  conversion_rate: number;                            // Sales / Customer interactions
  customer_satisfaction: number;                      // 0-100
  attendance_rate: number;                            // % of shifts attended
  punctuality_rate: number;                           // % on-time arrivals
  ranking: number;                                    // Among all staff
}

// Attendance
export interface AttendanceRecord {
  id: string;
  staff_id: string;
  date: string;
  status: 'PRESENT' | 'ABSENT' | 'LATE' | 'HALF_DAY' | 'LEAVE';
  clock_in?: string;
  clock_out?: string;
  total_minutes: number;
  notes?: string;
}

/**
 * Commission Strategy Interface
 */
interface CommissionStrategy {
  calculate(sales: Sale[], rule: CommissionRule): CommissionBreakdown;
}

/**
 * Percentage Commission Strategy
 */
class PercentageCommissionStrategy implements CommissionStrategy {
  calculate(sales: Sale[], rule: CommissionRule): CommissionBreakdown {
    const totalSales = sales.reduce((sum, s) => sum + s.total, 0);

    const commissionAmount = totalSales * (rule.rate / 100);

    return {
      rule_id: rule.id,
      rule_name: rule.name,
      sales_amount: totalSales,
      commission_rate: rule.rate,
      commission_amount: Math.min(commissionAmount, rule.max_amount || Infinity)
    };
  }
}

/**
 * Fixed Per Sale Strategy
 */
class FixedPerSaleStrategy implements CommissionStrategy {
  calculate(sales: Sale[], rule: CommissionRule): CommissionBreakdown {
    const salesCount = sales.length;
    const commissionAmount = salesCount * rule.rate;

    return {
      rule_id: rule.id,
      rule_name: rule.name,
      sales_amount: sales.reduce((sum, s) => sum + s.total, 0),
      commission_rate: rule.rate,
      commission_amount: Math.min(commissionAmount, rule.max_amount || Infinity)
    };
  }
}

/**
 * Tiered Commission Strategy
 */
class TieredCommissionStrategy implements CommissionStrategy {
  private tiers = [
    { min: 0, max: 10000, rate: 3 },
    { min: 10000, max: 25000, rate: 5 },
    { min: 25000, max: 50000, rate: 7 },
    { min: 50000, max: Infinity, rate: 10 }
  ];

  calculate(sales: Sale[], rule: CommissionRule): CommissionBreakdown {
    const totalSales = sales.reduce((sum, s) => sum + s.total, 0);
    let commission = 0;

    for (const tier of this.tiers) {
      if (totalSales > tier.min) {
        const tierAmount = Math.min(totalSales, tier.max) - tier.min;
        commission += tierAmount * (tier.rate / 100);
      }
    }

    return {
      rule_id: rule.id,
      rule_name: rule.name,
      sales_amount: totalSales,
      commission_rate: 0, // Variable
      commission_amount: Math.min(commission, rule.max_amount || Infinity)
    };
  }
}

/**
 * Staff Management Service
 */
export class StaffManagementService {
  private shifts: Map<string, Shift> = new Map();
  private assignments: Map<string, ShiftAssignment[]> = new Map();
  private commissionRules: CommissionRule[] = [];
  private commissionStrategies: Map<CommissionType, CommissionStrategy>;
  private attendance: Map<string, AttendanceRecord[]> = new Map();

  constructor() {
    this.commissionStrategies = new Map([
      ['PERCENTAGE', new PercentageCommissionStrategy()],
      ['FIXED_PER_SALE', new FixedPerSaleStrategy()],
      ['TIERED', new TieredCommissionStrategy()]
    ]);

    this.initializeMockData();
  }

  private initializeMockData(): void {
    // Mock shifts
    const mockShifts: Shift[] = [
      {
        id: 'shift-1',
        name: 'Sabah Vardiyası',
        start_time: '08:00',
        end_time: '16:00',
        days: [1, 2, 3, 4, 5],
        is_active: true
      },
      {
        id: 'shift-2',
        name: 'Öğlen Vardiyası',
        start_time: '12:00',
        end_time: '20:00',
        days: [1, 2, 3, 4, 5],
        is_active: true
      },
      {
        id: 'shift-3',
        name: 'Akşam Vardiyası',
        start_time: '16:00',
        end_time: '00:00',
        days: [1, 2, 3, 4, 5, 6, 7],
        is_active: true
      }
    ];

    mockShifts.forEach(shift => this.shifts.set(shift.id, shift));

    // Mock commission rules
    this.commissionRules = [
      {
        id: 'comm-1',
        name: 'Genel Satış Komisyonu',
        type: 'PERCENTAGE',
        rate: 5,
        threshold: 0,
        applies_to: 'ALL',
        valid_from: '2025-01-01',
        valid_to: '2025-12-31',
        is_active: true
      },
      {
        id: 'comm-2',
        name: 'Yüksek Performans Bonusu',
        type: 'TIERED',
        rate: 0,
        threshold: 10000,
        applies_to: 'ALL',
        valid_from: '2025-01-01',
        valid_to: '2025-12-31',
        is_active: true
      }
    ];
  }

  /**
   * Create shift assignment
   */
  assignShift(
    staffId: string,
    shiftId: string,
    date: string
  ): { success: boolean; assignment?: ShiftAssignment; message?: string } {
    const shift = this.shifts.get(shiftId);

    if (!shift) {
      return { success: false, message: 'Vardiya bulunamadı' };
    }

    const assignment: ShiftAssignment = {
      id: `assign-${Date.now()}`,
      staff_id: staffId,
      shift_id: shiftId,
      date,
      status: 'SCHEDULED',
      break_minutes: 0
    };

    const staffAssignments = this.assignments.get(staffId) || [];
    staffAssignments.push(assignment);
    this.assignments.set(staffId, staffAssignments);

    return { success: true, assignment };
  }

  /**
   * Clock in
   */
  clockIn(
    assignmentId: string,
    staffId: string
  ): { success: boolean; message?: string } {
    const assignments = this.assignments.get(staffId) || [];
    const assignment = assignments.find(a => a.id === assignmentId);

    if (!assignment) {
      return { success: false, message: 'Atama bulunamadı' };
    }

    if (assignment.status !== 'SCHEDULED') {
      return { success: false, message: 'Vardiya zaten başlamış' };
    }

    assignment.clock_in = new Date().toISOString();
    assignment.status = 'ACTIVE';

    // Check if late
    const shift = this.shifts.get(assignment.shift_id);
    if (shift) {
      const scheduledTime = new Date(`${assignment.date}T${shift.start_time}`);
      const clockInTime = new Date(assignment.clock_in);
      
      if (clockInTime.getTime() > scheduledTime.getTime() + 15 * 60 * 1000) { // 15 min tolerance
        assignment.status = 'LATE';
      }
    }

    return { success: true, message: 'Giriş yapıldı' };
  }

  /**
   * Clock out
   */
  clockOut(
    assignmentId: string,
    staffId: string
  ): { success: boolean; message?: string } {
    const assignments = this.assignments.get(staffId) || [];
    const assignment = assignments.find(a => a.id === assignmentId);

    if (!assignment) {
      return { success: false, message: 'Atama bulunamadı' };
    }

    if (!assignment.clock_in) {
      return { success: false, message: 'Giriş yapılmamış' };
    }

    assignment.clock_out = new Date().toISOString();
    assignment.status = 'COMPLETED';

    // Calculate worked minutes
    const clockIn = new Date(assignment.clock_in);
    const clockOut = new Date(assignment.clock_out);
    assignment.worked_minutes = Math.floor((clockOut.getTime() - clockIn.getTime()) / (1000 * 60)) - assignment.break_minutes;

    return { success: true, message: 'Çıkış yapıldı' };
  }

  /**
   * Calculate commission
   */
  calculateCommission(
    staffId: string,
    sales: Sale[],
    periodStart: string,
    periodEnd: string
  ): CommissionCalculation {
    const periodSales = sales.filter(s => {
      const saleDate = new Date(s.date);
      return saleDate >= new Date(periodStart) && saleDate <= new Date(periodEnd);
    });

    const breakdown: CommissionBreakdown[] = [];

    // Apply each active commission rule
    for (const rule of this.commissionRules.filter(r => r.is_active)) {
      const strategy = this.commissionStrategies.get(rule.type);
      if (!strategy) continue;

      // Filter sales based on rule
      let applicableSales = periodSales;

      if (rule.applies_to === 'SPECIFIC_PRODUCTS' && rule.product_ids) {
        applicableSales = periodSales.filter(s => 
          s.items.some(item => rule.product_ids!.includes(item.id))
        );
      }

      if (rule.threshold && applicableSales.reduce((sum, s) => sum + s.total, 0) < rule.threshold) {
        continue;
      }

      const commission = strategy.calculate(applicableSales, rule);
      breakdown.push(commission);
    }

    const total_commission = breakdown.reduce((sum, b) => sum + b.commission_amount, 0);

    // Calculate bonuses
    const bonuses: Bonus[] = [];
    const totalSales = periodSales.reduce((sum, s) => sum + s.total, 0);

    if (totalSales > 50000) {
      bonuses.push({
        reason: '50.000 üzeri satış bonusu',
        amount: 500
      });
    }

    if (periodSales.length > 100) {
      bonuses.push({
        reason: '100+ satış bonusu',
        amount: 300
      });
    }

    // Deductions (örnek)
    const deductions: Deduction[] = [];

    const net_commission = total_commission + 
      bonuses.reduce((sum, b) => sum + b.amount, 0) -
      deductions.reduce((sum, d) => sum + d.amount, 0);

    return {
      staff_id: staffId,
      period_start: periodStart,
      period_end: periodEnd,
      total_sales: totalSales,
      total_sales_count: periodSales.length,
      commission_breakdown: breakdown,
      total_commission,
      bonuses,
      deductions,
      net_commission
    };
  }

  /**
   * Calculate staff performance
   */
  calculatePerformance(
    staffId: string,
    sales: Sale[],
    periodStart: string,
    periodEnd: string
  ): StaffPerformance {
    const periodSales = sales.filter(s => {
      const saleDate = new Date(s.date);
      return saleDate >= new Date(periodStart) && saleDate <= new Date(periodEnd);
    });

    const total_sales = periodSales.reduce((sum, s) => sum + s.total, 0);
    const sales_count = periodSales.length;
    const average_sale_value = sales_count > 0 ? total_sales / sales_count : 0;
    
    const total_items = periodSales.reduce((sum, s) => sum + s.items.length, 0);
    const items_per_sale = sales_count > 0 ? total_items / sales_count : 0;

    // Get attendance
    const assignments = this.assignments.get(staffId) || [];
    const periodAssignments = assignments.filter(a => {
      const date = new Date(a.date);
      return date >= new Date(periodStart) && date <= new Date(periodEnd);
    });

    const totalShifts = periodAssignments.length;
    const attendedShifts = periodAssignments.filter(a => 
      a.status === 'COMPLETED' || a.status === 'ACTIVE'
    ).length;

    const onTimeShifts = periodAssignments.filter(a => 
      a.status !== 'LATE' && a.status !== 'ABSENT'
    ).length;

    const attendance_rate = totalShifts > 0 ? (attendedShifts / totalShifts) * 100 : 100;
    const punctuality_rate = totalShifts > 0 ? (onTimeShifts / totalShifts) * 100 : 100;

    return {
      staff_id: staffId,
      period_start: periodStart,
      period_end: periodEnd,
      total_sales,
      sales_count,
      average_sale_value,
      items_per_sale,
      conversion_rate: 75, // Mock - requires customer interaction tracking
      customer_satisfaction: 85, // Mock - requires feedback system
      attendance_rate,
      punctuality_rate,
      ranking: 1 // Mock - requires comparison with other staff
    };
  }

  /**
   * Get shift assignments
   */
  getAssignments(staffId?: string, date?: string): ShiftAssignment[] {
    if (staffId) {
      const assignments = this.assignments.get(staffId) || [];
      
      if (date) {
        return assignments.filter(a => a.date === date);
      }
      
      return assignments;
    }

    // Get all assignments
    const allAssignments: ShiftAssignment[] = [];
    this.assignments.forEach(assignments => {
      allAssignments.push(...assignments);
    });

    if (date) {
      return allAssignments.filter(a => a.date === date);
    }

    return allAssignments;
  }

  /**
   * Get shifts
   */
  getShifts(): Shift[] {
    return Array.from(this.shifts.values()).filter(s => s.is_active);
  }

  /**
   * Get commission rules
   */
  getCommissionRules(): CommissionRule[] {
    return this.commissionRules.filter(r => r.is_active);
  }

  /**
   * Bulk performance report
   */
  bulkPerformanceReport(
    staffIds: string[],
    sales: Sale[],
    periodStart: string,
    periodEnd: string
  ): Map<string, StaffPerformance> {
    const results = new Map<string, StaffPerformance>();

    staffIds.forEach(staffId => {
      const performance = this.calculatePerformance(staffId, sales, periodStart, periodEnd);
      results.set(staffId, performance);
    });

    // Calculate rankings
    const sorted = Array.from(results.values()).sort((a, b) => b.total_sales - a.total_sales);
    sorted.forEach((perf, index) => {
      perf.ranking = index + 1;
    });

    return results;
  }
}

// Singleton instance
export const staffManagementService = new StaffManagementService();

// Export types
export type { 
  Shift, ShiftAssignment, CommissionRule, CommissionCalculation, 
  StaffPerformance, AttendanceRecord 
};

