use crate::config::AppConfig;
use tauri::{command, Manager};
use tauri::path::BaseDirectory;
use tokio_postgres::NoTls;

pub use crate::db_utils::format_pg_error;

/// Windows/OS güncellemesi sonrası template1 collation uyumsuzluğunda CREATE DATABASE başarısız olur.
async fn refresh_template_collation_versions(client: &tokio_postgres::Client) {
    for db in ["postgres", "template1"] {
        if let Err(e) = client
            .batch_execute(&format!("ALTER DATABASE {} REFRESH COLLATION VERSION", db))
            .await
        {
            eprintln!(
                "Collation refresh uyarısı ({}): {}",
                db,
                format_pg_error(e)
            );
        }
    }
}

fn is_collation_version_mismatch(e: &tokio_postgres::Error) -> bool {
    if let Some(db_err) = e.as_db_error() {
        let msg = format!("{}", db_err);
        if msg.contains("collation version mismatch") {
            return true;
        }
        if db_err
            .detail()
            .is_some_and(|d| d.contains("collation version mismatch"))
        {
            return true;
        }
        if db_err
            .hint()
            .is_some_and(|h| h.contains("REFRESH COLLATION VERSION"))
        {
            return true;
        }
    }
    e.to_string().contains("collation version mismatch")
}

#[command]
pub async fn create_database(config: AppConfig, target: Option<String>) -> Result<(), String> {
    use tokio_postgres::NoTls;
    
    let is_remote = target.as_deref() == Some("remote");

    // Determine credentials and connection details based on target
    let (db_path, user, pass) = if is_remote {
        (&config.remote_db, &config.pg_remote_user, &config.pg_remote_pass)
    } else {
        (&config.local_db, &config.pg_local_user, &config.pg_local_pass)
    };

    println!("Creating database for target: {} ({})", if is_remote { "REMOTE" } else { "LOCAL" }, db_path);

    // 1. Connect to the 'postgres' system database
    // Format: host=localhost user=postgres password=... dbname=postgres
    let host_part = db_path.split(':').next().unwrap_or("localhost");
    
    // Check if we have a port
    let host_port_str = db_path.split('/').next().unwrap_or("localhost:5432");
    let port = if let Some(p) = host_port_str.split(':').nth(1) {
        p.parse::<u16>().unwrap_or(5432)
    } else {
        5432
    };

    println!("Connecting to postgres system db...");
    let mut pg_config = tokio_postgres::Config::new();
    pg_config.host(host_part)
             .port(port)
             .user(user)
             .password(pass)
             .dbname("postgres")
             .connect_timeout(std::time::Duration::from_secs(5));

    let (client, connection) = pg_config.connect(NoTls)
        .await
        .map_err(|e| format!("Sistem veritabanına bağlanılamadı ({}) [Host: {}, Port: {}, User: {}] : {}", 
            if is_remote { "Uzak" } else { "Yerel" }, host_part, port, user, e))?;

    tokio::spawn(async move {
        if let Err(e) = connection.await {
            eprintln!("connection error: {}", e);
        }
    });

    // 2. Extract target database name
    let db_name = db_path.split('/').last().ok_or("Veritabanı adı belirlenemedi.")?;

    // 3. Check if database exists
    let rows = client
        .query("SELECT 1 FROM pg_database WHERE datname = $1", &[&db_name])
        .await
        .map_err(|e| format!("Veritabanı kontrolü başarısız: {}", format_pg_error(e)))?;

    if rows.is_empty() {
        // 4. Create database (collation uyumsuzluğunda template1 yenile ve bir kez daha dene)
        let safe_db_name = db_name.replace("\"", "");

        refresh_template_collation_versions(&client).await;

        let create_sql = format!("CREATE DATABASE \"{}\"", safe_db_name);
        let create_result = client.execute(&create_sql, &[]).await;

        match create_result {
            Ok(_) => {
                println!("Database {} created successfully.", safe_db_name);
            }
            Err(e) if is_collation_version_mismatch(&e) => {
                eprintln!(
                    "Collation uyumsuzluğu algılandı; template veritabanları yenileniyor..."
                );
                refresh_template_collation_versions(&client).await;
                client
                    .execute(&create_sql, &[])
                    .await
                    .map_err(|e| format!("Veritabanı oluşturulamadı: {}", format_pg_error(e)))?;
                println!(
                    "Database {} created successfully (collation refresh sonrası).",
                    safe_db_name
                );
            }
            Err(e) => {
                return Err(format!(
                    "Veritabanı oluşturulamadı: {}",
                    format_pg_error(e)
                ));
            }
        }
    } else {
        println!("Database {} already exists.", db_name);
    }

    Ok(())
}

/// Wizard / migration runner ile aynı arama sırası (dev + Tauri resource).
pub fn resolve_migrations_dir(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let mut search_paths = Vec::new();
    search_paths.push(std::path::PathBuf::from("database/migrations"));
    search_paths.push(std::path::PathBuf::from("../database/migrations"));
    if let Ok(res) = app.path().resolve("database/migrations", BaseDirectory::Resource) {
        search_paths.push(res);
    }
    if let Ok(res) = app.path().resolve("_up_/database/migrations", BaseDirectory::Resource) {
        search_paths.push(res);
    }
    if let Ok(resource_dir) = app.path().resource_dir() {
        search_paths.push(resource_dir.join("database").join("migrations"));
        search_paths.push(resource_dir.join("migrations"));
        search_paths.push(resource_dir.join("_up_").join("database").join("migrations"));
    }

    let mut attempted_paths = Vec::new();
    for path in search_paths {
        attempted_paths.push(path.to_string_lossy().to_string());
        if path.exists() && path.is_dir() {
            println!("Migration directory found: {:?}", path);
            if let Ok(entries) = std::fs::read_dir(&path) {
                let count = entries.filter_map(|e| e.ok()).count();
                println!("Total files in migration directory: {}", count);
            }
            return Ok(path);
        }
    }
    Err(format!(
        "Migration klasörü bulunamadı!\nDenenen yollar:\n{}",
        attempted_paths.join("\n")
    ))
}

