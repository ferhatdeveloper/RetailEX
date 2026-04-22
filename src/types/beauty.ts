/** Randevu `clinical_data` JSONB — diş / fizik / KD / diyet (sunucu kalıcı) */
export type ToothClinicalState = 'ok' | 'watch' | 'treat';

export interface BeautyAppointmentClinicalData {
    dental?: {
        permanent?: Record<string, ToothClinicalState>;
        deciduous?: Record<string, ToothClinicalState>;
    };
    physiotherapy?: { active_zone?: string | null };
    obstetrics?: { weeks?: number };
    dietitian?: { kcal?: number };
}

export enum AppointmentStatus {
    SCHEDULED = 'scheduled',
    CONFIRMED = 'confirmed',
    IN_PROGRESS = 'in_progress',
    COMPLETED = 'completed',
    CANCELLED = 'cancelled',
    NO_SHOW = 'no_show'
}

/**
 * Clinic ERP uzmanlık modu — varsayılan güzellik; klinik operasyon ekranından değiştirilir.
 * Firma bazlı `localStorage` ile saklanır (sunucu şeması sonraki adımda genişletilebilir).
 */
export type ClinicErpSpecialty =
    | 'beauty_default'
    | 'dental'
    | 'physiotherapy'
    | 'obstetrics'
    | 'dietitian';

export const CLINIC_ERP_SPECIALTY_IDS: ClinicErpSpecialty[] = [
    'beauty_default',
    'dental',
    'physiotherapy',
    'obstetrics',
    'dietitian',
];

export function isClinicErpSpecialty(v: string | null | undefined): v is ClinicErpSpecialty {
    return CLINIC_ERP_SPECIALTY_IDS.includes(v as ClinicErpSpecialty);
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
    /** Çok seanslı tedaviler için tipik seans sayısı (1 = tek seans) */
    default_sessions?: number;
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
    /** Randevu listeleri / raporlar için JOIN */
    device_name?: string;
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
    /** Aynı aylık çok seans planına ait randevuları gruplar */
    session_series_id?: string;
    reminder_sent?: boolean;
    branch_id?: string;
    room_id?: string;
    tele_meeting_url?: string;
    booking_channel?: string;
    corporate_account_id?: string;
    reminder_sent_at?: string;
    last_notification_channel?: string;
    /** Ön arama yapıldı (hatırlatma / teyit) */
    confirmation_call_at?: string | null;
    /** Randevu öncesi iç aktivite / hazırlık notu işlendi */
    pre_visit_activity_at?: string | null;
    /** Kayıt zamanı — sıra modunda listeleme sırası için (API’den gelir) */
    created_at?: string;
    /** Lazer / cihaz tedavisi — fiş «Derece» ile aynı (metin, örn. J/cm²) */
    treatment_degree?: string | null;
    /** Kullanılan atış sayısı veya notasyon (metin) */
    treatment_shots?: string | null;
    /** Klinik şema ve paneller (PostgreSQL JSONB) */
    clinical_data?: BeautyAppointmentClinicalData | null;
}

export interface BeautyBranch {
    id: string;
    name: string;
    address?: string;
    phone?: string;
    is_active: boolean;
    sort_order?: number;
}

export interface BeautyRoom {
    id: string;
    branch_id?: string;
    name: string;
    capacity?: number;
    is_active: boolean;
}

export interface BeautyPortalSettings {
    id: string;
    online_booking_enabled: boolean;
    /** Açıkken aynı personele aynı saat diliminde birden fazla randevu / işlem (iç POS; cihaz çakışması ayrıca kontrol edilir) */
    allow_staff_slot_overlap?: boolean;
    public_slug?: string;
    public_token: string;
    reminder_hours_before: number;
    sms_template?: string;
    whatsapp_template?: string;
    /** Atak SMS — whatshapp ile aynı alan adları */
    sms_user?: string | null;
    sms_password?: string | null;
    sms_sender?: string | null;
    /** EVOLUTION | META | NONE */
    whatsapp_provider?: string | null;
    whatsapp_base_url?: string | null;
    whatsapp_token?: string | null;
    whatsapp_instance_id?: string | null;
    whatsapp_phone_id?: string | null;
    /** sms | whatsapp | both */
    default_reminder_channel?: string | null;
}

export interface BeautyCorporateAccount {
    id: string;
    name: string;
    tax_nr?: string;
    discount_pct?: number;
    notes?: string;
    is_active: boolean;
}

