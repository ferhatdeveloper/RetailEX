use crate::config::AppConfig;
use tauri::command;
use tauri::Manager;
use tauri::path::BaseDirectory;
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

    let connection_string = format!(
        "host={} port={} user={} password={} dbname=postgres",
        host_part,
        port,
        user,
        pass
    );

    println!("Connecting to postgres system db...");
    let (client, connection) = tokio_postgres::connect(&connection_string, NoTls)
        .await
        .map_err(|e| format!("Sistem veritabanına bağlanılamadı ({}) : {}", if is_remote { "Uzak" } else { "Yerel" }, e))?;

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
        .map_err(|e| format!("Veritabanı kontrolü başarısız: {}", e))?;

    if rows.is_empty() {
        // 4. Create database
        let safe_db_name = db_name.replace("\"", ""); 
        
        client
            .execute(&format!("CREATE DATABASE \"{}\"", safe_db_name), &[])
            .await
            .map_err(|e| format!("Veritabanı oluşturulamadı: {}", e))?;
            
        println!("Database {} created successfully.", safe_db_name);
    } else {
        println!("Database {} already exists.", db_name);
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

    let conn_str = format!(
        "host={} port={} user={} password={} dbname={}",
        host_part, port, user, pass, db_name
    );

    println!("Running migrations for target: {} ({})", if is_remote { "REMOTE" } else { "LOCAL" }, db_name);

    let (client, connection) = tokio_postgres::connect(&conn_str, NoTls)
        .await
        .map_err(|e| format!("Migration DB ({}) Bağlantı Hatası: {}", if is_remote { "Uzak" } else { "Yerel" }, e))?;

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
    ).await.map_err(|e| format!("sys_migrations tablosu oluşturulamadı: {}", e))?;

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

    // 2c. Pre-create auth schema + extensions so migration scripts that
    //     reference auth.users or uuid_generate_v4() don't fail on a fresh DB.
    let _ = client.batch_execute("
        CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\";
        CREATE EXTENSION IF NOT EXISTS \"pgcrypto\";
        CREATE SCHEMA IF NOT EXISTS auth;
        CREATE SCHEMA IF NOT EXISTS rest;
        CREATE SCHEMA IF NOT EXISTS beauty;
        CREATE TABLE IF NOT EXISTS auth.users (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            email VARCHAR(255) UNIQUE,
            encrypted_password VARCHAR(255),
            raw_user_meta_data JSONB,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
        );
    ").await;

    // 3. Find Migration Files
    let mut search_paths = Vec::new();
    
    // Dev paths (relative to CWD)
    search_paths.push(std::path::PathBuf::from("database/migrations"));
    search_paths.push(std::path::PathBuf::from("../database/migrations"));
    
    // Resource paths (Tauri Resolver)
    // 1. Resolve relative to migrations directly
    if let Ok(res) = app.path().resolve("database/migrations", BaseDirectory::Resource) {
        search_paths.push(res);
    }
    
    // 2. Resolve relative to _up_ (common in bundling)
    if let Ok(res) = app.path().resolve("_up_/database/migrations", BaseDirectory::Resource) {
        search_paths.push(res);
    }

    // 3. Fallback to resource_dir manual joins
    if let Ok(resource_dir) = app.path().resource_dir() {
        search_paths.push(resource_dir.join("database").join("migrations"));
        search_paths.push(resource_dir.join("migrations"));
        search_paths.push(resource_dir.join("_up_").join("database").join("migrations"));
    }

    let mut found_path = None;
    let mut attempted_paths = Vec::new();

    for path in search_paths {
        attempted_paths.push(path.to_string_lossy().to_string());
        if path.exists() && path.is_dir() {
            println!("Migration directory found: {:?}", path);
            
            // Log file count in directory
            if let Ok(entries) = std::fs::read_dir(&path) {
                let count = entries.filter_map(|e| e.ok()).count();
                println!("Total files in migration directory: {}", count);
            }

            found_path = Some(path);
            break;
        }
    }

    let mut migration_files = Vec::new();
    let _migration_dir = if let Some(dir) = found_path {
        let dir_path = dir.clone(); // Store for later use
        let entries = std::fs::read_dir(dir).map_err(|e| e.to_string())?;
        for entry in entries {
            let entry = entry.map_err(|e| e.to_string())?;
            let path = entry.path();
            if path.extension().and_then(|s| s.to_str()) == Some("sql") {
                let filename = path.file_name().and_then(|s| s.to_str()).unwrap_or("").to_string();
                if let Some(version_part) = filename.split('_').next() {
                    // Only include numbered migrations (e.g. 001_...)
                    if version_part.chars().all(|c| c.is_ascii_digit()) && !version_part.is_empty() {
                        migration_files.push((version_part.to_string(), filename, path));
                    }
                }
            }
        }
        dir_path
    } else {
        return Err(format!(
            "Migration klasörü bulunamadı!\nDenenen yollar:\n{}", 
            attempted_paths.join("\n")
        ));
    };

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
            // Skip demo data if not requested
            if name == "006_demo_data.sql" && load_demo_data != Some(true) {
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
            
            // ── Auto-sanitize SQL for idempotency ──────────────────
            let sql = raw_sql
                .replace("CREATE OR REPLACE TRIGGER ", "CREATE TRIGGER ")
                .replace("CREATE TRIGGER ", "CREATE OR REPLACE TRIGGER ");
            
            // Execute SQL
            if let Err(e) = client.batch_execute(&sql).await {
                let err_msg = format!("{:?}", e);
                println!("❌ Migration hatası ({}): {}", name, err_msg);
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
    let log_dir = std::path::Path::new("C:\\RetailEX\\logs");
    if let Err(e) = std::fs::create_dir_all(log_dir) {
        println!("⚠️ Log dizini oluşturulamadı: {}", e);
    } else {
        let log_file = log_dir.join("migration_log.json");
        if let Err(e) = std::fs::write(&log_file, &json_report) {
            println!("⚠️ Log dosyası yazılamadı: {}", e);
        } else {
            println!("✅ Migration logları kaydedildi: {:?}", log_file);
        }
    }

    Ok(json_report)
}

#[command]
pub async fn open_migration_log() -> Result<(), String> {
    let log_path = "C:\\RetailEX\\logs\\migration_log.json";
    if std::path::Path::new(log_path).exists() {
        #[cfg(target_os = "windows")]
        {
            use std::process::Command;
            Command::new("explorer")
                .arg(log_path)
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

    let conn_str = format!(
        "host={} port={} user={} password={} dbname={}",
        host_part, port, user, pass, db_name
    );

    let (client, connection) = tokio_postgres::connect(&conn_str, NoTls)
        .await
        .map_err(|e| format!("Bağlantı Hatası: {}", e))?;

    tokio::spawn(async move {
        if let Err(e) = connection.await {
            eprintln!("connection error: {}", e);
        }
    });

    // Check if table exists first
    let table_exists = client.query("SELECT 1 FROM information_schema.tables WHERE table_name = 'sys_migrations'", &[])
        .await
        .map_err(|e| e.to_string())?
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
    ).await.map_err(|e| e.to_string())?;

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
pub async fn init_firm_schema(config: AppConfig, firm_nr: String, target: Option<String>) -> Result<String, String> {
    use tokio_postgres::NoTls;

    let is_remote = target.as_deref() == Some("remote");

    let (db_path, user, pass) = if is_remote {
        (&config.remote_db, &config.pg_remote_user, &config.pg_remote_pass)
    } else {
        (&config.local_db, &config.pg_local_user, &config.pg_local_pass)
    };

    let host_part = db_path.split(':').next().unwrap_or("localhost");
    let db_name = db_path.split('/').last().unwrap_or("retailex_local");

    let conn_str = format!(
        "host={} port=5432 user={} password={} dbname={}",
        host_part, user, pass, db_name
    );

    let (client, connection) = tokio_postgres::connect(&conn_str, NoTls)
        .await
        .map_err(|e| format!("Bağlantı Hatası: {}", e))?;

    tokio::spawn(async move {
        if let Err(e) = connection.await {
            eprintln!("connection error: {}", e);
        }
    });

    client.execute("SELECT CREATE_FIRM_TABLES($1)", &[&firm_nr])
        .await
        .map_err(|e| format!("Firma tabloları oluşturulamadı: {}", e))?;

    Ok(format!("Firma {} için kart tabloları hazırlandı.", firm_nr))
}

#[command]
pub async fn init_period_schema(config: AppConfig, firm_nr: String, period_nr: String, target: Option<String>) -> Result<String, String> {
    use tokio_postgres::NoTls;

    let is_remote = target.as_deref() == Some("remote");

    let (db_path, user, pass) = if is_remote {
        (&config.remote_db, &config.pg_remote_user, &config.pg_remote_pass)
    } else {
        (&config.local_db, &config.pg_local_user, &config.pg_local_pass)
    };

    let host_part = db_path.split(':').next().unwrap_or("localhost");
    let db_name = db_path.split('/').last().unwrap_or("retailex_local");

    let conn_str = format!(
        "host={} port=5432 user={} password={} dbname={}",
        host_part, user, pass, db_name
    );

    let (client, connection) = tokio_postgres::connect(&conn_str, NoTls)
        .await
        .map_err(|e| format!("Bağlantı Hatası: {}", e))?;

    tokio::spawn(async move {
        if let Err(e) = connection.await {
            eprintln!("connection error: {}", e);
        }
    });

    client.execute("SELECT CREATE_PERIOD_TABLES($1, $2)", &[&firm_nr, &period_nr])
        .await
        .map_err(|e| format!("Dönem tabloları oluşturulamadı: {}", e))?;

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
    let conn_str = format!(
        "host={} port={} user={} password={} dbname=postgres",
        host_part, port, config.pg_local_user, config.pg_local_pass
    );

    match tokio_postgres::connect(&conn_str, NoTls).await {
        Ok(_) => Ok("RUNNING".to_string()),
        Err(e) => {
            let err_str = e.to_string();
            if err_str.contains("password authentication failed") {
                Ok("AUTH_FAILED".to_string())
            } else {
                Ok(format!("ERROR: {}", err_str))
            }
        }
    }
}
