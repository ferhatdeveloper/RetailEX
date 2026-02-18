/**
 * Exchange Rates API Routes
 * Handles currency exchange rate operations
 */

import { Hono } from 'npm:hono';
import { createClient } from 'npm:@supabase/supabase-js@2.39.3';

const app = new Hono();

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

// Get latest exchange rate for a currency
app.get('/latest', async (c) => {
  try {
    const doviz_kodu = c.req.query('doviz_kodu');
    const tarih = c.req.query('tarih') || new Date().toISOString().split('T')[0];

    if (!doviz_kodu) {
      return c.json({ error: 'doviz_kodu required' }, 400);
    }

    // Call database function (merkezi kur)
    const { data, error } = await supabase.rpc('get_latest_kur', {
      p_doviz_kodu: doviz_kodu,
      p_tarih: tarih
    });

    if (error) {
      console.error('Error fetching latest rate:', error);
      return c.json({ error: error.message }, 500);
    }

    if (!data || data.length === 0) {
      return c.json({ alis_kuru: 1, satis_kuru: 1, ortalama_kur: 1 });
    }

    return c.json(data[0]);
  } catch (error) {
    console.error('Error in /latest:', error);
    return c.json({ error: error.message }, 500);
  }
});

// Get all rates for a specific date
app.get('/by-date', async (c) => {
  try {
    const tarih = c.req.query('tarih') || new Date().toISOString().split('T')[0];

    const { data, error } = await supabase
      .from('doviz_kurlari')
      .select('*')
      .eq('tarih', tarih)
      .eq('onaylandi', true)
      .order('doviz_kodu');

    if (error) {
      console.error('Error fetching rates by date:', error);
      return c.json({ error: error.message }, 500);
    }

    return c.json(data || []);
  } catch (error) {
    console.error('Error in /by-date:', error);
    return c.json({ error: error.message }, 500);
  }
});

// Convert currency
app.post('/convert', async (c) => {
  try {
    const body = await c.req.json();
    const { tutar, kaynak_doviz, hedef_doviz, tarih, kur_tipi } = body;

    if (!tutar || !kaynak_doviz || !hedef_doviz) {
      return c.json({ error: 'tutar, kaynak_doviz, hedef_doviz required' }, 400);
    }

    // Call database function (merkezi kurlar)
    const { data, error } = await supabase.rpc('convert_currency', {
      p_tutar: tutar,
      p_kaynak_doviz: kaynak_doviz,
      p_hedef_doviz: hedef_doviz,
      p_tarih: tarih || new Date().toISOString().split('T')[0],
      p_kur_tipi: kur_tipi || 'ortalama'
    });

    if (error) {
      console.error('Error converting currency:', error);
      return c.json({ error: error.message }, 500);
    }

    return c.json({ sonuc: data });
  } catch (error) {
    console.error('Error in /convert:', error);
    return c.json({ error: error.message }, 500);
  }
});

// Save exchange rate
app.post('/', async (c) => {
  try {
    const body = await c.req.json();
    const { tarih, doviz_kodu, alis_kuru, satis_kuru, efektif_alis, efektif_satis, kaynak, created_by } = body;

    if (!tarih || !doviz_kodu || !alis_kuru || !satis_kuru) {
      return c.json({ error: 'tarih, doviz_kodu, alis_kuru, satis_kuru required' }, 400);
    }

    // Check if rate already exists
    const { data: existing, error: checkError } = await supabase
      .from('doviz_kurlari')
      .select('id')
      .eq('tarih', tarih)
      .eq('doviz_kodu', doviz_kodu)
      .maybeSingle();

    if (checkError) {
      console.error('Error checking existing rate:', checkError);
      return c.json({ error: checkError.message }, 500);
    }

    let result;
    if (existing) {
      // Update existing rate
      const { data, error } = await supabase
        .from('doviz_kurlari')
        .update({
          alis_kuru,
          satis_kuru,
          efektif_alis,
          efektif_satis,
          kaynak: kaynak || 'manuel',
          updated_at: new Date().toISOString(),
          updated_by: created_by
        })
        .eq('id', existing.id)
        .select()
        .single();

      if (error) {
        console.error('Error updating rate:', error);
        return c.json({ error: error.message }, 500);
      }

      result = data;
    } else {
      // Insert new rate
      const { data, error } = await supabase
        .from('doviz_kurlari')
        .insert({
          tarih,
          doviz_kodu,
          alis_kuru,
          satis_kuru,
          efektif_alis,
          efektif_satis,
          kaynak: kaynak || 'manuel',
          onaylandi: false,
          created_by
        })
        .select()
        .single();

      if (error) {
        console.error('Error inserting rate:', error);
        return c.json({ error: error.message }, 500);
      }

      result = data;
    }

    return c.json(result);
  } catch (error) {
    console.error('Error in / (POST):', error);
    return c.json({ error: error.message }, 500);
  }
});

