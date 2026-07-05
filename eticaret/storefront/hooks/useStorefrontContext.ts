import { useEffect, useState } from 'react';
import { buildStorefrontContext, type StorefrontContext } from '../../core/tenantContext';

export function useStorefrontContext(routeTenantCode?: string | null) {
  const [ctx, setCtx] = useState<StorefrontContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    void buildStorefrontContext(routeTenantCode)
      .then((next) => {
        if (!cancelled) setCtx(next);
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [routeTenantCode]);

  return { ctx, loading, error };
}
