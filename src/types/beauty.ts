export enum AppointmentStatus {
    SCHEDULED = 'scheduled',
    CONFIRMED = 'confirmed',
    IN_PROGRESS = 'in_progress',
    COMPLETED = 'completed',
    CANCELLED = 'cancelled',
    NO_SHOW = 'no_show'
}

export enum ServiceCategory {
    LASER = 'laser',
    HAIR_SALON = 'hair_salon',
    BEAUTY = 'beauty',
    HAIR_TRANSPLANT = 'hair_transplant',
    BOTOX = 'botox',
    FILLER = 'filler',
    PHYSICAL_THERAPY = 'physical_therapy',
    MASSAGE = 'massage',
    SKINCARE = 'skincare',
    MAKEUP = 'makeup',
    NAILS = 'nails',
    SPA = 'spa'
}

export enum LeadSource {
    WHATSAPP = 'whatsapp',
    FACEBOOK = 'facebook',
    INSTAGRAM = 'instagram',
    PHONE_CALL = 'phone_call',
    WALK_IN = 'walk_in',
    REFERRAL = 'referral',
    OTHER = 'other'
}

export enum LeadStatus {
    NEW = 'new',
    CONTACTED = 'contacted',
    QUALIFIED = 'qualified',
    APPOINTMENT_SCHEDULED = 'appointment_scheduled',
    CONVERTED = 'converted',
    LOST = 'lost'
}

export interface BeautySpecialist {
    id: string;
    name: string;
    phone?: string;
    email?: string;
    specialty?: string;
    color?: string;
    commission_rate: number;
    avatar_url?: string;
    working_hours?: Record<string, { start: string; end: string }>;
    is_active: boolean;
}

export interface BeautyService {
    id: string;
    name: string;
    category: ServiceCategory | string;
    duration_min: number;
    price: number;
    cost_price?: number;
    color?: string;
    commission_rate?: number;
    description?: string;
    requires_device?: boolean;
    expected_shots?: number;
    is_active: boolean;
}

export interface BeautyDevice {
    id: string;
    name: string;
    device_type: string;
    serial_number?: string;
    manufacturer?: string;
    model?: string;
    total_shots: number;
    max_shots?: number;
    maintenance_due?: string;
    last_maintenance?: string;
    purchase_date?: string;
    warranty_expiry?: string;
    status: 'active' | 'maintenance' | 'retired';
    notes?: string;
    is_active: boolean;
}

export interface BeautyPackage {
    id: string;
    name: string;
    description?: string;
    service_id?: string;
    total_sessions: number;
    price: number;
    cost_price?: number;
    discount_pct?: number;
    validity_days?: number;
    color?: string;
    is_active: boolean;
}

export interface BeautyPackagePurchase {
    id: string;
    customer_id: string;
    package_id: string;
    total_sessions: number;
    used_sessions: number;
    remaining_sessions: number;
    sale_price?: number;
    purchase_date: string;
    expiry_date?: string;
    status: 'active' | 'completed' | 'expired';
    // joined
    customer_name?: string;
    package_name?: string;
}

export interface BeautyAppointment {
    id: string;
    client_id?: string;
    customer_id?: string;
    customer_name?: string;
    service_id?: string;
    service_name?: string;
    service_color?: string;
    specialist_id?: string;
    staff_id?: string;
    specialist_name?: string;
    staff_name?: string;
    device_id?: string;
    body_region_id?: string;
    appointment_date?: string;
    date?: string;
    appointment_time?: string;
    time?: string;
    duration: number;
    status: AppointmentStatus;
    type?: string;
    notes?: string;
    total_price: number;
    commission_amount?: number;
    is_package_session: boolean;
    package_purchase_id?: string;
    reminder_sent?: boolean;
}

export interface BeautyLead {
    id: string;
    name: string;
    phone?: string;
    email?: string;
    source: LeadSource | string;
    status: LeadStatus | string;
    interested_services?: string[];
    notes?: string;
    assigned_to?: string;
    first_contact_date: string;
    last_contact_date?: string;
    converted_customer_id?: string;
    lost_reason?: string;
    created_at: string;
    updated_at?: string;
}

export interface BeautyBodyRegion {
    id: string;
    name: string;
    avg_shots: number;
    min_shots: number;
    max_shots: number;
    sort_order: number;
}

export interface BeautyCustomerFeedback {
    id: string;
    appointment_id: string;
    customer_id: string;
    service_rating: number;
    staff_rating: number;
    cleanliness_rating: number;
    overall_rating: number;
    comment?: string;
    would_recommend: boolean;
    created_at: string;
}

export interface BeautySale {
    id: string;
    invoice_number?: string;
    customer_id?: string;
    customer_name?: string;
    subtotal: number;
    discount: number;
    tax: number;
    total: number;
    payment_method: string;
    payment_status: string;
    paid_amount: number;
    remaining_amount: number;
    notes?: string;
    created_at: string;
    items?: BeautySaleItem[];
}

export interface BeautySaleItem {
    id: string;
    sale_id: string;
    item_type: 'service' | 'product' | 'package';
    item_id?: string;
    name: string;
    quantity: number;
    unit_price: number;
    discount: number;
    total: number;
    staff_id?: string;
    commission_amount: number;
}

// General customer type used in beauty CRM
export interface BeautyCustomer {
    id: string;
    code?: string;
    name: string;
    phone?: string;
    email?: string;
    address?: string;
    city?: string;
    points?: number;
    total_spent?: number;
    balance?: number;
    is_active: boolean;
    notes?: string;
    created_at?: string;
    // computed: last appointment
    last_appointment_date?: string;
    last_service_name?: string;
    appointment_count?: number;
}