const EMBEDDED_060_ENSURE_FIRM_PERIOD_ENGINE: &str =
    include_str!("../../database/migrations/060_ensure_create_firm_period_engine.sql");

/// Tüm aday migration klasörlerinde 060 dosyasını arar.
fn resolve_060_migration_sql(app: &tauri::AppHandle) -> Result<String, String> {
    let file_name = "060_ensure_create_firm_period_engine.sql";
    let mut search_paths = Vec::new();
    search_paths.push(std::path::PathBuf::from("database/migrations"));
    search_paths.push(std::path::PathBuf::from("../database/migrations"));
    if let Ok(res) = app.path().resolve("database/migrations", BaseDirectory::Resource) {
        search_paths.push(res);
    }
    if let Ok(res) = app.path().resolve("_up_/database/migrations", BaseDirectory::Resource) {
        search_paths.push(res);
    }
    if let Ok(resource_dir) = app.path().resource_dir() {
        search_paths.push(resource_dir.join("database").join("migrations"));
        search_paths.push(resource_dir.join("migrations"));
        search_paths.push(resource_dir.join("_up_").join("database").join("migrations"));
    }

    let mut attempted_paths = Vec::new();
    for dir in search_paths {
        let path = dir.join(file_name);
        attempted_paths.push(path.to_string_lossy().to_string());
        if path.exists() {
            let raw_sql = std::fs::read_to_string(&path)
                .map_err(|e| format!("060 migration okunamadı ({}): {}", path.display(), e))?;
            return Ok(raw_sql);
        }
    }

    println!(
        "060 migration dosyası bulunamadı; gömülü SQL kullanılıyor. Denenen yollar:\n{}",
        attempted_paths.join("\n")
    );
    Ok(EMBEDDED_060_ENSURE_FIRM_PERIOD_ENGINE.to_string())
}

const EMBEDDED_079_ENSURE_APPLY_SYNC_TRIGGERS: &str =
    include_str!("../../database/migrations/079_ensure_apply_sync_triggers.sql");

/// Sync kuyruğu ve trigger fonksiyonlarını hazırlar; 081 ile olası sonsuz dongu duzeltmesi her zaman uygulanir.
async fn ensure_apply_sync_triggers(
    client: &tokio_postgres::Client,
    app: &tauri::AppHandle,
) -> Result<(), String> {
    const EMBEDDED_081: &str =
        include_str!("../../database/migrations/081_fix_apply_sync_triggers_recursion.sql");

    let enqueue_exists = client
        .query(
            "SELECT 1 FROM pg_proc p
             JOIN pg_namespace n ON p.pronamespace = n.oid
             WHERE n.nspname = 'public' AND p.proname = 'enqueue_sync_event'
             LIMIT 1",
            &[],
        )
        .await
        .map_err(|e| format!("Sync trigger fonksiyon kontrolü başarısız: {}", format_pg_error(e)))?;

    if enqueue_exists.is_empty() {
        let file_name = "079_ensure_apply_sync_triggers.sql";
        let mut search_paths = Vec::new();
        search_paths.push(std::path::PathBuf::from("database/migrations"));
        search_paths.push(std::path::PathBuf::from("../database/migrations"));
        if let Ok(res) = app.path().resolve("database/migrations", BaseDirectory::Resource) {
            search_paths.push(res);
        }
        if let Ok(res) = app.path().resolve("_up_/database/migrations", BaseDirectory::Resource) {
            search_paths.push(res);
        }
        if let Ok(resource_dir) = app.path().resource_dir() {
            search_paths.push(resource_dir.join("database").join("migrations"));
            search_paths.push(resource_dir.join("migrations"));
            search_paths.push(resource_dir.join("_up_").join("database").join("migrations"));
        }

        let raw_sql = {
            let mut found: Option<String> = None;
            for dir in &search_paths {
                let path = dir.join(file_name);
                if path.exists() {
                    found = Some(std::fs::read_to_string(&path).map_err(|e| {
                        format!("079 migration okunamadı ({}): {}", path.display(), e)
                    })?);
                    break;
                }
            }
            found.unwrap_or_else(|| EMBEDDED_079_ENSURE_APPLY_SYNC_TRIGGERS.to_string())
        };

        let sql = crate::sql_migration_split::strip_utf8_bom(&raw_sql);
        let statements = crate::sql_migration_split::split_postgres_statements(sql);

        for (idx, stmt) in statements.iter().enumerate() {
            if stmt.trim().is_empty() {
                continue;
            }
            if let Err(e) = client.batch_execute(stmt).await {
                return Err(format!(
                    "079 migration ifade {}/{}: {}",
                    idx + 1,
                    statements.len(),
                    format_pg_error(e)
                ));
            }
        }
    }

    // Her zaman: APPLY_SYNC_TRIGGERS wrapper'i apply_sync_triggers uzerine yazmis olabilir (54001).
    let fix_paths = [
        "database/migrations/081_fix_apply_sync_triggers_recursion.sql",
        "../database/migrations/081_fix_apply_sync_triggers_recursion.sql",
    ];
    let mut fix_sql = EMBEDDED_081.to_string();
    for rel in fix_paths {
        let path = std::path::PathBuf::from(rel);
        if path.exists() {
            fix_sql = std::fs::read_to_string(&path)
                .map_err(|e| format!("081 migration okunamadı ({}): {}", path.display(), e))?;
            break;
        }
    }
    if let Ok(res) = app.path().resolve(
        "database/migrations/081_fix_apply_sync_triggers_recursion.sql",
        BaseDirectory::Resource,
    ) {
        if res.exists() {
            fix_sql = std::fs::read_to_string(&res)
                .map_err(|e| format!("081 migration okunamadı ({}): {}", res.display(), e))?;
        }
    }

    let sql = crate::sql_migration_split::strip_utf8_bom(&fix_sql);
    let statements = crate::sql_migration_split::split_postgres_statements(sql);
    for (idx, stmt) in statements.iter().enumerate() {
        if stmt.trim().is_empty() {
            continue;
        }
        if let Err(e) = client.batch_execute(stmt).await {
            return Err(format!(
                "081 sync trigger fix ifade {}/{}: {}",
                idx + 1,
                statements.len(),
                format_pg_error(e)
            ));
        }
    }

    Ok(())
}

