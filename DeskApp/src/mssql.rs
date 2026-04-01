use tiberius::{AuthMethod, Client, Config};
use tokio::net::TcpStream;
use tokio_util::compat::TokioAsyncWriteCompatExt;
use crate::config::AppConfig;
use serde::{Serialize};
use tauri::Emitter;


fn log_to_file(msg: &str) {
    // Writing to file triggers hot-reload loop in dev mode.
    // Using eprintln! to log to terminal instead.
    eprintln!("[MSSQL Log] {}", msg);
}

#[derive(Serialize)]
pub struct LogoFirm {
    id: String,
    name: String,
}

#[derive(Serialize)]
pub struct LogoPeriod {
    nr: i32,
    start_date: String,
    end_date: String,
}

#[derive(Serialize)]
pub struct TestConnectionResponse {
    pub status: String,
    pub detected_erp: String, // "logo", "nebim", "unknown"
}

async fn get_client(config: &AppConfig) -> Result<Client<tokio_util::compat::Compat<TcpStream>>, String> {
    let mut config_builder = Config::new();

    // Parse host and port
    let host_parts: Vec<&str> = config.erp_host.split(':').collect();
    let host = host_parts[0];
    let port = if host_parts.len() > 1 {
        host_parts[1].parse::<u16>().unwrap_or(1433)
    } else {
        1433
    };

    config_builder.host(host);
    config_builder.port(port);
    config_builder.authentication(AuthMethod::sql_server(config.erp_user.as_str(), config.erp_pass.as_str()));
    config_builder.database(config.erp_db.as_str());
    config_builder.trust_cert(); // Essential for self-signed certs common in Logo setups

    let tcp = TcpStream::connect(format!("{}:{}", host, port)).await.map_err(|e| e.to_string())?;
    tcp.set_nodelay(true).map_err(|e| e.to_string())?;

    let client = Client::connect(config_builder, tcp.compat_write()).await.map_err(|e| e.to_string())?;
    
    Ok(client)
}

#[tauri::command]
pub async fn test_mssql_connection(config: AppConfig) -> Result<TestConnectionResponse, String> {
    let mut client = get_client(&config).await?;
    
    // 1. Basic probe to verify connection
    let _ = client.simple_query("SELECT 1").await.map_err(|e| e.to_string())?;
    
    // 2. Identify ERP system by signature tables
    let mut detected_erp = "unknown".to_string();
    
    // Check for Logo (L_CAPIFIRM is the definitive system table)
    {
        let logo_check = client.simple_query("SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'L_CAPIFIRM'").await;
        if let Ok(stream) = logo_check {
            if let Ok(rows) = stream.into_first_result().await {
                let count: i32 = rows.get(0).and_then(|r| r.get::<i32, usize>(0)).unwrap_or(0);
                if count > 0 {
                    detected_erp = "logo".to_string();
                }
            }
        }
    }
    
    // If not Logo, check for Nebim V3 (TR_Employee or TB_Item are characteristic)
    if detected_erp == "unknown" {
        let nebim_check = client.simple_query("SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'TR_Employee'").await;
        if let Ok(stream) = nebim_check {
             if let Ok(rows) = stream.into_first_result().await {
                let count: i32 = rows.get(0).and_then(|r| r.get::<i32, usize>(0)).unwrap_or(0);
                if count > 0 {
                    detected_erp = "nebim".to_string();
                }
            }
        }
    }

    Ok(TestConnectionResponse {
        status: "success".to_string(),
        detected_erp,
    })
}

#[tauri::command]
pub async fn get_logo_firms(config: AppConfig) -> Result<Vec<LogoFirm>, String> {
    let mut client = get_client(&config).await?;
    
    // Logo Firms are in L_CAPIFIRM table
    let stream = client.simple_query("SELECT LTRIM(STR(NR, 3, 0)), NAME FROM L_CAPIFIRM ORDER BY NR").await.map_err(|e| e.to_string())?;
    let rows = stream.into_first_result().await.map_err(|e| e.to_string())?;
    
    let mut firms = Vec::new();
    for row in rows {
        let nr: &str = row.get(0).ok_or("Failed to get NR")?;
        let name: &str = row.get(1).ok_or("Failed to get NAME")?;
        
        firms.push(LogoFirm {
            id: nr.to_string(),
            name: name.to_string(),
        });
    }
    
    Ok(firms)
}

#[tauri::command]
pub async fn get_logo_periods(config: AppConfig, firm_nr: String) -> Result<Vec<LogoPeriod>, String> {
    log_to_file("get_logo_periods called");
    log_to_file(&format!("Firm NR string: {}", firm_nr));

    let mut client = match get_client(&config).await {
        Ok(c) => c,
        Err(e) => {
            log_to_file(&format!("Connection failed: {}", e));
            return Err(e);
        }
    };
    
    let firm_int = firm_nr.parse::<i32>().unwrap_or(0);
    log_to_file(&format!("Firm NR parsed: {}", firm_int));
    
    // User requested dynamic table approach: LG_{FIRM}_PERIODS
    // Example: LG_009_PERIODS
    let table_name = format!("LG_{:03}_PERIODS", firm_int);
    let query = format!("SELECT NR, CONVERT(varchar, BEGDATE, 104), CONVERT(varchar, ENDDATE, 104) FROM {} ORDER BY NR", table_name);
    log_to_file(&format!("Executing Query: {}", query));
    
    let stream = match client.simple_query(query).await {
        Ok(s) => s,
        Err(e) => {
            log_to_file(&format!("Query execution failed: {}", e));
            return Err(e.to_string());
        }
    };

    let rows = match stream.into_first_result().await {
        Ok(r) => r,
        Err(e) => {
             log_to_file(&format!("Failed to get results: {}", e));
             return Err(e.to_string());
        }
    };
    
    log_to_file(&format!("Rows found: {}", rows.len()));

    let mut periods = Vec::new();
    for (i, row) in rows.iter().enumerate() {
        // Safe NR extraction: Try i16 (common in Logo), then i32, then i64, then others
        let nr = if let Some(n) = row.get::<i16, usize>(0) {
            n as i32
        } else if let Some(n) = row.get::<i32, usize>(0) {
            n
        } else if let Some(n) = row.get::<i64, usize>(0) {
            n as i32
        } else if let Some(n) = row.get::<u8, usize>(0) {
            n as i32
        } else {
            log_to_file(&format!("Row {}: Could not parse NR as integer. Trying float...", i));
             if let Some(f) = row.get::<f64, usize>(0) {
                f as i32
             } else if let Some(f) = row.get::<f32, usize>(0) {
                f as i32
             } else {
                 log_to_file(&format!("Row {}: Failed to parse NR column completely.", i));
                 0
             }
        };

        let beg = row.get::<&str, usize>(1).unwrap_or("").to_string();
        let end = row.get::<&str, usize>(2).unwrap_or("").to_string();
        
        log_to_file(&format!("Parsed Row {}: NR={}, Beg={}, End={}", i, nr, beg, end));

        if nr > 0 {
             periods.push(LogoPeriod {
                nr,
                start_date: beg,
                end_date: end,
            });
        }
    }
    
    log_to_file(&format!("Returning {} periods", periods.len()));
    Ok(periods)
}
#[derive(Serialize)]
pub struct LogoPreviewResponse {
    pub query: String,
    pub data: Vec<serde_json::Value>,
}

