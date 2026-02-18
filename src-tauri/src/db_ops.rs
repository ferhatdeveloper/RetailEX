use crate::config::AppConfig;
use tauri::command;

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

    // 3. Find Migration Files
    let mut search_paths = Vec::new();
    
    // Dev paths (relative to CWD)
    search_paths.push(std::path::PathBuf::from("database/migrations"));
    search_paths.push(std::path::PathBuf::from("../database/migrations"));
    
    // Resource paths (Tauri Resolver)
    // 1. Resolve relative to migrations directly
    if let Some(res) = app.path_resolver().resolve_resource("database/migrations") {
        search_paths.push(res);
    }
    
    // 2. Resolve relative to _up_ (common in bundling)
    if let Some(res) = app.path_resolver().resolve_resource("_up_/database/migrations") {
        search_paths.push(res);
    }

    // 3. Fallback to resource_dir manual joins
    if let Some(resource_dir) = app.path_resolver().resource_dir() {
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

    // Sort by version (001, 002...)
    migration_files.sort_by(|a, b| a.0.cmp(&b.0));

    // 4. Apply Pending Migrations
    let mut applied_count = 0;
    
    // Direct Execution (No Transaction for Debugging/Stability on mixed commands)
    // Some commands like CREATE INDEX CONCURRENTLY or strict schema changes might fail in blocks
    // Also helps pin-point exactly which file fails.
    
    for (version, name, path) in migration_files {
        // Check if applied by NAME (filename) to allow multiple files with same version prefix
        let rows = client.query("SELECT 1 FROM sys_migrations WHERE name = $1", &[&name])
            .await
            .map_err(|e| e.to_string())?;

        if rows.is_empty() {
            // Skip demo data if not requested
            if name == "006_demo_data.sql" && load_demo_data != Some(true) {
                println!("Skipping demo data migration as load_demo_data is false: {}", name);
                continue;
            }

            // Check if file exists before trying to read it
            if !path.exists() {
                println!("Warning: Migration file not found, skipping: {}", name);
                continue;
            }

            println!("Applying migration: {}", name);
            let sql = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
            
            // Execute SQL
            if let Err(e) = client.batch_execute(&sql).await {
                 return Err(format!("Migration hatası ({}): {:?}", name, e));
            }
            
            // Record migration
            client.execute(
                "INSERT INTO sys_migrations (version, name, app_version) VALUES ($1, $2, $3)",
                &[&version, &name, &app_version]
            ).await.map_err(|e| e.to_string())?;
            
            applied_count += 1;
        } else {
            println!("Skipping applied migration: {}", name);
        }
    }

    // No commit needed for direct execution

    Ok(format!("{} yeni güncelleme uygulandı.", applied_count))
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