const EMBEDDED_080_FIX_CREATE_PERIOD_TABLES: &str =
    include_str!("../../database/migrations/080_fix_create_period_tables_jsonb.sql");

/// CREATE_PERIOD_TABLES fonksiyonunu güncel (JSONB kaçış düzeltmeli) sürümle değiştirir.
async fn ensure_create_period_tables_fixed(
    client: &tokio_postgres::Client,
    app: &tauri::AppHandle,
) -> Result<(), String> {
    let file_name = "080_fix_create_period_tables_jsonb.sql";
    let mut search_paths = Vec::new();
    search_paths.push(std::path::PathBuf::from("database/migrations"));
    search_paths.push(std::path::PathBuf::from("../database/migrations"));
    if let Ok(res) = app.path().resolve("database/migrations", BaseDirectory::Resource) {
        search_paths.push(res);
    }
    if let Ok(res) = app.path().resolve("_up_/database/migrations", BaseDirectory::Resource) {
        search_paths.push(res);
    }
    if let Ok(resource_dir) = app.path().resource_dir() {
        search_paths.push(resource_dir.join("database").join("migrations"));
        search_paths.push(resource_dir.join("migrations"));
        search_paths.push(resource_dir.join("_up_").join("database").join("migrations"));
    }

    let raw_sql = {
        let mut found: Option<String> = None;
        for dir in &search_paths {
            let path = dir.join(file_name);
            if path.exists() {
                found = Some(std::fs::read_to_string(&path).map_err(|e| {
                    format!("080 migration okunamadı ({}): {}", path.display(), e)
                })?);
                break;
            }
        }
        found.unwrap_or_else(|| EMBEDDED_080_FIX_CREATE_PERIOD_TABLES.to_string())
    };

    let sql = crate::sql_migration_split::strip_utf8_bom(&raw_sql);
    let statements = crate::sql_migration_split::split_postgres_statements(sql);

    for (idx, stmt) in statements.iter().enumerate() {
        if stmt.trim().is_empty() {
            continue;
        }
        if let Err(e) = client.batch_execute(stmt).await {
            return Err(format!(
                "080 CREATE_PERIOD_TABLES ifade {}/{}: {}",
                idx + 1,
                statements.len(),
                format_pg_error(e)
            ));
        }
    }

    Ok(())
}

const EMBEDDED_082_WMS_TRANSFERS: &str =
    include_str!("../../database/migrations/082_wms_transfers_firm_nr_columns.sql");

/// wms.transfers firm_nr / source_store_id kolonlarini eski kurulumlarda tamamlar.
async fn ensure_wms_transfers_columns(
    client: &tokio_postgres::Client,
    app: &tauri::AppHandle,
) -> Result<(), String> {
    let file_name = "082_wms_transfers_firm_nr_columns.sql";
    let mut search_paths = Vec::new();
    search_paths.push(std::path::PathBuf::from("database/migrations"));
    search_paths.push(std::path::PathBuf::from("../database/migrations"));
    if let Ok(res) = app.path().resolve("database/migrations", BaseDirectory::Resource) {
        search_paths.push(res);
    }
    if let Ok(res) = app.path().resolve("_up_/database/migrations", BaseDirectory::Resource) {
        search_paths.push(res);
    }
    if let Ok(resource_dir) = app.path().resource_dir() {
        search_paths.push(resource_dir.join("database").join("migrations"));
        search_paths.push(resource_dir.join("migrations"));
        search_paths.push(resource_dir.join("_up_").join("database").join("migrations"));
    }

    let raw_sql = {
        let mut found: Option<String> = None;
        for dir in &search_paths {
            let path = dir.join(file_name);
            if path.exists() {
                found = Some(std::fs::read_to_string(&path).map_err(|e| {
                    format!("082 migration okunamadı ({}): {}", path.display(), e)
                })?);
                break;
            }
        }
        found.unwrap_or_else(|| EMBEDDED_082_WMS_TRANSFERS.to_string())
    };

    let sql = crate::sql_migration_split::strip_utf8_bom(&raw_sql);
    let statements = crate::sql_migration_split::split_postgres_statements(sql);

    for (idx, stmt) in statements.iter().enumerate() {
        if stmt.trim().is_empty() {
            continue;
        }
        if let Err(e) = client.batch_execute(stmt).await {
            return Err(format!(
                "082 wms.transfers ifade {}/{}: {}",
                idx + 1,
                statements.len(),
                format_pg_error(e)
            ));
        }
    }

    Ok(())
}

