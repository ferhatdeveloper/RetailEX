# RetailEX Printer Service

`RetailEX_Printer`, restoran mutfak fişlerini Windows hizmeti olarak arka planda yazdırır. Hizmet, `kitchen_print_jobs` kuyruğunu local PostgreSQL ve uygun modda cloud PostgreSQL üzerinden poll eder.

## Etkinleştirme

1. Restoran yazıcı ayarlarında `printViaWindowsService` seçeneğini etkinleştirin.
2. Yazıcı profilinde bağlantı tipini **Ağ (IP)** seçin.
3. Termal yazıcının IP adresini ve portunu girin. ESC/POS için varsayılan port `9100` kullanılır.
4. Kurulumdan sonra servisleri yönetici olarak kurun:
   - `install-services-manual.cmd`
   - veya kurulum sihirbazının otomatik servis adımı

## Servis davranışı

- Servis adı: `RetailEX_Printer`
- Worker: `kitchen-print-service.mjs`
- Log: `C:\ProgramData\RetailEX\printer_service.log`
- Poll aralığı: varsayılan 2500 ms (`PRINT_POLL_MS` ile değiştirilebilir)

`config.db` içinden `local_db`, `remote_db`, `db_mode`, `erp_firm_nr` ve `erp_period_nr` okunur.

- Local PG yapılandırılmışsa her zaman denenir.
- Remote PG yalnızca `db_mode=online` veya `db_mode=hybrid` ise denenir.
- Firma/dönem tablo adı `rest.rex_{firm}_{period}_kitchen_print_jobs` biçimindedir. Örnek: `rest.rex_001_01_kitchen_print_jobs`.

## Desteklenen yazdırma yolu

Desteklenen ana yol **Network ESC/POS TCP** yazdırmadır. `connection=network` ve `address` dolu olmalıdır.

`connection=system` işleri güvenilir sessiz Windows yazdırma yolu olmadığı için başarısız işaretlenir ve logda **Ağ (IP) ESC/POS kullanın** uyarısı yazılır.

## Ortam değişkenleri

- `CONFIG_DB`: config.db yolu
- `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD`: local/env PG override
- `PRINT_FIRM_NR`: firma numarası override
- `PRINT_PERIOD_NR`: dönem numarası override
- `PRINT_POLL_MS`: poll aralığı

Manuel test:

```powershell
node kitchen-print-service.mjs --once
```
