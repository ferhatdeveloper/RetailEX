-- 092: Müşteri arama planı — haftalık arşiv ve hafta başı sıfırlama takibi

CREATE TABLE IF NOT EXISTS public.customer_call_plan_weekly (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_nr VARCHAR(10) NOT NULL,
  week_start DATE NOT NULL,
  week_end DATE NOT NULL,
  customer_id UUID NOT NULL,
  customer_code VARCHAR(50),
  customer_name TEXT NOT NULL,
  call_plan_weekdays SMALLINT[] DEFAULT '{}'::smallint[],
  call_plan_note TEXT,
  call_last_status VARCHAR(30) NOT NULL DEFAULT 'planned',
  call_last_note TEXT,
  call_last_at TIMESTAMPTZ,
  archived_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (firm_nr, week_start, customer_id)
);

CREATE INDEX IF NOT EXISTS idx_customer_call_plan_weekly_firm_week
  ON public.customer_call_plan_weekly (firm_nr, week_start DESC);

CREATE INDEX IF NOT EXISTS idx_customer_call_plan_weekly_customer
  ON public.customer_call_plan_weekly (firm_nr, customer_id, week_start DESC);

CREATE TABLE IF NOT EXISTS public.customer_call_plan_rollover (
  firm_nr VARCHAR(10) PRIMARY KEY,
  current_week_start DATE NOT NULL,
  rolled_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.customer_call_plan_weekly IS 'Müşteri arama planı haftalık arşivi (geçmiş raporlar)';
COMMENT ON TABLE public.customer_call_plan_rollover IS 'Firma bazlı aktif arama haftası — hafta başında arşiv + sıfırlama';

NOTIFY pgrst, 'reload schema';
