# Rongta Etiket Sablonlari

## Birincil sablon: EN1_logo_OUT.scr (Megal logolu)

56x40 mm logolu etiket sablonu. Rongta RLS1000 Label Editor ile tasarlanmis `EN1_logo_OUT.scr` uzerinde RT RONGTA logosu siyah Megal logosu ile degistirilmistir.

| Alan | Aciklama |
|------|----------|
| Megal logosu | Sol ust kose (RT RONGTA ile ayni konum) |
| PLU Name | Urun adi |
| PACKED DATE | Paketleme tarihi |
| VALID DATE | Son kullanma tarihi |
| NET WT | Net agirlik |
| UNIT PRICE | Birim fiyat |
| TOTAL PRICE | Toplam fiyat |
| Barkod | Alt bolge |

Teraziye yukleme yolu (varsayilan):
`Resources\Rongta\EN1_logo_OUT.scr`

Uygulama `DefaultLabelScr` ayarinda `EN1_logo_OUT.scr` kullanir.

### Logo yerlesimi

- Konum: x=97, y=3 nokta (orijinal RT RONGTA bbox)
- Boyut: 54x39 nokta
- PLU Name, tarih, fiyat ve barkod alanlari **degistirilmedi**

### Dosyalar

| Dosya | Aciklama |
|-------|----------|
| `../EN1_logo_OUT.scr` | Megal logolu birincil sablon |
| `EN1_logo_OUT.scr` | Labels klasoru kopyasi |
| `EN1_logo_OUT_rongta.scr` | Orijinal RT RONGTA yedegi |
| `megal_logo_black.png` | Siyah Megal logosu |
| `megal_logo_black.bmp` | Termal yazici icin 1-bit BMP |
| `EN1_megal_onizleme.png` | Megal logolu onizleme |
| `EN1_rongta_onizleme.png` | Orijinal onizleme |
| `karsilastirma_onizleme.png` | Yan yana karsilastirma |

Yeniden olusturma:

```bash
python create_en1_megal.py
```

---

## Opsiyonel: des.scr tabanli ozel tasarim

`des.scr` (40x30 mm) sablonuna kucuk Megal logosu ekleyen alternatif tasarim.

```bash
python create_logolu_tasarim.py
```

Bu sablonu kullanmak icin etiket yolunu `logolu_tasarim.scr` olarak degistirin.