/// CREATE_FIRM_TABLES / CREATE_PERIOD_TABLES yoksa 060 migration dosyasını uygular.
async fn ensure_firm_period_engine(
    client: &tokio_postgres::Client,
    app: &tauri::AppHandle,
) -> Result<(), String> {
    let rows = client
        .query(
            "SELECT 1 FROM pg_proc p
             JOIN pg_namespace n ON p.pronamespace = n.oid
             WHERE n.nspname = 'public' AND p.proname = 'create_firm_tables'
             LIMIT 1",
            &[],
        )
        .await
        .map_err(|e| format!("Fonksiyon kontrolü başarısız: {}", format_pg_error(e)))?;

    if !rows.is_empty() {
        return Ok(());
    }

    let raw_sql = resolve_060_migration_sql(app)?;
    let sql = crate::sql_migration_split::strip_utf8_bom(&raw_sql);
    let statements = crate::sql_migration_split::split_postgres_statements(sql);

    for (idx, stmt) in statements.iter().enumerate() {
        if stmt.trim().is_empty() {
            continue;
        }
        if let Err(e) = client.batch_execute(stmt).await {
            return Err(format!(
                "060 migration ifade {}/{}: {}",
                idx + 1,
                statements.len(),
                format_pg_error(e)
            ));
        }
    }

    Ok(())
}