export interface BeautyConsentTemplate {
    id: string;
    title: string;
    body_html?: string;
    is_active: boolean;
    sort_order?: number;
}

export interface BeautyMembership {
    id: string;
    name: string;
    monthly_price: number;
    session_credit?: number;
    benefits_json?: Record<string, unknown>;
    is_active: boolean;
}

export interface BeautyServiceConsumableRow {
    id: string;
    service_id: string;
    product_id: string;
    qty_per_service: number;
    /** JOIN products — liste ekranı için */
    product_name?: string | null;
    product_unit?: string | null;
}

export interface BeautyCustomerHealth {
    customer_id: string;
    allergies?: string;
    medications?: string;
    pregnancy?: boolean;
    chronic_notes?: string;
    warnings_banner?: string;
    kvkk_consent_at?: string;
}

export interface BeautyProductBatch {
    id: string;
    product_id: string;
    lot_code?: string;
    expiry_date?: string;
    qty: number;
    barcode?: string;
}

export interface BeautyMarketingCampaign {
    id: string;
    name: string;
    channel?: string;
    segment_filter_json?: Record<string, unknown>;
    message_template?: string;
    scheduled_at?: string;
    status?: string;
    sent_count?: number;
}

export interface BeautyIntegrationSettings {
    id: number;
    google_calendar_id?: string;
    external_calendar_json?: Record<string, unknown>;
}

export interface BeautyWaitlistEntry {
    id: string;
    customer_id?: string;
    service_id?: string;
    specialist_id?: string;
    preferred_date_from?: string;
    preferred_date_to?: string;
    notes?: string;
    status: string;
    created_at?: string;
}

export interface BeautyBookingRequest {
    id: string;
    name: string;
    phone: string;
    email?: string;
    service_id?: string;
    requested_date?: string;
    requested_time?: string;
    notes?: string;
    status: string;
    processed_appointment_id?: string;
    created_at?: string;
}

export interface BeautyClinicalNote {
    id: string;
    appointment_id?: string;
    customer_id?: string;
    subjective?: string;
    objective?: string;
    assessment?: string;
    plan?: string;
    extra_json?: Record<string, unknown>;
    created_by?: string;
    created_at?: string;
}

export interface BeautyPatientPhoto {
    id: string;
    customer_id: string;
    appointment_id?: string;
    kind?: string;
    storage_url: string;
    caption?: string;
    taken_at?: string;
}

export interface BeautyAuditLogEntry {
    id: string;
    table_name: string;
    record_id?: string;
    action: string;
    user_id?: string;
    payload_json?: Record<string, unknown>;
    created_at?: string;
}

export interface BeautyClinicAnalytics {
    noShowCount: number;
    cancelledCount: number;
    completedCount: number;
    scheduledCount: number;
    pendingBookingRequests: number;
    waitlistActive: number;
    consumableUsage30d: number;
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

/** Sistem dilleri ile uyumlu (LanguageContext) */
export type SatisfactionLangCode = 'tr' | 'en' | 'ar' | 'ku';

export type SatisfactionQuestionType = 'rating' | 'text' | 'yes_no';

/** Soru metinleri: her dil için ayrı */
export type BeautySatisfactionLabels = Partial<Record<SatisfactionLangCode, string>>;

export interface BeautySatisfactionSurvey {
    id: string;
    name: string;
    is_active: boolean;
    sort_order: number;
    created_at?: string;
    updated_at?: string;
}

export interface BeautySatisfactionQuestion {
    id: string;
    survey_id: string;
    sort_order: number;
    question_type: SatisfactionQuestionType | string;
    scale_max: number;
    is_required: boolean;
    labels_json: BeautySatisfactionLabels;
    created_at?: string;
    updated_at?: string;
}

/** Anket cevabı — label_snapshot: kayıt anındaki soru metni (CRM görünümü için) */
export interface BeautySurveyAnswer {
    question_id: string;
    rating?: number;
    text?: string;
    yes_no?: boolean;
    label_snapshot?: string;
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
    survey_id?: string | null;
    survey_answers?: BeautySurveyAnswer[] | null;
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
    phone2?: string;
    age?: number | null;
    file_id?: string | null;
    occupation?: string | null;
    /** female | male | other — boş bırakılabilir */
    gender?: 'female' | 'male' | 'other' | null;
    /** Güzellik CRM: standart veya VIP müşteri */
    customer_tier?: 'normal' | 'vip' | null;
    heard_from?: string | null;
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
