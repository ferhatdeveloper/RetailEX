# Personel işten çıkış — kullanım

Migration: `149_parties_employee_termination_date.sql` (`rex_*_parties.termination_date`).

## Ne yapar?

1. Personel kartına **İşten çıkış tarihi** yazar.
2. Kartı **pasif** yapar (`is_active = false`).
3. Çıkış **ayındaki** maaş hakkedişini **gün oranına** çeker  
   (ör. 1–11 Eylül, 30 günlük ay → `maaş × 11 / 30`).
4. Çıkıştan **sonraki aylara** `MAAS_HAKKEDIS` yazılmaz.
5. İsteğe bağlı **İngilizce işten çıkış mektubu** yazdırır.

## Adımlar (UI)

1. Giriş yapın → **Yönetim / Cariler (Parties)** → **Personel** sekmesi.
2. İlgili personeli açın (düzenle).
3. **İşten Çıkış Tarihi** alanına son çalışma gününü yazın (ör. `2026-09-11`).
4. Kaydedin **veya** düğmeye basın:  
   **İşten çıkar + İngilizce form yazdır**  
   - Kaydet: tarih + pasif.  
   - Düğme: tarih + pasif + o ay hakkediş oranlama + İngilizce mektup yazdırma.

## Hakkediş / muhasebe notu

| Durum | Davranış |
|--------|----------|
| Çıkış ayından önceki aylar | Otomatik hakkediş zinciri yalnızca **içinde bulunulan ay** için çalışır (mevcut kural). |
| Çıkış ayı | Gün oranlı tutar (işe giriş + çıkış dikkate alınır). |
| Çıkış sonrası aylar | Hakkediş **yazılmaz**. |
| Zaten tam ay yazılmışsa | Çıkış işlemi / yeniden tahakkuk oranı günceller. |

Avans / maaş ödemeleri ayrıdır; çıkış sonrası bakiyeyi **Personel maaş / ekstre** ekranından kontrol edin.

## İngilizce form

- Düğme: **İşten çıkar + İngilizce form yazdır** → tarayıcı yazdırma diyaloğu.
- İçerik: işveren adı, personel, kod, işe giriş, çıkış tarihi, (varsa) oranlı hakkediş, imza alanları.

## Teknik / API

```ts
import { employeeAPI } from 'src/services/api/partiesEmployees';

await employeeAPI.terminateEmployment({
  employeeId: '<uuid>',
  terminationDate: '2026-09-11',
  reason: 'End of employment',
  printLetterEn: true,
});
```

## Migration (kiracı DB)

```bash
# uzak tüm RetailEX kiracıları
PGHOST=… PGUSER=postgres PGPASSWORD=… npm run db:migrate:tenants
```

Tek DB:

```bash
PGDATABASE=aqua_beauty npm run db:migrate:env
```
