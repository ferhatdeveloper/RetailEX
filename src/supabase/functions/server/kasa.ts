/**
 * ExRetailOS - Kasa Service (Backend)
 * 
 * Kasa yönetimi ve kasa işlemleri servisi
 * Logo muhasebe mantığı ile entegre
 * 
 * @created 2025-01-02
 */

import { Hono } from 'hono';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const app = new Hono();

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

// ===== TYPES =====

interface Kasa {
  id: string;
  firma_id: string;
  donem_id?: string;
  magaza_id?: string;
  kasa_kodu: string;
  kasa_adi: string;
  aciklama?: string;
  bakiye: number;
  id_bakiye: number;
  id_doviz_kodu: string;
  muhasebe_hesap_kodu?: string;
  muhasebe_hesap_adi?: string;
  aktif: boolean;
}

interface KasaIslemi {
  id?: string;
  firma_id: string;
  donem_id?: string;
  kasa_id: string;
  islem_no?: string;
  islem_tarihi: string;
  islem_saati?: string;
  duzenlenme_tarihi?: string;
  islem_tipi: 'CH_TAHSILAT' | 'CH_ODEME' | 'KASA_GIRIS' | 'KASA_CIKIS' | 'ACILIS' | 'KAPANIS';
  makbuz_no?: string;
  belge_no?: string;
  belge_tipi?: string;
  cari_hesap_id?: string;
  cari_hesap_kodu?: string;
  cari_hesap_unvani?: string;
  ticari_islem_grubu?: string;
  kullanilacak_para_birimi?: 'YEREL' | 'ISLEM_DOVIZI' | 'EURO';
  doviz_kodu?: string;
  tutar: number;
  dovizli_tutar?: number;
  nakit_indirimli?: number;
  islem_aciklamasi?: string;
  kasa_aciklamasi?: string;
  teminat_riskini_etkileyecek?: boolean;
  riski_etkileyecek?: boolean;
  isyeri_kodu?: string;
  isyeri_adi?: string;
  satis_elemani_kodu?: string;
  ozel_kod?: string;
  yetki_kodu?: string;
  durumu?: 'GERCEK' | 'TASLAK' | 'IPTAL';
}

// ===== HELPER FUNCTIONS =====

/**
 * Muhasebe fişi oluştur (Logo mantığı)
 */
async function createAccountingEntry(
  islem: KasaIslemi,
  kasa: Kasa
): Promise<{ success: boolean; fis_no?: string; fis_id?: string; error?: string }> {
  try {
    // Muhasebe servisini import et
    const { createJournalEntry } = await import('./accounting.ts');
    
    // İşlem tipine göre muhasebe fişi oluştur
    let satirlar: any[] = [];
    
    if (islem.islem_tipi === 'CH_TAHSILAT') {
      // Cari Hesap Tahsilat: Cari Hesap Borç, Kasa Alacak
      satirlar = [
        {
          hesap_kodu: kasa.muhasebe_hesap_kodu || '100.01.001',
          hesap_adi: kasa.muhasebe_hesap_adi || 'Kasa',
          borc: 0,
          alacak: islem.tutar,
          aciklama: `Cari Hesap Tahsilat - ${islem.cari_hesap_unvani || ''}`,
        },
        {
          hesap_kodu: islem.cari_hesap_kodu || '120.01.001',
          hesap_adi: islem.cari_hesap_unvani || 'Cari Hesap',
          borc: islem.tutar,
          alacak: 0,
          aciklama: `Cari Hesap Tahsilat - ${kasa.kasa_adi}`,
        },
      ];
    } else if (islem.islem_tipi === 'CH_ODEME') {
      // Cari Hesap Ödeme: Kasa Borç, Cari Hesap Alacak
      satirlar = [
        {
          hesap_kodu: kasa.muhasebe_hesap_kodu || '100.01.001',
          hesap_adi: kasa.muhasebe_hesap_adi || 'Kasa',
          borc: islem.tutar,
          alacak: 0,
          aciklama: `Cari Hesap Ödeme - ${islem.cari_hesap_unvani || ''}`,
        },
        {
          hesap_kodu: islem.cari_hesap_kodu || '120.01.001',
          hesap_adi: islem.cari_hesap_unvani || 'Cari Hesap',
          borc: 0,
          alacak: islem.tutar,
          aciklama: `Cari Hesap Ödeme - ${kasa.kasa_adi}`,
        },
      ];
    } else if (islem.islem_tipi === 'KASA_GIRIS') {
      // Kasa Giriş: Kasa Borç, Gider/Diğer Hesap Alacak
      satirlar = [
        {
          hesap_kodu: kasa.muhasebe_hesap_kodu || '100.01.001',
          hesap_adi: kasa.muhasebe_hesap_adi || 'Kasa',
          borc: islem.tutar,
          alacak: 0,
          aciklama: `Kasa Giriş - ${islem.kasa_aciklamasi || ''}`,
        },
        {
          hesap_kodu: '600.01.001', // Genel Giderler
          hesap_adi: 'Genel Giderler',
          borc: 0,
          alacak: islem.tutar,
          aciklama: `Kasa Giriş - ${kasa.kasa_adi}`,
        },
      ];
    } else if (islem.islem_tipi === 'KASA_CIKIS') {
      // Kasa Çıkış: Gider/Diğer Hesap Borç, Kasa Alacak
      satirlar = [
        {
          hesap_kodu: '600.01.001', // Genel Giderler
          hesap_adi: 'Genel Giderler',
          borc: islem.tutar,
          alacak: 0,
          aciklama: `Kasa Çıkış - ${islem.kasa_aciklamasi || ''}`,
        },
        {
          hesap_kodu: kasa.muhasebe_hesap_kodu || '100.01.001',
          hesap_adi: kasa.muhasebe_hesap_adi || 'Kasa',
          borc: 0,
          alacak: islem.tutar,
          aciklama: `Kasa Çıkış - ${kasa.kasa_adi}`,
        },
      ];
    }
    
    if (satirlar.length === 0) {
      return { success: false, error: 'Geçersiz işlem tipi' };
    }
    
    // Muhasebe fişi oluştur
    const result = await createJournalEntry({
      firma_id: islem.firma_id,
      donem_id: islem.donem_id || '',
      tarih: islem.islem_tarihi,
      aciklama: `${islem.islem_tipi} - ${kasa.kasa_adi} - ${islem.islem_no || ''}`,
      kaynak_belge_tipi: 'KASA_ISLEMI',
      kaynak_belge_no: islem.islem_no || '',
      satirlar,
    });
    
    return result;
  } catch (error: any) {
    console.error('[Kasa] Muhasebe fişi oluşturma hatası:', error);
    return { success: false, error: error.message };
  }
}