#[tauri::command]
pub async fn get_logo_data_preview(
    config: AppConfig, 
    entity: String // "ITEMS", "CLCARD", "INVOICE"
) -> Result<LogoPreviewResponse, String> {
    log_to_file("get_logo_data_preview called");
    log_to_file(&format!("Entity: {}, Firm: {}, Period: {}", entity, config.erp_firm_nr, config.erp_period_nr));

    let mut client = match get_client(&config).await {
        Ok(c) => c,
        Err(e) => {
             log_to_file(&format!("Connection failed: {}", e));
             return Err(e);
        }
    };
    
    let firm_int = config.erp_firm_nr.parse::<i32>().unwrap_or(0);
    let period_int = config.erp_period_nr.parse::<i32>().unwrap_or(0);
    let firm_nr = format!("{:0>3}", firm_int);
    let period_nr = format!("{:0>2}", period_int);
    
    let (table_name, select_fields) = match entity.as_str() {
        "ITEMS" => (format!("LG_{}_ITEMS", firm_nr), "*"),
        "CLCARD" => (format!("LG_{}_CLCARD", firm_nr), "*"),
        "INVOICE" => (format!("LG_{}_{}_INVOICE", firm_nr, period_nr), "LOGICALREF, FICHENO, DATE_, TRCODE, GROSSTOTAL, NETTOTAL, GENEXP1"),
        "KSCARD" => (format!("LG_{}_KSCARD", firm_nr), "LOGICALREF, CODE, NAME, SPECODE, CYPHCODE"),
        _ => return Err("Geçersiz varlık tipi".to_string()),
    };

    // Optimized for stability: TOP 20 without verbose per-column logging
    let query = format!("SELECT TOP 20 {} FROM {} WITH(NOLOCK) ORDER BY LOGICALREF DESC", select_fields, table_name);
    log_to_file(&format!("Executing Query (TOP 20): {}", query));
    
    let stream = match client.simple_query(&query).await {
        Ok(s) => s,
        Err(e) => {
             log_to_file(&format!("Query execution failed: {}", e));
             return Err(e.to_string());
        }
    };

    let rows = match stream.into_first_result().await {
        Ok(r) => r,
        Err(e) => {
            log_to_file(&format!("Error getting rows: {}", e));
            return Err(e.to_string());
        }
    };
    
    log_to_file(&format!("Rows found: {}", rows.len()));
    
    let mut results = Vec::new();
    for (_r_idx, row) in rows.iter().enumerate() {
        // log_to_file(&format!("Processing Row {}", r_idx)); // Disabled for performance
        let mut map = serde_json::Map::new();
        for (i, column) in row.columns().iter().enumerate() {
            let name = column.name();
            // log_to_file(&format!("  Processing Col {}: {}", i, name)); // Verbose but needed if crashing
            
            let val = if let Ok(Some(s)) = row.try_get::<&str, usize>(i) {
                serde_json::Value::String(s.to_string())
            } else if let Ok(Some(n)) = row.try_get::<i32, usize>(i) {
                serde_json::Value::Number(n.into())
            } else if let Ok(Some(n)) = row.try_get::<i64, usize>(i) {
                serde_json::Value::Number(n.into())
            } else if let Ok(Some(f)) = row.try_get::<f64, usize>(i) {
                serde_json::Value::String(format!("{:.2}", f))
            } else if let Ok(Some(f)) = row.try_get::<f32, usize>(i) {
                serde_json::Value::String(format!("{:.2}", f))
            } else if let Ok(Some(d)) = row.try_get::<chrono::NaiveDateTime, usize>(i) {
                serde_json::Value::String(d.format("%d.%m.%Y %H:%M").to_string())
            } else if let Ok(Some(d)) = row.try_get::<chrono::NaiveDate, usize>(i) {
                serde_json::Value::String(d.format("%d.%m.%Y").to_string())
            } else if let Ok(Some(b)) = row.try_get::<bool, usize>(i) {
                serde_json::Value::Bool(b)
            } else if let Ok(Some(n)) = row.try_get::<i16, usize>(i) {
                serde_json::Value::Number(n.into())
            } else if let Ok(Some(n)) = row.try_get::<u8, usize>(i) {
                serde_json::Value::Number(n.into())
            } else if let Ok(Some(d)) = row.try_get::<rust_decimal::Decimal, usize>(i) {
                 serde_json::Value::String(d.to_string())
            } else {
                serde_json::Value::Null
            };
            
            map.insert(name.to_string(), val);
        }
        results.push(serde_json::Value::Object(map));
    }
    
    log_to_file("Finished processing rows. Returning result.");
    
    Ok(LogoPreviewResponse {
        query,
        data: results,
    })
}