// Approve exchange rate
app.post('/:id/approve', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json();
    const { kullanici_id } = body;

    if (!kullanici_id) {
      return c.json({ error: 'kullanici_id required' }, 400);
    }

    // Call database function
    const { data, error } = await supabase.rpc('approve_kur', {
      p_kur_id: id,
      p_kullanici_id: kullanici_id
    });

    if (error) {
      console.error('Error approving rate:', error);
      return c.json({ error: error.message }, 500);
    }

    return c.json({ success: data });
  } catch (error) {
    console.error('Error in /:id/approve:', error);
    return c.json({ error: error.message }, 500);
  }
});

// Get all currencies
app.get('/currencies', async (c) => {
  try {
    const { data, error } = await supabase
      .from('para_birimleri')
      .select('*')
      .eq('is_active', true)
      .order('sira_no');

    if (error) {
      console.error('Error fetching currencies:', error);
      return c.json({ error: error.message }, 500);
    }

    return c.json(data || []);
  } catch (error) {
    console.error('Error in /currencies:', error);
    return c.json({ error: error.message }, 500);
  }
});

// Get rate history
app.get('/history', async (c) => {
  try {
    const doviz_kodu = c.req.query('doviz_kodu');
    const start_date = c.req.query('start_date');
    const end_date = c.req.query('end_date');

    if (!doviz_kodu || !start_date || !end_date) {
      return c.json({ error: 'doviz_kodu, start_date, end_date required' }, 400);
    }

    const { data, error } = await supabase
      .from('doviz_kurlari')
      .select('*')
      .eq('doviz_kodu', doviz_kodu)
      .gte('tarih', start_date)
      .lte('tarih', end_date)
      .eq('onaylandi', true)
      .order('tarih', { ascending: false });

    if (error) {
      console.error('Error fetching rate history:', error);
      return c.json({ error: error.message }, 500);
    }

    return c.json(data || []);
  } catch (error) {
    console.error('Error in /history:', error);
    return c.json({ error: error.message }, 500);
  }
});

// Bulk import rates
app.post('/bulk-import', async (c) => {
  try {
    const body = await c.req.json();
    const { rates } = body;

    if (!rates || !Array.isArray(rates)) {
      return c.json({ error: 'rates array required' }, 400);
    }

    let success = 0;
    let failed = 0;

    for (const rate of rates) {
      try {
        const { error } = await supabase
          .from('doviz_kurlari')
          .upsert({
            tarih: rate.tarih,
            doviz_kodu: rate.doviz_kodu,
            alis_kuru: rate.alis_kuru,
            satis_kuru: rate.satis_kuru,
            efektif_alis: rate.efektif_alis,
            efektif_satis: rate.efektif_satis,
            kaynak: rate.kaynak || 'api',
            onaylandi: rate.onaylandi || false,
            created_by: rate.created_by
          }, {
            onConflict: 'tarih,doviz_kodu'
          });

        if (error) {
          console.error('Error importing rate:', error);
          failed++;
        } else {
          success++;
        }
      } catch (err) {
        console.error('Error processing rate:', err);
        failed++;
      }
    }

    return c.json({ success, failed });
  } catch (error) {
    console.error('Error in /bulk-import:', error);
    return c.json({ error: error.message }, 500);
  }
});

export default app;