// ===== ROUTES =====

// GET / - Tüm kasaları listele
app.get('/', async (c) => {
  try {
    const firma_id = c.req.query('firma_id');
    const magaza_id = c.req.query('magaza_id');
    const aktif = c.req.query('aktif');
    
    let query = supabase.from('kasalar').select('*');
    
    if (firma_id) {
      query = query.eq('firma_id', firma_id);
    }
    if (magaza_id) {
      query = query.eq('magaza_id', magaza_id);
    }
    if (aktif !== undefined) {
      query = query.eq('aktif', aktif === 'true');
    }
    
    const { data, error } = await query.order('kasa_kodu', { ascending: true });
    
    if (error) {
      return c.json({ error: error.message }, 500);
    }
    
    return c.json({ success: true, data });
  } catch (error: any) {
    console.error('[Kasa] Listeleme hatası:', error);
    return c.json({ error: error.message }, 500);
  }
});

// GET /:id - Kasa detayı
app.get('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    
    const { data, error } = await supabase
      .from('kasalar')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error) {
      return c.json({ error: error.message }, 404);
    }
    
    return c.json({ success: true, data });
  } catch (error: any) {
    console.error('[Kasa] Detay hatası:', error);
    return c.json({ error: error.message }, 500);
  }
});

// POST / - Yeni kasa oluştur
app.post('/', async (c) => {
  try {
    const kasa: Partial<Kasa> = await c.req.json();
    
    const { data, error } = await supabase
      .from('kasalar')
      .insert(kasa)
      .select()
      .single();
    
    if (error) {
      return c.json({ error: error.message }, 500);
    }
    
    return c.json({ success: true, data });
  } catch (error: any) {
    console.error('[Kasa] Oluşturma hatası:', error);
    return c.json({ error: error.message }, 500);
  }
});

// PUT /:id - Kasa güncelle
app.put('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const kasa: Partial<Kasa> = await c.req.json();
    
    const { data, error } = await supabase
      .from('kasalar')
      .update({ ...kasa, guncelleme_tarihi: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    
    if (error) {
      return c.json({ error: error.message }, 500);
    }
    
    return c.json({ success: true, data });
  } catch (error: any) {
    console.error('[Kasa] Güncelleme hatası:', error);
    return c.json({ error: error.message }, 500);
  }
});

// DELETE /:id - Kasa sil
app.delete('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    
    const { error } = await supabase
      .from('kasalar')
      .delete()
      .eq('id', id);
    
    if (error) {
      return c.json({ error: error.message }, 500);
    }
    
    return c.json({ success: true, message: 'Kasa silindi' });
  } catch (error: any) {
    console.error('[Kasa] Silme hatası:', error);
    return c.json({ error: error.message }, 500);
  }
});

// ===== KASA İŞLEMLERİ ROUTES =====

