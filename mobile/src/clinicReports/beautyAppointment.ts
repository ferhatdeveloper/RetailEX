/** Web randevu kartının raporun okuduğu alanları. */

export enum AppointmentStatus {
  SCHEDULED = 'scheduled',
  CONFIRMED = 'confirmed',
  PRE_PAID = 'pre_paid',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  NO_SHOW = 'no_show',
}

export interface BeautyAppointment {
  id: string;
  client_id?: string;
  customer_id?: string;
  customer_name?: string;
  customer_phone?: string;
  service_id?: string;
  service_name?: string;
  specialist_id?: string;
  staff_id?: string;
  specialist_name?: string;
  staff_name?: string;
  appointment_date?: string;
  date?: string;
  appointment_time?: string;
  time?: string;
  duration: number;
  status: AppointmentStatus | string;
  notes?: string;
  total_price?: number;
  created_at?: string;
  updated_at?: string;
  deposit_amount?: number | null;
  remainder_paid_amount?: number | null;
  deposit_date?: string | null;
  remainder_payment_date?: string | null;
  deposit_sale_id?: string | null;
  remainder_sale_id?: string | null;
  sale_group_id?: string | null;
  is_package_session?: boolean;
  branch_id?: string;
}
