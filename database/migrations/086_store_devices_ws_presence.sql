-- WebSocket cihaz varlığı: store_devices PostgREST + heartbeat (merkez panel WS online)

COMMENT ON TABLE public.store_devices IS 'WS bağlı cihazlar — status online/offline, last_seen heartbeat';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    GRANT SELECT, INSERT, UPDATE ON public.store_devices TO anon;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