// GET /islemler - Tüm kasa işlemlerini listele
app.get('/islemler', async (c) => {
  try {
    const firma_id = c.req.query('firma_id');
    const kasa_id = c.req.query('kasa_id');
    const islem_tipi = c.req.query('islem_tipi');
    const baslangic_tarihi = c.req.query('baslangic_tarihi');
    const bitis_tarihi = c.req.query('bitis_tarihi');
    
    let query = supabase.from('kasa_islemleri').select('*');
    
    if (firma_id) {
      query = query.eq('firma_id', firma_id);
    }
    if (kasa_id) {
      query = query.eq('kasa_id', kasa_id);
    }
    if (islem_tipi) {
      query = query.eq('islem_tipi', islem_tipi);
    }
    if (baslangic_tarihi) {
      query = query.gte('islem_tarihi', baslangic_tarihi);
    }
    if (bitis_tarihi) {
      query = query.lte('islem_tarihi', bitis_tarihi);
    }
    
    const { data, error } = await query.order('islem_tarihi', { ascending: false }).order('islem_no', { ascending: false });
    
    if (error) {
      return c.json({ error: error.message }, 500);
    }
    
    return c.json({ success: true, data });
  } catch (error: any) {
    console.error('[Kasa] İşlem listeleme hatası:', error);
    return c.json({ error: error.message }, 500);
  }
});

// GET /islemler/:id - Kasa işlemi detayı
app.get('/islemler/:id', async (c) => {
  try {
    const id = c.req.param('id');
    
    const { data, error } = await supabase
      .from('kasa_islemleri')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error) {
      return c.json({ error: error.message }, 404);
    }
    
    return c.json({ success: true, data });
  } catch (error: any) {
    console.error('[Kasa] İşlem detay hatası:', error);
    return c.json({ error: error.message }, 500);
  }
});

// POST /islemler - Yeni kasa işlemi oluştur
app.post('/islemler', async (c) => {
  try {
    const islem: KasaIslemi = await c.req.json();
    
    // Kasa bilgisini al
    const { data: kasa, error: kasaError } = await supabase
      .from('kasalar')
      .select('*')
      .eq('id', islem.kasa_id)
      .single();
    
    if (kasaError || !kasa) {
      return c.json({ error: 'Kasa bulunamadı' }, 404);
    }
    
    // İşlem tarihini ayarla
    if (!islem.islem_tarihi) {
      islem.islem_tarihi = new Date().toISOString().split('T')[0];
    }
    if (!islem.duzenlenme_tarihi) {
      islem.duzenlenme_tarihi = islem.islem_tarihi;
    }
    if (!islem.islem_saati) {
      const now = new Date();
      islem.islem_saati = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    }
    if (!islem.durumu) {
      islem.durumu = 'GERCEK';
    }
    
    // Kasa işlemini oluştur
    const { data: insertedIslem, error: insertError } = await supabase
      .from('kasa_islemleri')
      .insert(islem)
      .select()
      .single();
    
    if (insertError) {
      console.error('[Kasa] İşlem insert hatası:', insertError);
      return c.json({ error: insertError.message }, 500);
    }
    
    // Muhasebe fişi oluştur
    const muhasebeResult = await createAccountingEntry(insertedIslem, kasa);
    
    if (muhasebeResult.success && muhasebeResult.fis_no) {
      // Muhasebe fişi numarasını güncelle
      await supabase
        .from('kasa_islemleri')
        .update({
          muhasebe_fis_no: muhasebeResult.fis_no,
          muhasebe_fis_id: muhasebeResult.fis_id,
        })
        .eq('id', insertedIslem.id);
      
      insertedIslem.muhasebe_fis_no = muhasebeResult.fis_no;
      insertedIslem.muhasebe_fis_id = muhasebeResult.fis_id;
    }
    
    return c.json({
      success: true,
      data: insertedIslem,
      muhasebe: muhasebeResult,
    });
  } catch (error: any) {
    console.error('[Kasa] İşlem oluşturma hatası:', error);
    return c.json({ error: error.message }, 500);
  }
});

// PUT /islemler/:id - Kasa işlemi güncelle
app.put('/islemler/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const islem: Partial<KasaIslemi> = await c.req.json();
    
    const { data, error } = await supabase
      .from('kasa_islemleri')
      .update({ ...islem, guncelleme_tarihi: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    
    if (error) {
      return c.json({ error: error.message }, 500);
    }
    
    return c.json({ success: true, data });
  } catch (error: any) {
    console.error('[Kasa] İşlem güncelleme hatası:', error);
    return c.json({ error: error.message }, 500);
  }
});

// DELETE /islemler/:id - Kasa işlemi sil
app.delete('/islemler/:id', async (c) => {
  try {
    const id = c.req.param('id');
    
    const { error } = await supabase
      .from('kasa_islemleri')
      .delete()
      .eq('id', id);
    
    if (error) {
      return c.json({ error: error.message }, 500);
    }
    
    return c.json({ success: true, message: 'Kasa işlemi silindi' });
  } catch (error: any) {
    console.error('[Kasa] İşlem silme hatası:', error);
    return c.json({ error: error.message }, 500);
  }
});

export default app;