pub async fn apply_migrations_internal(
    app: &tauri::AppHandle, 
    config: &AppConfig, 
    target: Option<String>,
    load_demo_data: Option<bool>,
    app_version: String
) -> Result<String, String> {
    use tokio_postgres::NoTls;
    
    let is_remote = target.as_deref() == Some("remote");

    // 1. Determine Target Connection Details
    let (db_path, user, pass) = if is_remote {
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

    let mut pg_config = tokio_postgres::Config::new();
    pg_config.host(host_part)
             .port(port)
             .user(user)
             .password(pass)
             .dbname(db_name)
             .connect_timeout(std::time::Duration::from_secs(10));

    let (client, connection) = pg_config.connect(NoTls)
        .await
        .map_err(|e| format!("Migration DB ({}) Bağlantı Hatası [{}]: {}", if is_remote { "Uzak" } else { "Yerel" }, db_name, format_pg_error(e)))?;

    tokio::spawn(async move {
        if let Err(e) = connection.await {
            eprintln!("connection error: {}", e);
        }
    });

    // 2. Create sys_migrations table
    client.execute(
        "CREATE TABLE IF NOT EXISTS sys_migrations (
            id SERIAL PRIMARY KEY,
            version VARCHAR(50) NOT NULL,
            name VARCHAR(255) NOT NULL UNIQUE,
            applied_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            app_version VARCHAR(50)
        )", 
        &[]
    ).await.map_err(|e| format!("sys_migrations tablosu oluşturulamadı: {}", format_pg_error(e)))?;

    // 2a. Ensure 'name' is unique and drop unique constraint on 'version' if it exists
    // This allows multiple files with same prefix (e.g. 027_...)
    let _ = client.execute(
        "ALTER TABLE sys_migrations DROP CONSTRAINT IF EXISTS sys_migrations_version_key",
        &[]
    ).await;
    
    let _ = client.execute(
        "ALTER TABLE sys_migrations ADD CONSTRAINT sys_migrations_name_key UNIQUE (name)",
        &[]
    ).await;

    // 2b. Add app_version column if missing (for existing installations)
    client.execute(
        "ALTER TABLE sys_migrations ADD COLUMN IF NOT EXISTS app_version VARCHAR(50)",
        &[]
    ).await.map_err(|e| format!("sys_migrations tablosuna app_version kolonu eklenemedi: {}", e))?;

    // 2c. Pre-create auth schema so migration scripts that reference auth.users
    //     don't fail on a fresh DB. UUID: gen_random_uuid() (PG13+, contrib gerekmez).
    let _ = client.batch_execute("
        CREATE SCHEMA IF NOT EXISTS auth;
        CREATE SCHEMA IF NOT EXISTS rest;
        CREATE SCHEMA IF NOT EXISTS beauty;
        CREATE TABLE IF NOT EXISTS auth.users (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            email VARCHAR(255) UNIQUE,
            encrypted_password VARCHAR(255),
            raw_user_meta_data JSONB,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
        );
    ").await;

    // 3. Find Migration Files
    let migration_dir = resolve_migrations_dir(app)?;

    let mut migration_files = Vec::new();
    let entries = std::fs::read_dir(&migration_dir).map_err(|e| e.to_string())?;
    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if path.extension().and_then(|s| s.to_str()) == Some("sql") {
            let filename = path.file_name().and_then(|s| s.to_str()).unwrap_or("").to_string();
            if let Some(version_part) = filename.split('_').next() {
                if version_part.chars().all(|c| c.is_ascii_digit()) && !version_part.is_empty() {
                    migration_files.push((version_part.to_string(), filename, path));
                }
            }
        }
    }

    // Sort by full filename (e.g. 001_schema.sql < 003_auth_setup.sql < 004_auth_patch.sql)
    // This prevents ordering ambiguity when multiple files share the same numeric prefix.
    migration_files.sort_by(|a, b| a.1.cmp(&b.1));

    println!("Detected {} valid numbered migration files.", migration_files.len());

    // 4. Apply Pending Migrations
    #[derive(serde::Serialize)]
    struct MigrationStatus {
        name: String,
        status: String, // "Applied", "Already Applied", "Error", "Demo Skipped"
        error: Option<String>,
    }

    let mut report: Vec<MigrationStatus> = Vec::new();
    let mut applied_count = 0;
    
    for (version, name, path) in migration_files {
        // Check if applied by NAME (filename)
        let rows = client.query("SELECT 1 FROM sys_migrations WHERE name = $1", &[&name])
            .await
            .map_err(|e| format!("Migration kontrol hatası ({}): {}", name, e))?;

        if rows.is_empty() {
            // İsteğe bağlı demo seed: 001_demo_data.sql vb. (*_demo_data.sql). Eski kod yanlışlıkla yalnızca 006_demo_data.sql'yi kontrol ediyordu.
            // load_demo_data yalnızca kurulumda "Demo bilgileri yükle" ile Some(true) gelir; aksi halde atlanır.
            let is_demo_seed_migration = name.ends_with("_demo_data.sql");
            if is_demo_seed_migration && load_demo_data != Some(true) {
                report.push(MigrationStatus {
                    name: name.clone(),
                    status: "Demo Skipped".to_string(),
                    error: None,
                });
                continue;
            }

            if !path.exists() {
                report.push(MigrationStatus {
                    name: name.clone(),
                    status: "Error".to_string(),
                    error: Some("Dosya sistemde bulunamadı".to_string()),
                });
                continue;
            }

            println!("Applying migration: {}", name);
            let raw_sql = match std::fs::read_to_string(&path) {
                Ok(s) => s,
                Err(e) => {
                    report.push(MigrationStatus {
                        name: name.clone(),
                        status: "Error".to_string(),
                        error: Some(format!("Dosya okunamadı: {}", e)),
                    });
                    continue;
                }
            };
            
            // UTF-8 BOM + tek dev batch_execute yerine ifade-ifade: uzun script / PG 15 ile
            // daha iyi hata ayiklama ve "db error" yerine dogru satir mesaji.
            let sql = crate::sql_migration_split::strip_utf8_bom(&raw_sql);
            let statements = crate::sql_migration_split::split_postgres_statements(sql);
            let total_st = statements.len();
            let mut migration_err: Option<String> = None;

            if let Err(e) = client.batch_execute("BEGIN").await {
                migration_err = Some(format!("BEGIN basarisiz: {}", format_pg_error(e)));
            }

            if migration_err.is_none() {
                for (idx, stmt) in statements.iter().enumerate() {
                    if stmt.trim().is_empty() {
                        continue;
                    }
                    if let Err(e) = client.batch_execute(stmt).await {
                        let err_msg = format_pg_error(e);
                        let head: String =
                            stmt.chars().take(200).collect::<String>().replace('\n', " ");
                        migration_err = Some(format!(
                            "{} | Ifade {}/{} (baslangic): {}",
                            err_msg,
                            idx + 1,
                            total_st,
                            head
                        ));
                        println!(
                            "❌ Migration hatası ({}), ifade {}/{}: {}",
                            name,
                            idx + 1,
                            total_st,
                            err_msg
                        );
                        let _ = client.batch_execute("ROLLBACK").await;
                        break;
                    }
                }
            }

            if migration_err.is_none() {
                if let Err(e) = client.batch_execute("COMMIT").await {
                    migration_err = Some(format!("COMMIT basarisiz: {}", format_pg_error(e)));
                    let _ = client.batch_execute("ROLLBACK").await;
                }
            }

            if let Some(err_msg) = migration_err {
                report.push(MigrationStatus {
                    name: name.clone(),
                    status: "Error".to_string(),
                    error: Some(err_msg),
                });
                continue;
            }
            
            // Record migration
            if let Err(e) = client.execute(
                "INSERT INTO sys_migrations (version, name, app_version) VALUES ($1, $2, $3)",
                &[&version, &name, &app_version]
            ).await {
                println!("⚠️ Migration kayıt hatası ({}): {}", name, e);
            }
            
            applied_count += 1;
            report.push(MigrationStatus {
                name: name.clone(),
                status: "Applied".to_string(),
                error: None,
            });
        } else {
            report.push(MigrationStatus {
                name: name.clone(),
                status: "Already Applied".to_string(),
                error: None,
            });
        }
    }

    let json_report = serde_json::to_string_pretty(&report).unwrap_or_else(|_| format!("{} dosya işlendi (JSON hatası)", applied_count));

    // Persistent Audit: Save to disk for transparency
    let log_dir = crate::config::get_logs_dir();
    if let Err(e) = std::fs::create_dir_all(&log_dir) {
        println!("⚠️ Log dizini oluşturulamadı: {}", e);
    } else {
        let log_file = log_dir.join("migration_log.json");
        if let Err(e) = std::fs::write(&log_file, &json_report) {
            println!("⚠️ Log dosyası yazılamadı: {}", e);
        } else {
            println!("✅ Migration logları kaydedildi: {:?}", log_file);
        }
    }

    match crate::schema_gap::diagnose_schema_gaps(&client, &migration_dir).await {
        Ok(rep) => {
            crate::schema_gap::write_schema_gap_log(&rep);
            if !rep.eksik_kolonlar.is_empty() {
                println!(
                    "⚠️ Şema: {} eksik kolon (schema_gaps.json, sql_toplu)",
                    rep.eksik_kolonlar.len()
                );
            }
        }
        Err(e) => println!("⚠️ Şema gap tanılama atlandı: {}", e),
    }

    Ok(json_report)
}

