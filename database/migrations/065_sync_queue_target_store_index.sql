-- Inbound master (merkez → kasa) sorguları: target_store_id + terminal_name

CREATE INDEX IF NOT EXISTS idx_sync_queue_target_store_pending
  ON public.sync_queue (target_store_id, status, created_at ASC)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_sync_queue_target_terminal_pending
  ON public.sync_queue (target_store_id, terminal_name, status, created_at ASC)
  WHERE status = 'pending';

NOTIFY pgrst, 'reload schema';