#[tauri::command]
pub async fn sync_logo_data(window: tauri::Window, config: AppConfig) -> Result<String, String> {
    log_to_file("sync_logo_data called");

    // Guard: never attempt MSSQL connection in standalone (skip_integration) mode
    if config.skip_integration {
        log_to_file("skip_integration=true, skipping Logo sync");
        let _ = window.emit("sync-event", "Bağımsız mod: Logo senkronizasyonu atlandı.");
        return Ok("Bağımsız mod: Logo senkronizasyonu atlandı.".to_string());
    }

    log_to_file(&format!("Syncing for firm: {}", config.erp_firm_nr));

    let _ = window.emit("sync-event", "Bağlantılar kuruluyor...");

    // 1. Establish Connections — kaynak: Logo'nun canlı MSSQL veritabanı (RetailEX içi demo seed ile ilgisi yok)
    let mut mssql_client = get_client(&config).await.map_err(|e| format!("MSSQL Connection Error: {}", e))?;
    let _ = window.emit(
        "sync-event",
        "Logo ERP (MSSQL) bağlandı — seçili firma/dönem için gerçek stok, cari ve hareket verileri okunacak.",
    );
    
    // PostgreSQL: migrations ile aynı hedef (yerel / uzak). Eski kod yalnızca local_db kullanıyordu;
    // db_mode=online iken senkron yanlış veritabanına yazılıyordu.
    let is_remote_pg = config.db_mode == "online";
    let (db_path, pg_user, pg_pass) = if is_remote_pg {
        (&config.remote_db, &config.pg_remote_user, &config.pg_remote_pass)
    } else {
        (&config.local_db, &config.pg_local_user, &config.pg_local_pass)
    };
    let host_part = db_path.split(':').next().unwrap_or("localhost");
    let host_port_str = db_path.split('/').next().unwrap_or("localhost:5432");
    let port = if let Some(p) = host_port_str.split(':').nth(1) {
        p.parse::<u16>().unwrap_or(5432)
    } else {
        5432
    };
    let db_name = db_path.split('/').last().unwrap_or("retailex_local");
    let _ = window.emit(
        "sync-event",
        format!(
            "PostgreSQL hedefi: {} ({})",
            db_name,
            if is_remote_pg { "uzak sunucu" } else { "yerel" }
        ),
    );
    let mut pg_config = tokio_postgres::Config::new();
    pg_config.host(host_part)
             .port(port)
             .user(pg_user.as_str())
             .password(pg_pass.as_str())
             .dbname(db_name)
             .connect_timeout(std::time::Duration::from_secs(5));

    let (pg_client, pg_conn) = pg_config.connect(tokio_postgres::NoTls)
        .await
        .map_err(|e| format!("Postgres Connection Error [{}]: {}", db_name, crate::db_utils::format_pg_error(e)))?;

    tokio::spawn(async move {
        if let Err(e) = pg_conn.await {
            eprintln!("Postgres connection error: {}", e);
        }
    });

    log_to_file("Connected to both databases.");
    
    let firms_to_sync = if !config.selected_firms.is_empty() {
        config.selected_firms.clone()
    } else {
        vec![config.erp_firm_nr.clone()]
    };

    for raw_firm_nr in firms_to_sync {
        let firm_nr_int = raw_firm_nr.parse::<i32>().unwrap_or(0);
        let current_firm_nr = format!("{:03}", firm_nr_int);
        
        log_to_file(&format!("Processing firm: {} (int: {})", current_firm_nr, firm_nr_int));
        let _ = window.emit("sync-event", format!("Firma {} için veriler alınıyor...", current_firm_nr));

        // 2. Sync Firm

    let firm_query = format!("SELECT NAME, TITLE FROM L_CAPIFIRM WHERE NR = {}", firm_nr_int);
    let firm_rows = mssql_client.simple_query(firm_query).await.map_err(|e| e.to_string())?.into_first_result().await.map_err(|e| e.to_string())?;
    
    if firm_rows.is_empty() {
        return Err(format!("Firma {} Logo'da bulunamadı!", current_firm_nr));
    }
    
    let firm_name = firm_rows[0].get::<&str, _>(0).unwrap_or("Unknown Firm");
    let firm_title = firm_rows[0].get::<&str, _>(1).unwrap_or(firm_name);
    
    let firm_id: uuid::Uuid = pg_client.query_one(
        "INSERT INTO firms (firm_nr, name, title) VALUES ($1, $2, $3) 
         ON CONFLICT (firm_nr) DO UPDATE SET name = $2, title = $3 
         RETURNING id",
        &[&current_firm_nr, &firm_name, &firm_title]
    ).await.map_err(|e| format!("Failed to upsert firm: {}", e))?.get(0);
    
    // Ensure Dynamic Tables Exist
    let _ = window.emit("sync-event", "Veritabanı tabloları hazırlanıyor...");
    pg_client.execute(
        "SELECT CREATE_FIRM_TABLES($1)", 
        &[&current_firm_nr]
    ).await.map_err(|e| format!("Tablo oluşturma hatası: {}", e))?;

    // 3. Sync Periods
    let _ = window.emit("sync-event", "Dönemler senkronize ediliyor...");
    let periods_table = format!("LG_{:03}_PERIODS", firm_nr_int);
    let period_query = format!("SELECT NR, BEGDATE, ENDDATE FROM {} ORDER BY NR", periods_table);
    
    match mssql_client.simple_query(period_query).await {
        Ok(res) => {
            let period_rows = res.into_first_result().await.unwrap_or_default();
            for row in period_rows {
                let nr = if let Some(n) = row.get::<i16, usize>(0) { n as i32 } 
                         else if let Some(n) = row.get::<i32, usize>(0) { n } 
                         else { 0 };

                let beg_date: chrono::NaiveDate = if let Some(d) = row.get::<chrono::NaiveDateTime, usize>(1) { d.date() } 
                                             else if let Some(d) = row.get::<chrono::NaiveDate, usize>(1) { d }
                                             else { chrono::NaiveDate::from_ymd_opt(2000, 1, 1).unwrap() };

                let end_date: chrono::NaiveDate = if let Some(d) = row.get::<chrono::NaiveDateTime, usize>(2) { d.date() } 
                                             else if let Some(d) = row.get::<chrono::NaiveDate, usize>(2) { d }
                                             else { chrono::NaiveDate::from_ymd_opt(2000, 12, 31).unwrap() };

                if nr > 0 {
                     pg_client.execute(
                        "INSERT INTO periods (firm_id, nr, beg_date, end_date) VALUES ($1, $2, $3, $4)
                         ON CONFLICT (firm_id, nr) DO UPDATE SET beg_date = $3, end_date = $4",
                        &[&firm_id, &nr, &beg_date, &end_date]
                    ).await.map_err(|e| format!("Failed to sync period {}: {}", nr, e))?;
                }
            }
        },
        Err(e) => eprintln!("Periods sync check failed: {}", e), // Non-critical
    }

    // 4. Sync Stores
    let _ = window.emit("sync-event", "Depolar ve şubeler güncelleniyor...");
    let wh_query = format!("SELECT NR, NAME FROM L_CAPIWHOUSE WHERE FIRMNR = {}", firm_nr_int);
    match mssql_client.simple_query(&wh_query).await {
        Ok(stream) => {
             if let Ok(wh_rows) = stream.into_first_result().await {
                 for row in wh_rows {
                    let nr = if let Some(n) = row.get::<i16, usize>(0) { n as i32 } else { 0 };
                    let name = row.get::<&str, usize>(1).unwrap_or("Depo");
                    let code = format!("{}", nr);
                    
                    pg_client.execute(
                        "INSERT INTO stores (code, name, firm_nr, is_active) VALUES ($1, $2, $3, true)
                         ON CONFLICT (code) DO UPDATE SET name = $2",
                        &[&code, &name, &current_firm_nr]
                    ).await.map_err(|e| format!("Failed to sync store {}: {}", nr, e))?;
                 }
             }
        }
        Err(_) => {
             pg_client.execute(
                "INSERT INTO stores (code, name, firm_nr, is_main) VALUES ('0', 'Merkez Depo', $1, true)
                 ON CONFLICT (code) DO NOTHING",
                &[&current_firm_nr]
            ).await.ok();
        }
    }
    
    // 5. Sync ITEMS (Product Cards)
    let _ = window.emit("sync-event", "Stok kartları (ITEMS) analiz ediliyor...");
    let items_table = format!("LG_{:03}_ITEMS", firm_nr_int);
    // Fetch count first for progress
    let count_query = format!("SELECT COUNT(*) FROM {}", items_table); 
    let mut total_items = 0;
    if let Ok(res) = mssql_client.simple_query(&count_query).await {
        if let Ok(rows) = res.into_first_result().await {
             if let Some(row) = rows.get(0) {
                 total_items = if let Some(n) = row.get::<i32, usize>(0) { n }
                              else if let Some(n) = row.get::<i64, usize>(0) { n as i32 }
                              else if let Some(n) = row.get::<i16, usize>(0) { n as i32 }
                              else { 0 };
             }
        }
    }
    
    let _ = window.emit("sync-event", format!("{} adet stok kartı bulundu. Aktarım başlıyor...", total_items));
    
    // Batch fetch items
    let items_query = format!("SELECT LOGICALREF, CODE, NAME, VAT FROM {} ORDER BY LOGICALREF", items_table);
    let item_stream = mssql_client.simple_query(&items_query).await.map_err(|e| e.to_string())?;
    let item_rows = item_stream.into_first_result().await.map_err(|e| e.to_string())?;

    let target_products_table = format!("rex_{}_products", current_firm_nr);
    
    let mut processed = 0;
    let mut errors = 0;
    for row in item_rows {
        let logicalref = row.get::<i32, usize>(0).unwrap_or(0);
        let code = row.get::<&str, usize>(1).unwrap_or("");
        let name = row.get::<&str, usize>(2).unwrap_or("İsimsiz");
        
        // Robust VAT handling
        let vat = if let Some(v) = row.get::<f64, usize>(3) { v as i32 }
                 else if let Some(v) = row.get::<i32, usize>(3) { v }
                 else if let Some(v) = row.get::<i16, usize>(3) { v as i32 }
                 else if let Some(v) = row.get::<u8, usize>(3) { v as i32 }
                 else { 18 };

        let insert_sql = format!(
            "INSERT INTO {} (firm_nr, ref_id, code, name, vat_rate) VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (code) DO UPDATE SET ref_id=$2, name=$4, vat_rate=$5", target_products_table
        );
        let vat_dec = rust_decimal::Decimal::from(vat);

        if let Err(e) = pg_client.execute(
            &insert_sql,
            &[&current_firm_nr, &logicalref, &code, &name, &vat_dec]
        ).await {
            errors += 1;
            let _ = window.emit("sync-error", format!("Ürün kayıt hatası ({}): {}", code, e));
        }
        
        processed += 1;
        if processed % 50 == 0 {
             let _ = window.emit("sync-event", format!("Stok Kartları: {}/{} (Hata: {})", processed, total_items, errors));
        }
    }

    // 6. Sync CLCARD (Customers/Suppliers)
    let _ = window.emit("sync-event", "Cari hesaplar (CLCARD) kontrol ediliyor...");
    let clcard_table = format!("LG_{:03}_CLCARD", firm_nr_int);
    let cl_count_query = format!("SELECT COUNT(*) FROM {}", clcard_table);
    let mut total_cl = 0;
    if let Ok(res) = mssql_client.simple_query(&cl_count_query).await {
         if let Ok(rows) = res.into_first_result().await {
             total_cl = rows.get(0).map(|r| r.get::<i32, usize>(0).unwrap_or(0)).unwrap_or(0);
         }
    }
    
    let _ = window.emit("sync-event", format!("{} adet cari hesap bulundu. Aktarılıyor...", total_cl));
    
    let cl_query = format!("SELECT LOGICALREF, CODE, DEFINITION_, TAXNR, TAXOFFICE, CITY FROM {} ORDER BY LOGICALREF", clcard_table);
    let cl_rows = mssql_client.simple_query(cl_query).await.map_err(|e| e.to_string())?.into_first_result().await.map_err(|e| e.to_string())?;
    
    let target_customers_table = format!("rex_{}_customers", current_firm_nr);
    
    processed = 0;
    let mut cl_errors = 0;
    for row in cl_rows {
        let logicalref = row.get::<i32, usize>(0).unwrap_or(0);
        let code = row.get::<&str, usize>(1).unwrap_or("");
        let name = row.get::<&str, usize>(2).unwrap_or("İsimsiz");
        let tax_nr = row.get::<&str, usize>(3).unwrap_or("");
        let tax_office = row.get::<&str, usize>(4).unwrap_or("");
        let city = row.get::<&str, usize>(5).unwrap_or("");
        
        let insert_sql = format!(
            "INSERT INTO {} (firm_nr, ref_id, code, name, tax_nr, tax_office, city) VALUES ($1, $2, $3, $4, $5, $6, $7)
             ON CONFLICT (code) DO UPDATE SET ref_id=$2, name=$4, tax_nr=$5, city=$7", target_customers_table
        );
        
        if let Err(e) = pg_client.execute(
            &insert_sql,
            &[&current_firm_nr, &logicalref, &code, &name, &tax_nr, &tax_office, &city]
        ).await {
            cl_errors += 1;
            let _ = window.emit("sync-error", format!("Cari kayıt hatası ({}): {}", code, e));
        }
        
        processed += 1;
        if processed % 50 == 0 {
             let _ = window.emit("sync-event", format!("Cari Hesaplar: {}/{} (Hata: {})", processed, total_cl, cl_errors));
        }
    }
    
    // 7. Sync SLMAN (Sales Representatives) - [FIELD SALES SUPPORT]
    let _ = window.emit("sync-event", "Satış Elemanları (SLMAN) senkronize ediliyor...");
    let slman_table = "LG_SLMAN";
    let target_slman_table = format!("rex_{}_sales_reps", current_firm_nr);
    
    let slman_query = format!("SELECT LOGICALREF, CODE, DEFINITION_ FROM {} WHERE ACTIVE=0 ORDER BY LOGICALREF", slman_table);
    if let Ok(sl_stream) = mssql_client.simple_query(&slman_query).await {
        if let Ok(sl_rows) = sl_stream.into_first_result().await {
            for row in sl_rows {
                let logicalref = row.get::<i32, usize>(0).unwrap_or(0);
                let code = row.get::<&str, usize>(1).unwrap_or("");
                let name = row.get::<&str, usize>(2).unwrap_or("");
                
                // Default Password for Field Sales: 142536
                let insert_sql = format!(
                    "INSERT INTO {} (ref_id, code, name, password_hash) 
                     VALUES ($1, $2, $3, crypt('142536', gen_salt('bf')))
                     ON CONFLICT (code) DO UPDATE SET ref_id=$1, name=$3", target_slman_table
                );
                
                pg_client.execute(&insert_sql, &[&logicalref, &code, &name]).await.ok();
            }
        }
    }

    // 8. Sync Barcodes (UNITBARCODE)
    let _ = window.emit("sync-event", "Barkodlar (UNITBARCODE) güncelleniyor...");
    let barcode_table = format!("LG_{:03}_UNITBARCODE", firm_nr_int);
    
    // Check if table exists (UNITBARCODE is standard but sometimes old versions use ITMUNITA)
    let bc_query = format!(
        "SELECT I.CODE, B.BARCODE 
         FROM {} B 
         INNER JOIN {} I ON B.ITEMREF = I.LOGICALREF 
         WHERE B.LINENR=1", 
         barcode_table, items_table
    );

    match mssql_client.simple_query(&bc_query).await {
        Ok(stream) => {
             if let Ok(bc_rows) = stream.into_first_result().await {
                 let total_bc = bc_rows.len();
                 let _ = window.emit("sync-event", format!("{} adet barkod bulundu. İşleniyor...", total_bc));
                 
                 let mut bc_processed = 0;
                 for row in bc_rows {
                    let code = row.get::<&str, usize>(0).unwrap_or("");
                    let barcode = row.get::<&str, usize>(1).unwrap_or("");
                    
                    if !code.is_empty() && !barcode.is_empty() {
                        let update_sql = format!("UPDATE {} SET barcode = $1 WHERE code = $2", target_products_table);
                        pg_client.execute(&update_sql, &[&barcode, &code]).await.ok();
                    }
                    
                    bc_processed += 1;
                    if bc_processed % 100 == 0 {
                        let _ = window.emit("sync-event", format!("Barkodlar: {}/{}", bc_processed, total_bc));
                    }
                 }
             }
        }
        Err(e) => {
             let _ = window.emit("sync-event", format!("Barkod tablosu okunamadı (Eski sürüm olabilir): {}", e));
        }
    }

    // 8. Sync Prices (PRCLIST)
    let _ = window.emit("sync-event", "Satış Fiyatları (PRCLIST) güncelleniyor...");
    let price_table = format!("LG_{:03}_PRCLIST", firm_nr_int);
    
    // PTYPE=2 (Sales), PRIORIT=0 (Default), STAT=0 (Active)
    let price_query = format!(
        "SELECT I.CODE, P.PRICE 
         FROM {} P 
         INNER JOIN {} I ON P.CARDREF = I.LOGICALREF 
         WHERE P.PTYPE=2 AND P.ACTIVE=0", 
         price_table, items_table
    );

    match mssql_client.simple_query(&price_query).await {
        Ok(stream) => {
             if let Ok(price_rows) = stream.into_first_result().await {
                 let total_price = price_rows.len();
                 let _ = window.emit("sync-event", format!("{} adet fiyat kaydı bulundu. İşleniyor...", total_price));
                 
                 let mut price_processed = 0;
                 for row in price_rows {
                    let code = row.get::<&str, usize>(0).unwrap_or("");
                    // Handling decimal/float for Price
                    let price_val = if let Some(p) = row.get::<f64, usize>(1) { p } 
                                    else if let Some(p) = row.get::<rust_decimal::Decimal, usize>(1) { 
                                        use rust_decimal::prelude::ToPrimitive;
                                        p.to_f64().unwrap_or(0.0) 
                                    } else { 0.0 };
                    
                    if !code.is_empty() {
                        let price_dec = rust_decimal::Decimal::from_f64_retain(price_val).unwrap_or_default();
                        let update_sql = format!("UPDATE {} SET price = $1 WHERE code = $2", target_products_table);
                        pg_client.execute(&update_sql, &[&price_dec, &code]).await.ok();
                    }

                    price_processed += 1;
                    if price_processed % 100 == 0 {
                        let _ = window.emit("sync-event", format!("Fiyatlar: {}/{}", price_processed, total_price));
                    }
                 }
             }
        }
        Err(e) => {
             let _ = window.emit("sync-event", format!("Fiyat tablosu okunamadı: {}", e));
        }
    }

    // 9. Sync Stock Levels (STINVTOT View)
    let _ = window.emit("sync-event", "Stok Seviyeleri (Envanter) güncelleniyor...");
    let period_nr_int = config.erp_period_nr.parse::<i32>().unwrap_or(1);
    let stock_table = format!("LV_{:03}_{:02}_STINVTOT", firm_nr_int, period_nr_int);
    
    // Sum onhand from all inventory locations (INVENNO) for each item
    let stock_query = format!(
        "SELECT I.CODE, SUM(S.ONHAND) \
         FROM {} S \
         INNER JOIN {} I ON S.STOCKREF = I.LOGICALREF \
         GROUP BY I.CODE", 
         stock_table, items_table
    );

    match mssql_client.simple_query(&stock_query).await {
        Ok(stream) => {
             if let Ok(stock_rows) = stream.into_first_result().await {
                 let total_stock = stock_rows.len();
                 let _ = window.emit("sync-event", format!("{} adet stok verisi bulundu. İşleniyor...", total_stock));
                 
                 let mut stock_processed = 0;
                 for row in stock_rows {
                    let code = row.get::<&str, usize>(0).unwrap_or("");
                    let stock_val = if let Some(s) = row.get::<f64, usize>(1) { s } 
                                    else if let Some(s) = row.get::<rust_decimal::Decimal, usize>(1) { 
                                        use rust_decimal::prelude::ToPrimitive;
                                        s.to_f64().unwrap_or(0.0) 
                                    } else { 0.0 };
                    
                    if !code.is_empty() {
                        let stock_dec = rust_decimal::Decimal::from_f64_retain(stock_val).unwrap_or_default();
                        let update_sql = format!("UPDATE {} SET stock = $1 WHERE code = $2", target_products_table);
                        pg_client.execute(&update_sql, &[&stock_dec, &code]).await.ok();
                    }

                    stock_processed += 1;
                    if stock_processed % 100 == 0 {
                        let _ = window.emit("sync-event", format!("Stoklar: {}/{}", stock_processed, total_stock));
                    }
                 }
             }
        }
        Err(e) => {
             let _ = window.emit("sync-event", format!("Stok tablosu (View) okunamadı: {}", e));
        }
    }

    // 10. Sync Cash Registers (KSCARD)
    let _ = window.emit("sync-event", "Kasa Kartları (KSCARD) güncelleniyor...");
    let kscard_table = format!("LG_{:03}_KSCARD", firm_nr_int);
    let target_cash_table = format!("rex_{}_cash_registers", current_firm_nr);
    
    let ks_query = format!("SELECT LOGICALREF, CODE, NAME FROM {} WHERE ACTIVE=0 ORDER BY LOGICALREF", kscard_table);
    if let Ok(ks_stream) = mssql_client.simple_query(&ks_query).await {
        if let Ok(ks_rows) = ks_stream.into_first_result().await {
            for row in ks_rows {
                let logicalref = row.get::<i32, usize>(0).unwrap_or(0);
                let code = row.get::<&str, usize>(1).unwrap_or("");
                let name = row.get::<&str, usize>(2).unwrap_or("");
                
                let insert_sql = format!(
                    "INSERT INTO {} (ref_id, code, name) VALUES ($1, $2, $3)
                     ON CONFLICT (code) DO UPDATE SET ref_id=$1, name=$3", target_cash_table
                );
                pg_client.execute(&insert_sql, &[&logicalref, &code, &name]).await.ok();
            }
        }
    }

    // 11. Sync Cash Transactions (KSLINES)
    let _ = window.emit("sync-event", "Kasa Hareketleri (KSLINES) güncelleniyor...");
    let period_nr_int = config.erp_period_nr.parse::<i32>().unwrap_or(1);
    let kslines_table = format!("LG_{:03}_{:02}_KSLINES", firm_nr_int, period_nr_int);
    let target_cash_lines_table = format!("rex_{}_{:02}_cash_lines", current_firm_nr, period_nr_int);
    
    let ksl_query = format!(
        "SELECT LOGICALREF, KASAREF, FICHENO, TRCODE, DATE_, AMOUNT, SIGN, CLIENTREF, LINEEXP 
         FROM {} ORDER BY LOGICALREF", kslines_table
    );

    if let Ok(ksl_stream) = mssql_client.simple_query(&ksl_query).await {
        if let Ok(ksl_rows) = ksl_stream.into_first_result().await {
            let total_ksl = ksl_rows.len();
            let mut ksl_processed = 0;
            for row in ksl_rows {
                let logicalref = row.get::<i32, usize>(0).unwrap_or(0);
                let cash_ref = row.get::<i32, usize>(1).unwrap_or(0);
                let fiche_no = row.get::<&str, usize>(2).unwrap_or("");
                let trcode = row.get::<i16, usize>(3).unwrap_or(0) as i32;
                let date = row.get::<chrono::NaiveDateTime, usize>(4).unwrap_or_else(|| chrono::NaiveDate::from_ymd_opt(2000, 1, 1).unwrap().and_hms_opt(0, 0, 0).unwrap());
                let amount = if let Some(a) = row.get::<f64, usize>(5) { a } else { 0.0 };
                let sign = row.get::<i16, usize>(6).unwrap_or(0) as i32;
                let client_ref = row.get::<i32, usize>(7).unwrap_or(0);
                let definition = row.get::<&str, usize>(8).unwrap_or("");

                let insert_sql = format!(
                    "INSERT INTO {} (ref_id, cash_ref, fiche_no, trcode, date, amount, sign, customer_ref, definition) 
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                     ON CONFLICT (ref_id) DO NOTHING", target_cash_lines_table
                );
                
                let amount_dec = rust_decimal::Decimal::from_f64_retain(amount).unwrap_or_default();

                pg_client.execute(
                    &insert_sql, 
                    &[&logicalref, &cash_ref, &fiche_no, &trcode, &date, &amount_dec, &sign, &client_ref, &definition]
                ).await.ok();

                ksl_processed += 1;
                if ksl_processed % 100 == 0 {
                    let _ = window.emit("sync-event", format!("Kasa Hareketleri: {}/{}", ksl_processed, total_ksl));
                }
            }
        }
    }

    // 11.5. Sync Stock Movements (STLINE)
    let _ = window.emit("sync-event", "Stok Hareketleri (STLINE) senkronize ediliyor...");
    let period_nr_int = config.erp_period_nr.parse::<i32>().unwrap_or(1);
    let stline_table = format!("LG_{:03}_{:02}_STLINE", firm_nr_int, period_nr_int);
    let target_stock_moves_table = format!("rex_{}_{:02}_stock_moves", current_firm_nr, period_nr_int);
    
    // Query STLINE for ALL stock movements (not just sales)
    // IOCODE: 1,2,3... (Different types, we map to 1:In, 2:Out)
    let stmove_query = format!(
        "SELECT STOCKREF, SOURCEINDEX, AMOUNT, IOCODE, DATE_ 
         FROM {} WHERE STOCKREF > 0 ORDER BY LOGICALREF", stline_table
    );

    if let Ok(stm_stream) = mssql_client.simple_query(&stmove_query).await {
        if let Ok(stm_rows) = stm_stream.into_first_result().await {
            let total_stm = stm_rows.len();
            let _ = window.emit("sync-event", format!("{} adet stok hareketi bulundu. Aktarılıyor...", total_stm));
            
            for (idx, row) in stm_rows.iter().enumerate() {
                let stock_ref = row.get::<i32, usize>(0).unwrap_or(0);
                let source_index = row.get::<i16, usize>(1).unwrap_or(0) as i32;
                let amount = row.get::<f64, usize>(2).unwrap_or(0.0);
                let io_code = row.get::<i16, usize>(3).unwrap_or(0) as i32;
                let date = row.get::<chrono::NaiveDateTime, usize>(4).unwrap_or_else(|| chrono::NaiveDate::from_ymd_opt(2000, 1, 1).unwrap().and_hms_opt(0, 0, 0).unwrap());

                // io_type: 1: In, 2: Out. Logo IOCODE: 1,2,3... 
                // Typically: 1,2,3 are In, 4,5,6 are Out? Actually Logo is more complex.
                // Simple mapping: Odd is In, Even is Out? No.
                // Standard Logo: 1: Purchase (In), 2: Sales Return (In), 3: Sales (Out), 4: Purchase Return (Out)
                let io_type: i16 = if [1, 2, 5, 10, 11, 12, 13].contains(&io_code) { 1 } else { 2 };

                let insert_sql = format!(
                    "INSERT INTO {} (product_ref, store_id, amount, io_type, date)
                     SELECT $1, s.id, $2, $3, $4
                     FROM stores s
                     WHERE s.code = $5 AND s.firm_nr = $6
                     ON CONFLICT DO NOTHING", target_stock_moves_table // Note: stock_moves has no unique constraint in migration, but we can avoid duplicates if we add serial/ref_id later
                );

                pg_client.execute(&insert_sql, &[
                    &stock_ref,
                    &rust_decimal::Decimal::from_f64_retain(amount).unwrap_or_default(),
                    &io_type,
                    &date,
                    &source_index.to_string(),
                    &current_firm_nr
                ]).await.ok();

                if idx % 500 == 0 {
                    let _ = window.emit("sync-event", format!("Stok Hareketleri: {}/{}", idx, total_stm));
                }
            }
        }
    }

    // 12. Sync Sales Invoices (INVOICE & STLINE) - [Full History]
    let _ = window.emit("sync-event", "Satış Faturaları (INVOICE) senkronize ediliyor...");
    let invoice_table = format!("LG_{:03}_{:02}_INVOICE", firm_nr_int, period_nr_int);
    let target_sales_table = format!("rex_{}_{:02}_sales", current_firm_nr, period_nr_int);
    let target_sale_items_table = format!("rex_{}_{:02}_sale_items", current_firm_nr, period_nr_int);

    // Sync Headers
    let inv_query = format!(
        "SELECT LOGICALREF, FICHENO, CLIENTREF, SALESMANREF, NETTOTAL, VATAMOUNT, GROSSTOTAL, DATE_, TRCODE 
         FROM {} WHERE GRPCODE=2 AND TRCODE IN (7,8) ORDER BY LOGICALREF", invoice_table
    );

    if let Ok(inv_stream) = mssql_client.simple_query(&inv_query).await {
        if let Ok(inv_rows) = inv_stream.into_first_result().await {
            let total_inv = inv_rows.len();
            let _ = window.emit("sync-event", format!("{} adet satış faturası bulundu. İşleniyor...", total_inv));
            
            for (idx, row) in inv_rows.iter().enumerate() {
                let logicalref = row.get::<i32, usize>(0).unwrap_or(0);
                let fiche_no = row.get::<&str, usize>(1).unwrap_or("");
                let client_ref = row.get::<i32, usize>(2).unwrap_or(0);
                let slman_ref = row.get::<i32, usize>(3).unwrap_or(0);
                let net = row.get::<f64, usize>(4).unwrap_or(0.0);
                let vat = row.get::<f64, usize>(5).unwrap_or(0.0);
                let gross = row.get::<f64, usize>(6).unwrap_or(0.0);
                let date = row.get::<chrono::NaiveDateTime, usize>(7).unwrap_or_else(|| chrono::NaiveDate::from_ymd_opt(2000, 1, 1).unwrap().and_hms_opt(0, 0, 0).unwrap());
                let trcode = row.get::<i16, usize>(8).unwrap_or(0) as i32;

                let insert_sql = format!(
                    "INSERT INTO {} (ref_id, fiche_no, customer_ref, salesman_ref, total_net, total_vat, total_gross, date, trcode) 
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                     ON CONFLICT (fiche_no) DO NOTHING", target_sales_table
                );

                pg_client.execute(&insert_sql, &[
                    &logicalref, &fiche_no, &client_ref, &slman_ref, 
                    &rust_decimal::Decimal::from_f64_retain(net).unwrap_or_default(),
                    &rust_decimal::Decimal::from_f64_retain(vat).unwrap_or_default(),
                    &rust_decimal::Decimal::from_f64_retain(gross).unwrap_or_default(),
                    &date,
                    &trcode
                ]).await.ok();

                if idx % 50 == 0 {
                    let _ = window.emit("sync-event", format!("Faturalar: {}/{}", idx, total_inv));
                }
            }
        }
    }

    // Sync Lines
    let _ = window.emit("sync-event", "Fatura Satırları (STLINE) senkronize ediliyor...");
    let stl_query = format!(
        "SELECT L.LOGICALREF, L.INVOICEREF, L.STOCKREF, L.AMOUNT, L.PRICE, L.VAT, L.LINENET, L.VATAMNT, L.TOTAL \
         FROM {} L WITH(NOLOCK) \
         INNER JOIN {} I ON L.INVOICEREF = I.LOGICALREF \
         WHERE I.GRPCODE=2 AND I.TRCODE IN (7,8) ORDER BY L.LOGICALREF", stline_table, invoice_table
    );

    if let Ok(stl_stream) = mssql_client.simple_query(&stl_query).await {
        if let Ok(stl_rows) = stl_stream.into_first_result().await {
            let total_stl = stl_rows.len();
            let _ = window.emit("sync-event", format!("{} adet fatura satırı bulundu. Aktarılıyor...", total_stl));
            
            for (idx, row) in stl_rows.iter().enumerate() {
                let logicalref = row.get::<i32, usize>(0).unwrap_or(0);
                let inv_ref = row.get::<i32, usize>(1).unwrap_or(0);
                let stock_ref = row.get::<i32, usize>(2).unwrap_or(0);
                let amount = row.get::<f64, usize>(3).unwrap_or(0.0);
                let price = row.get::<f64, usize>(4).unwrap_or(0.0);
                let vat_rate = row.get::<f64, usize>(5).unwrap_or(20.0);
                let net = row.get::<f64, usize>(6).unwrap_or(0.0);
                let vat_amnt = row.get::<f64, usize>(7).unwrap_or(0.0);
                let total = row.get::<f64, usize>(8).unwrap_or(0.0);

                // Find local sale_id from parent ref_id
                let sale_id_row = pg_client.query_opt(
                    &format!("SELECT id FROM {} WHERE ref_id = $1", target_sales_table),
                    &[&inv_ref]
                ).await.ok().flatten();

                if let Some(r) = sale_id_row {
                    let sale_id: uuid::Uuid = r.get(0);
                    let insert_sql = format!(
                        "INSERT INTO {} (ref_id, sale_ref, product_ref, amount, price, vat_rate, total_net, total_vat, total_gross) 
                         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                         ON CONFLICT (ref_id) DO NOTHING", target_sale_items_table
                    );

                    pg_client.execute(&insert_sql, &[
                        &logicalref, &sale_id, &stock_ref,
                        &rust_decimal::Decimal::from_f64_retain(amount).unwrap_or_default(),
                        &rust_decimal::Decimal::from_f64_retain(price).unwrap_or_default(),
                        &rust_decimal::Decimal::from_f64_retain(vat_rate).unwrap_or_default(),
                        &rust_decimal::Decimal::from_f64_retain(net).unwrap_or_default(),
                        &rust_decimal::Decimal::from_f64_retain(vat_amnt).unwrap_or_default(),
                        &rust_decimal::Decimal::from_f64_retain(total).unwrap_or_default()
                    ]).await.ok();
                }

                if idx % 100 == 0 {
                    let _ = window.emit("sync-event", format!("Fatura Satırları: {}/{}", idx, total_stl));
                }
            }
        }
    }

    let _ = window.emit("sync-event", format!("Firma {} senkronizasyonu tamamlandı.", current_firm_nr));
}

    let _ = window.emit("sync-event", "✅ Tüm veri aktarımı başarıyla tamamlandı.");
    Ok("Firma, Dönem, Stok, Cari, Barkod, Fiyat ve Kasa verileri başarıyla senkronize edildi.".to_string())
}