/// Migration klasöründeki ADD COLUMN beklentileri ile DB'yi karşılaştırır; `schema_gaps.json` yazar.
#[command]
pub async fn diagnose_schema_gaps_cmd(
    app: tauri::AppHandle,
    config: AppConfig,
    target: Option<String>,
) -> Result<serde_json::Value, String> {
    use tokio_postgres::NoTls;
    let migration_dir = resolve_migrations_dir(&app)?;
    let is_remote = target.as_deref() == Some("remote");
    let (db_path, user, pass) = if is_remote {
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
    let mut pg_config = tokio_postgres::Config::new();
    pg_config
        .host(host_part)
        .port(port)
        .user(user)
        .password(pass)
        .dbname(db_name)
        .connect_timeout(std::time::Duration::from_secs(10));
    let (client, connection) = pg_config
        .connect(NoTls)
        .await
        .map_err(|e| format!("DB bağlantısı: {}", format_pg_error(e)))?;
    tokio::spawn(async move {
        let _ = connection.await;
    });
    let report = crate::schema_gap::diagnose_schema_gaps(&client, &migration_dir).await?;
    crate::schema_gap::write_schema_gap_log(&report);
    serde_json::to_value(&report).map_err(|e| e.to_string())
}

#[command]
pub async fn open_migration_log() -> Result<(), String> {
    let log_path = crate::config::get_logs_dir().join("migration_log.json");
    if log_path.exists() {
        #[cfg(target_os = "windows")]
        {
            use std::process::Command;
            Command::new("explorer")
                .arg(&log_path)
                .spawn()
                .map_err(|e| format!("Dosya açılamadı: {}", e))?;
        }
        Ok(())
    } else {
        Err("Migration log dosyası bulunamadı.".to_string())
    }
}

#[command]
pub async fn run_migrations(
    app: tauri::AppHandle, 
    config: AppConfig, 
    target: Option<String>,
    load_demo_data: Option<bool>
) -> Result<String, String> {
    let app_version = app.package_info().version.to_string();
    apply_migrations_internal(&app, &config, target, load_demo_data, app_version).await
}

#[command]
pub async fn get_db_version(config: AppConfig, target: Option<String>) -> Result<serde_json::Value, String> {
    use tokio_postgres::NoTls;
    
    let is_remote = target.as_deref() == Some("remote");

    let (db_path, user, pass) = if is_remote {
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

    let mut pg_config = tokio_postgres::Config::new();
    pg_config.host(host_part)
             .port(port)
             .user(user)
             .password(pass)
             .dbname(db_name)
             .connect_timeout(std::time::Duration::from_secs(5));

    let (client, connection) = pg_config.connect(NoTls)
        .await
        .map_err(|e| format!("Bağlantı Hatası [{}]: {}", db_name, format_pg_error(e)))?;

    tokio::spawn(async move {
        if let Err(e) = connection.await {
            eprintln!("connection error: {}", e);
        }
    });

    // Check if table exists first
    let table_exists = client.query("SELECT 1 FROM information_schema.tables WHERE table_name = 'sys_migrations'", &[])
        .await
        .map_err(|e| format_pg_error(e))?
        .len() > 0;

    if !table_exists {
         return Ok(serde_json::json!({
             "migration_version": "000",
             "app_version": "0.0.0",
             "status": "NO_MIGRATIONS"
         }));
    }

    let rows = client.query(
        "SELECT version, app_version, applied_at FROM sys_migrations ORDER BY version DESC LIMIT 1", 
        &[]
    ).await.map_err(|e| format_pg_error(e))?;

    if let Some(row) = rows.first() {
        let version: String = row.get("version");
        let app_version: Option<String> = row.try_get("app_version").ok();
        Ok(serde_json::json!({
            "migration_version": version,
            "app_version": app_version.unwrap_or("unknown".to_string()),
            "status": "OK"
        }))
    } else {
        Ok(serde_json::json!({
            "migration_version": "000",
            "app_version": "0.0.0",
            "status": "EMPTY"
        }))
    }
}

#[command]
pub async fn init_firm_schema(
    app: tauri::AppHandle,
    config: AppConfig,
    firm_nr: String,
    target: Option<String>,
) -> Result<String, String> {
    use tokio_postgres::NoTls;

    let is_remote = target.as_deref() == Some("remote");

    let (db_path, user, pass) = if is_remote {
        (&config.remote_db, &config.pg_remote_user, &config.pg_remote_pass)
    } else {
        (&config.local_db, &config.pg_local_user, &config.pg_local_pass)
    };

    let host_part = db_path.split(':').next().unwrap_or("localhost");
    let db_name = db_path.split('/').last().unwrap_or("retailex_local");

    let mut pg_config = tokio_postgres::Config::new();
    pg_config.host(host_part)
             .port(5432)
             .user(user)
             .password(pass)
             .dbname(db_name)
             .connect_timeout(std::time::Duration::from_secs(5));

    let (client, connection) = pg_config.connect(NoTls)
        .await
        .map_err(|e| format!("Bağlantı Hatası [{}]: {}", db_name, format_pg_error(e)))?;

    tokio::spawn(async move {
        if let Err(e) = connection.await {
            eprintln!("connection error: {}", e);
        }
    });

    ensure_firm_period_engine(&client, &app).await?;
    ensure_apply_sync_triggers(&client, &app).await?;
    ensure_wms_transfers_columns(&client, &app).await?;
    client
        .execute("SELECT public.create_firm_tables($1::varchar)", &[&firm_nr])
        .await
        .map_err(|e| format!("Firma tabloları oluşturulamadı: {}", format_pg_error(e)))?;

    Ok(format!("Firma {} için kart tabloları hazırlandı.", firm_nr))
}

#[command]
pub async fn init_period_schema(
    app: tauri::AppHandle,
    config: AppConfig,
    firm_nr: String,
    period_nr: String,
    target: Option<String>,
) -> Result<String, String> {
    use tokio_postgres::NoTls;

    let is_remote = target.as_deref() == Some("remote");

    let (db_path, user, pass) = if is_remote {
        (&config.remote_db, &config.pg_remote_user, &config.pg_remote_pass)
    } else {
        (&config.local_db, &config.pg_local_user, &config.pg_local_pass)
    };

    let host_part = db_path.split(':').next().unwrap_or("localhost");
    let db_name = db_path.split('/').last().unwrap_or("retailex_local");

    let mut pg_config = tokio_postgres::Config::new();
    pg_config.host(host_part)
             .port(5432)
             .user(user)
             .password(pass)
             .dbname(db_name)
             .connect_timeout(std::time::Duration::from_secs(5));

    let (client, connection) = pg_config.connect(NoTls)
        .await
        .map_err(|e| format!("Bağlantı Hatası [{}]: {}", db_name, format_pg_error(e)))?;

    tokio::spawn(async move {
        if let Err(e) = connection.await {
            eprintln!("connection error: {}", e);
        }
    });

    ensure_firm_period_engine(&client, &app).await?;
    ensure_apply_sync_triggers(&client, &app).await?;
    ensure_create_period_tables_fixed(&client, &app).await?;
    ensure_wms_transfers_columns(&client, &app).await?;
    client
        .execute(
            "SELECT public.create_period_tables($1::varchar, $2::varchar)",
            &[&firm_nr, &period_nr],
        )
        .await
        .map_err(|e| format!("Dönem tabloları oluşturulamadı: {}", format_pg_error(e)))?;

    Ok(format!("Firma {}, Dönem {} için hareket tabloları hazırlandı.", firm_nr, period_nr))
}
#[command]
pub async fn check_db_status(config: AppConfig) -> Result<String, String> {
    use tokio_postgres::NoTls;
    use std::net::TcpStream;
    use std::time::Duration;

    let host_part = config.local_db.split(':').next().unwrap_or("localhost");
    let host_port_str = config.local_db.split('/').next().unwrap_or("localhost:5432");
    let port = if let Some(p) = host_port_str.split(':').nth(1) {
        p.parse::<u16>().unwrap_or(5432)
    } else {
        5432
    };

    // 1. Check if port is open at all - Support hostnames like 'localhost'
    use std::net::ToSocketAddrs;
    let addr = format!("{}:{}", host_part, port);
    let is_reachable = addr.to_socket_addrs()
        .map(|mut addrs| addrs.any(|a| TcpStream::connect_timeout(&a, Duration::from_millis(500)).is_ok()))
        .unwrap_or(false);

    if !is_reachable {
        return Ok("NOT_FOUND".to_string());
    }

    // 2. Try to connect with credentials
    let mut pg_config = tokio_postgres::Config::new();
    pg_config.host(host_part)
             .port(port)
             .user(&config.pg_local_user)
             .password(&config.pg_local_pass)
             .dbname("postgres")
             .connect_timeout(std::time::Duration::from_millis(1500));

    match pg_config.connect(NoTls).await {
        Ok(_) => Ok("RUNNING".to_string()),
        Err(e) => {
            let err_str = e.to_string();
            if err_str.contains("password authentication failed") {
                Ok("AUTH_FAILED".to_string())
            } else {
                Ok(format!("ERROR [{}]: {}", host_part, err_str))
            }
        }
    }
}
#[command]
pub async fn pg_execute_supabase_dump(
    host: String,
    port: u16,
    user: String,
    pass: String,
    db_name: String,
    file_path: String
) -> Result<String, String> {
    use std::fs::File;
    use std::io::{BufRead, BufReader};
    use tokio_postgres::NoTls;

    let mut pg_config = tokio_postgres::Config::new();
    pg_config.host(&host)
             .port(port)
             .user(&user)
             .password(&pass)
             .dbname(&db_name)
             .connect_timeout(std::time::Duration::from_secs(10));
    
    let file = File::open(&file_path).map_err(|e| format!("Dosya açılamadı: {}", e))?;
    let reader = BufReader::new(file);

    let mut current_stmt = String::new();
    let mut current_batch = String::with_capacity(512 * 1024); // 500KB chunks
    let mut stmt_count = 0;
    
    let (client, connection) = pg_config.connect(NoTls)
        .await
        .map_err(|e| format!("Veritabanı bağlantı hatası [{}]: {}", db_name, e))?;

    tokio::spawn(async move {
        if let Err(e) = connection.await {
            eprintln!("connection error: {}", e);
        }
    });

    for line_res in reader.lines() {
        let line = line_res.map_err(|e| format!("Okuma hatası: {}", e))?;
        
        current_stmt.push_str(&line);
        current_stmt.push('\n');

        let trimmed_line = line.trim();
        // Assume statement ends if line ends with ';' and we're not inside dollar quotes (simplification)
        if trimmed_line.ends_with(';') && !trimmed_line.starts_with("--") {
            let l = current_stmt.trim().to_lowercase();
            
            // Normalize whitespace to single spaces for easier matching
            let normalized_stmt = l.replace('\n', " ").replace('\r', " ");
            let normalized_stmt = normalized_stmt.split_whitespace().collect::<Vec<&str>>().join(" ");
            
            let is_supabase_internal = ["auth.", "storage.", "realtime.", "vault.", "supabase_"].iter().any(|s| {
                normalized_stmt.starts_with(&format!("create table if not exists {}", s)) ||
                normalized_stmt.starts_with(&format!("create table {}", s)) ||
                normalized_stmt.starts_with(&format!("create schema if not exists {}", s)) ||
                normalized_stmt.starts_with(&format!("create schema {}", s)) ||
                normalized_stmt.starts_with(&format!("alter table if exists {}", s)) ||
                normalized_stmt.starts_with(&format!("alter table {}", s)) ||
                normalized_stmt.starts_with(&format!("insert into {}", s)) ||
                normalized_stmt.starts_with(&format!("create sequence if not exists {}", s)) ||
                normalized_stmt.starts_with(&format!("create sequence {}", s)) ||
                normalized_stmt.starts_with(&format!("alter sequence if exists {}", s)) ||
                normalized_stmt.starts_with(&format!("alter sequence {}", s)) ||
                normalized_stmt.starts_with(&format!("create or replace function {}", s)) ||
                normalized_stmt.starts_with(&format!("create function {}", s)) ||
                (normalized_stmt.starts_with("create trigger ") && normalized_stmt.contains(&format!(" on {}", s))) ||
                (normalized_stmt.starts_with("drop trigger if exists ") && normalized_stmt.contains(&format!(" on {}", s)))
            });

            // Safely skip complete statements that we don't need or want to avoid breaking local setups
            let skip_statement = l.starts_with("create extension") ||
               l.starts_with("comment on ") ||
               l.starts_with("create policy") ||
               (l.starts_with("alter table") && l.contains("enable row level security")) ||
               l.starts_with("grant ") ||
               l.starts_with("revoke ") ||
               l.starts_with("create publication") ||
               is_supabase_internal;
               
            if !skip_statement && !l.is_empty() {
                let mut processed_stmt = current_stmt.clone();
                if l.contains("array") {
                     processed_stmt = processed_stmt.replace(" ARRAY NOT NULL", " text[] NOT NULL")
                                         .replace(" ARRAY DEFAULT", " text[] DEFAULT")
                                         .replace(" ARRAY NULL", " text[] NULL");
                     
                     processed_stmt = processed_stmt.replace(" array not null", " text[] not null")
                                         .replace(" array default", " text[] default")
                                         .replace(" array null", " text[] null");
                }
                
                // Convert missing nextval() sequences into auto-managed SERIAL pseudo-types
                let sequence_patterns = [
                    ("integer NOT NULL DEFAULT nextval('", "SERIAL"),
                    ("bigint NOT NULL DEFAULT nextval('", "BIGSERIAL"),
                    ("smallint NOT NULL DEFAULT nextval('", "SMALLSERIAL"),
                    ("integer DEFAULT nextval('", "SERIAL"),
                    ("bigint DEFAULT nextval('", "BIGSERIAL"),
                    ("smallint DEFAULT nextval('", "SMALLSERIAL"),
                ];

                // Fix missing custom ENUMs
                processed_stmt = processed_stmt.replace("\"evaluation_type\" evaluation_type", "\"evaluation_type\" character varying");
                processed_stmt = processed_stmt.replace("'individual'::evaluation_type", "'individual'::character varying");
                processed_stmt = processed_stmt.replace("'department'::evaluation_type", "'department'::character varying");

                // Replace uuid_generate_v4() with natively built-in gen_random_uuid() to bypass skipped uuid-ossp extension
                processed_stmt = processed_stmt.replace("uuid_generate_v4()", "gen_random_uuid()");

                for (prefix, replacement) in sequence_patterns.iter() {
                    while let Some(start_idx) = processed_stmt.find(prefix) {
                        if let Some(close_paren) = processed_stmt[start_idx..].find(")") {
                            let end_idx = start_idx + close_paren + 1;
                            // check for trailing comma if we need to remove it? No, the line has comma after the )
                            processed_stmt.replace_range(start_idx..end_idx, *replacement);
                        } else {
                            break;
                        }
                    }
                }
        
                current_batch.push_str(&processed_stmt);
                stmt_count += 1;
                
                // Execute batch if it gets too large (500KB) OR reaches 50 statements
                if current_batch.len() >= 500 * 1024 || stmt_count >= 50 {
                    if let Err(e) = client.batch_execute(&current_batch).await {
                        let dump = crate::config::get_app_data_dir().join("last_failed_dump.sql");
                        let _ = std::fs::write(&dump, &current_batch);
                        return Err(crate::db_utils::format_pg_error(e));
                    }
                    current_batch.clear();
                    stmt_count = 0;
                }
            }
            
            current_stmt.clear();
        }
    }

    // Execute any remaining statements in the final batch
    if !current_batch.trim().is_empty() {
        if let Err(e) = client.batch_execute(&current_batch).await {
            let dump = crate::config::get_app_data_dir().join("last_failed_dump.sql");
            let _ = std::fs::write(&dump, &current_batch);
            return Err(crate::db_utils::format_pg_error(e));
        }
    }
    
    Ok("Başarıyla aktarıldı".to_string())
}
