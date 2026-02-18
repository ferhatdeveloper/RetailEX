#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod db_ops;
mod mssql;
mod sync;
mod remote_input;
mod screen_capture;
mod maintenance;
mod security;
mod logger;
mod config;
mod db;
mod vpn;
mod backup_service;
mod device_fingerprint;
mod vpn_keys;
mod bank_ops;
mod license;

use sync::BackgroundSyncService;
use std::os::windows::process::CommandExt;
use std::process::Command;
use tauri::Manager;
use tokio_postgres::Client;
use std::sync::Arc;
use tokio::sync::Mutex;

// Connection Cache for Performance
pub struct DbConnection {
    pub client: Option<Arc<Client>>,
    pub conn_str: Option<String>,
}

pub struct DbState(pub Arc<Mutex<DbConnection>>);



#[tauri::command]
async fn check_pg16() -> Result<bool, String> {
    // Check for ANY PostgreSQL service
    let output = Command::new("powershell")
        .args(["-Command", "Get-Service -Name 'postgresql*' -ErrorAction SilentlyContinue"])
        .creation_flags(0x08000000) 
        .output()
        .map_err(|e| e.to_string())?;

    if output.status.success() && !output.stdout.is_empty() {
        return Ok(true);
    }

    // Fallback: Check for common install paths if service check fails (optional, but keeping simple for now)
    // Checking for v16 specifically as a fallback, but service check should catch most active installs.
    let path = std::path::Path::new("C:\\Program Files\\PostgreSQL\\16\\bin\\pg_ctl.exe");
    if path.exists() { return Ok(true); }
    
    let path15 = std::path::Path::new("C:\\Program Files\\PostgreSQL\\15\\bin\\pg_ctl.exe");
    if path15.exists() { return Ok(true); }

    Ok(false)
}

#[tauri::command]
async fn install_pg16() -> Result<String, String> {
    let script = r#"
        $url = "https://get.enterprisedb.com/postgresql/postgresql-16.1-1-windows-x64.exe"
        $installer = "$env:TEMP\postgresql-setup.exe"
        if (!(Test-Path $installer)) {
            Write-Host "Downloading PostgreSQL 16..."
            Invoke-WebRequest -Uri $url -OutFile $installer
        }
        Write-Host "Installing PostgreSQL 16 Silently..."
        Start-Process -FilePath $installer -ArgumentList "--mode unattended --unattendedmodeui none --superpassword Yq7xwQpt6c --serverport 5432" -Wait
    "#;

    let output = Command::new("powershell")
        .args(["-Command", script])
        .creation_flags(0x08000000) 
        .output()
        .map_err(|e| e.to_string())?;

    if output.status.success() {
        Ok("Installation completed successfully".to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

#[tauri::command]
async fn read_init_sqls(app: tauri::AppHandle) -> Result<Vec<(String, String)>, String> {
    let mut sqls = Vec::new();
    let mut search_paths = Vec::new();
    search_paths.push(std::path::PathBuf::from("database/init"));
    search_paths.push(std::path::PathBuf::from("../database/init"));
    if let Some(resource_dir) = app.path_resolver().resource_dir() {
        search_paths.push(resource_dir.join("database").join("init"));
        search_paths.push(resource_dir.join("init"));
    }

    let mut found_path = None;
    for path in search_paths {
        if path.exists() && path.is_dir() {
            found_path = Some(path);
            break;
        }
    }

    if let Some(init_dir) = found_path {
        let entries = std::fs::read_dir(init_dir).map_err(|e| e.to_string())?;
        for entry in entries {
            let entry = entry.map_err(|e| e.to_string())?;
            let path = entry.path();
            if path.extension().and_then(|s| s.to_str()) == Some("sql") {
                let content = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
                let name = path.file_name().and_then(|s| s.to_str()).unwrap_or("unknown").to_string();
                sqls.push((name, content));
            }
        }
    }
    
    sqls.sort_by(|a, b| a.0.cmp(&b.0));
    Ok(sqls)
}

#[tauri::command]
async fn pg_execute(
    state: tauri::State<'_, DbState>,
    conn_str: String, 
    sql: String
) -> Result<String, String> {
    use tokio_postgres::NoTls;
    use std::time::Duration;
    use tokio::time::timeout;

    let mut db = state.0.lock().await;
    
    // Check if we can reuse connection
    let mut client_to_use = None;
    if let Some(ref c) = db.client {
        if db.conn_str.as_ref() == Some(&conn_str) && !c.is_closed() {
            client_to_use = Some(c.clone());
        }
    }

    if client_to_use.is_none() {
        let (client, connection) = timeout(Duration::from_secs(5), tokio_postgres::connect(&conn_str, NoTls))
            .await
            .map_err(|_| "Connection timed out after 5 seconds".to_string())?
            .map_err(|e| format!("Connection failed: {}", e))?;

        tauri::async_runtime::spawn(async move {
            if let Err(e) = connection.await {
                eprintln!("connection error: {}", e);
            }
        });
        
        let client = Arc::new(client);
        db.client = Some(client.clone());
        db.conn_str = Some(conn_str.clone());
        client_to_use = Some(client);
    }

    let client = client_to_use.unwrap();
    client.batch_execute(&sql).await.map_err(|e| e.to_string())?;
    Ok("Success".to_string())
}

#[tauri::command]
async fn pg_query(
    state: tauri::State<'_, DbState>,
    conn_str: String, 
    sql: String, 
    params: Vec<serde_json::Value>
) -> Result<String, String> {
    use tokio_postgres::NoTls;
    use tokio_postgres::types::ToSql;
    use std::time::Duration;
    use tokio::time::timeout;
    use uuid::Uuid;
    use chrono::{DateTime, Utc};
    use rust_decimal::prelude::ToPrimitive;

    // Helper enum for heterogeneous parameters to avoid global stringification
    #[derive(Debug)]
    enum QueryParam {
        Text(String),
        Num(rust_decimal::Decimal),
        Bool(bool),
        Null,
    }

    impl ToSql for QueryParam {
        fn to_sql(&self, ty: &tokio_postgres::types::Type, out: &mut bytes::BytesMut) -> Result<tokio_postgres::types::IsNull, Box<dyn std::error::Error + Sync + Send>> {
            use tokio_postgres::types::Type;
            
            // Flexibly handle casting: If the expected type is text-based but we have a number/bool, 
            // convert to string and send as text. This helps with $1::text::uuid patterns.
            let is_text_type = match *ty {
                Type::VARCHAR | Type::TEXT | Type::BPCHAR | Type::NAME => true,
                _ => false,
            };

            match self {
                QueryParam::Null => Ok(tokio_postgres::types::IsNull::Yes),
                QueryParam::Text(s) => s.to_sql(ty, out),
                QueryParam::Num(n) => {
                    if is_text_type {
                        n.to_string().to_sql(ty, out)
                    } else {
                        n.to_sql(ty, out)
                    }
                },
                QueryParam::Bool(b) => {
                    if is_text_type {
                        b.to_string().to_sql(ty, out)
                    } else {
                        b.to_sql(ty, out)
                    }
                },
            }
        }

        fn accepts(_ty: &tokio_postgres::types::Type) -> bool {
            true // We handle conversion internally in to_sql
        }

        fn to_sql_checked(&self, ty: &tokio_postgres::types::Type, out: &mut bytes::BytesMut) -> Result<tokio_postgres::types::IsNull, Box<dyn std::error::Error + Sync + Send>> {
            self.to_sql(ty, out)
        }
    }

    let mut query_params = Vec::new();
    for p in params {
        match p {
            serde_json::Value::Null => query_params.push(QueryParam::Null),
            serde_json::Value::String(s) => query_params.push(QueryParam::Text(s)),
            serde_json::Value::Bool(b) => query_params.push(QueryParam::Bool(b)),
            serde_json::Value::Number(n) => {
                if let Some(i) = n.as_i64() {
                    query_params.push(QueryParam::Num(rust_decimal::Decimal::from(i)));
                } else if let Some(f) = n.as_f64() {
                    if let Some(d) = rust_decimal::prelude::FromPrimitive::from_f64(f) {
                        query_params.push(QueryParam::Num(d));
                    } else {
                        query_params.push(QueryParam::Text(n.to_string()));
                    }
                } else {
                    query_params.push(QueryParam::Text(n.to_string()));
                }
            }
            _ => query_params.push(QueryParam::Text(p.to_string())),
        }
    }

    let params_to_sql: Vec<&(dyn ToSql + Sync)> = query_params
        .iter()
        .map(|p| p as &(dyn ToSql + Sync))
        .collect();

    let mut db = state.0.lock().await;
    
    // Check if we can reuse connection
    let mut client_to_use = None;
    if let Some(ref c) = db.client {
        if db.conn_str.as_ref() == Some(&conn_str) && !c.is_closed() {
            client_to_use = Some(c.clone());
        }
    }

    if client_to_use.is_none() {
        let (client, connection) = timeout(Duration::from_secs(5), tokio_postgres::connect(&conn_str, NoTls))
            .await
            .map_err(|_| "Connection timed out after 5 seconds".to_string())?
            .map_err(|e| format!("Connection failed: {}", e))?;

        tauri::async_runtime::spawn(async move {
            if let Err(e) = connection.await {
                eprintln!("connection error: {}", e);
            }
        });
        
        let client = Arc::new(client);
        db.client = Some(client.clone());
        db.conn_str = Some(conn_str.clone());
        client_to_use = Some(client);
    }

    let client = client_to_use.unwrap();
    let rows = client.query(&sql, &params_to_sql).await.map_err(|e| e.to_string())?;

    let mut results = Vec::new();
    for row in rows {
        let mut map = serde_json::Map::new();
        for (i, column) in row.columns().iter().enumerate() {
            let name = column.name().to_string();
            let value: serde_json::Value = if let Ok(v) = row.try_get::<_, Option<serde_json::Value>>(i) {
                match v { Some(jv) => jv, None => serde_json::Value::Null }
            } else if let Ok(v) = row.try_get::<_, Option<String>>(i) {
                match v { Some(s) => serde_json::Value::String(s), None => serde_json::Value::Null }
            } else if let Ok(v) = row.try_get::<_, Option<rust_decimal::Decimal>>(i) {
                match v { Some(d) => serde_json::Value::Number(serde_json::Number::from_f64(d.to_f64().unwrap_or(0.0)).unwrap_or(serde_json::Number::from(0))), None => serde_json::Value::Null }
            } else if let Ok(v) = row.try_get::<_, Option<Uuid>>(i) {
                match v { Some(u) => serde_json::Value::String(u.to_string()), None => serde_json::Value::Null }
            } else if let Ok(v) = row.try_get::<_, Option<DateTime<Utc>>>(i) {
                match v { Some(dt) => serde_json::Value::String(dt.to_rfc3339()), None => serde_json::Value::Null }
            } else if let Ok(v) = row.try_get::<_, Option<i32>>(i) {
                match v { Some(n) => serde_json::Value::Number(serde_json::Number::from(n)), None => serde_json::Value::Null }
            } else if let Ok(v) = row.try_get::<_, Option<i64>>(i) {
                match v { Some(n) => serde_json::Value::Number(serde_json::Number::from(n)), None => serde_json::Value::Null }
            } else if let Ok(v) = row.try_get::<_, Option<f64>>(i) {
                match v { Some(n) => serde_json::Value::Number(serde_json::Number::from_f64(n).unwrap_or(serde_json::Number::from(0))), None => serde_json::Value::Null }
            } else if let Ok(v) = row.try_get::<_, Option<bool>>(i) {
                match v { Some(b) => serde_json::Value::Bool(b), None => serde_json::Value::Null }
            } else {
                 serde_json::Value::Null
            };
            map.insert(name, value);
        }
        results.push(serde_json::Value::Object(map));
    }

    serde_json::to_string(&results).map_err(|e| e.to_string())
}


#[tauri::command]
fn get_system_id() -> String {
    machine_uid::get().unwrap_or("UNKNOWN-HWID".to_string())
}

#[tauri::command]
fn get_os_username() -> String {
    std::env::var("USERNAME").unwrap_or_else(|_| {
        std::env::var("USER").unwrap_or_else(|_| "Bilinmeyen Kullanıcı".to_string())
    })
}

#[tauri::command]
async fn list_supabase_projects(token: String) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::new();
    let res = client
        .get("https://api.supabase.com/v1/projects")
        .header("Authorization", format!("Bearer {}", token))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if res.status().is_success() {
        let json = res.json::<serde_json::Value>().await.map_err(|e| e.to_string())?;
        Ok(json)
    } else {
        let status = res.status();
        let err_body = res.text().await.unwrap_or_else(|_| "Unknown error".to_string());
        Err(format!("Supabase API Hatası ({}): {}", status, err_body))
    }
}

#[tauri::command]
async fn dump_supabase_to_sql(window: tauri::Window, project_ref: String, token: String, output_path: String) -> Result<String, String> {
    use std::fs::File;
    use std::io::Write;
    use std::collections::HashMap;

    let client = reqwest::Client::new();
    let url = format!("https://api.supabase.com/v1/projects/{}/database/query", project_ref);

    async fn fetch_supabase_query(client: &reqwest::Client, url: &str, token: &str, sql: &str) -> Result<serde_json::Value, String> {
        let res = client.post(url)
            .header("Authorization", format!("Bearer {}", token))
            .header("Content-Type", "application/json")
            .json(&serde_json::json!({ "query": sql }))
            .send()
            .await
            .map_err(|e| e.to_string())?;

        if !res.status().is_success() {
                let err_text = res.text().await.unwrap_or_else(|_| "Unknown API Error".to_string());
                return Err(format!("Supabase API Hatası: {}", err_text));
        }
        res.json::<serde_json::Value>().await.map_err(|e| e.to_string())
    }

    if let Some(parent) = std::path::Path::new(&output_path).parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    let mut sql_dump = String::new();
    sql_dump.push_str("-- RetailEX Supabase SQL Dump (API Mode)\n");
    sql_dump.push_str(&format!("-- Generated at: {}\n\n", chrono::Utc::now().to_rfc3339()));

    let _ = window.emit("supabase-dump-progress", "Tablo şemaları analizi yapılıyor...");

    let sql_tables = "
        SELECT t.table_schema, t.table_name, c.column_name, c.data_type, c.is_nullable, c.column_default, c.ordinal_position 
        FROM information_schema.tables t 
        JOIN information_schema.columns c ON t.table_name = c.table_name AND t.table_schema = c.table_schema
        WHERE t.table_schema NOT IN ('information_schema', 'pg_catalog', 'pg_toast') 
          AND t.table_type = 'BASE TABLE' 
        ORDER BY t.table_schema, t.table_name, c.ordinal_position";
    
    let rows_val = fetch_supabase_query(&client, &url, &token, sql_tables).await?;
    let rows = rows_val.as_array().ok_or("Invalid API response format (expected array)")?;

    let mut table_columns: HashMap<String, Vec<serde_json::Value>> = HashMap::new();
    let mut table_order: Vec<String> = Vec::new(); 
    let mut discovered_schemas: Vec<String> = Vec::new();

    for row in rows {
        let schema = row["table_schema"].as_str().unwrap_or("public").to_string();
        let table = row["table_name"].as_str().unwrap_or("unknown").to_string();
        let full_table_name = format!("{}.{}", schema, table);

        if !discovered_schemas.contains(&schema) && schema != "public" {
            discovered_schemas.push(schema.clone());
        }

        if !table_columns.contains_key(&full_table_name) {
            table_order.push(full_table_name.clone());
            table_columns.insert(full_table_name.clone(), Vec::new());
        }
        if let Some(cols) = table_columns.get_mut(&full_table_name) {
             cols.push(row.clone());
        }
    }

    for schema in discovered_schemas {
        sql_dump.push_str(&format!("CREATE SCHEMA IF NOT EXISTS {};\n", schema));
    }
    sql_dump.push_str("\n");

    let total_tables = table_order.len();
    for (idx, full_table_name) in table_order.iter().enumerate() {
        let _ = window.emit("supabase-dump-progress", format!("Tablo İşleniyor ({}/{}): {}...", idx + 1, total_tables, full_table_name));
        sql_dump.push_str(&format!("CREATE TABLE IF NOT EXISTS {} (\n", full_table_name));
        let cols = &table_columns[full_table_name];
        let mut col_defs = Vec::new();
        let mut col_names = Vec::new();
        for col in cols {
            let name = col["column_name"].as_str().unwrap_or("");
            col_names.push(name.to_string());
            let dtype = col["data_type"].as_str().unwrap_or("text");
            let nullable = col["is_nullable"].as_str().unwrap_or("YES");
            let default_val = col["column_default"].as_str();
            let mut def = format!("    \"{}\" {}", name, dtype);
            if nullable == "NO" { def.push_str(" NOT NULL"); }
            if let Some(d) = default_val { def.push_str(&format!(" DEFAULT {}", d)); }
            col_defs.push(def);
        }
        sql_dump.push_str(&col_defs.join(",\n"));
        sql_dump.push_str("\n);\n\n");
        let sql_data = format!("SELECT * FROM {}", full_table_name);
        if let Ok(data_rows_val) = fetch_supabase_query(&client, &url, &token, &sql_data).await {
            if let Some(data_rows) = data_rows_val.as_array() {
                if !data_rows.is_empty() {
                    for row_obj in data_rows {
                        if let Some(row_map) = row_obj.as_object() {
                            let mut values = Vec::new();
                            let mut valid_cols = Vec::new();
                             for col_name in &col_names {
                                let val_json = row_map.get(col_name).unwrap_or(&serde_json::Value::Null);
                                let val_str = match val_json {
                                    serde_json::Value::Null => "NULL".to_string(),
                                    serde_json::Value::Number(n) => n.to_string(),
                                    serde_json::Value::String(s) => format!("'{}'", s.replace("'", "''")),
                                    serde_json::Value::Bool(b) => b.to_string(),
                                    _ => format!("'{}'", val_json.to_string().replace("'", "''")),
                                };
                                values.push(val_str);
                                valid_cols.push(format!("\"{}\"", col_name));
                            }
                            sql_dump.push_str(&format!("INSERT INTO {} ({}) VALUES ({});\n", full_table_name, valid_cols.join(", "), values.join(", ")));
                        }
                    }
                    sql_dump.push_str("\n");
                }
            }
        }
    }

    let mut file = File::create(&output_path).map_err(|e| e.to_string())?;
    file.write_all(sql_dump.as_bytes()).map_err(|e| e.to_string())?;
    Ok(output_path)
}

#[tauri::command]
async fn pg_execute_file(state: tauri::State<'_, DbState>, conn_str: String, file_path: String) -> Result<String, String> {
    let sql = std::fs::read_to_string(&file_path).map_err(|e| e.to_string())?;
    pg_execute(state, conn_str, sql).await
}

#[tauri::command]
async fn verify_license(key: String) -> Result<license::LicenseInfo, String> {
    Ok(license::LicenseManager::check_license(&key))
}

fn check_bootstrap_config(app: &tauri::AppHandle) {
    let bootstrap_path = app.path_resolver().app_config_dir().unwrap_or_else(|| std::path::PathBuf::from("C:\\RetailEx")).join("bootstrap.json");
    if bootstrap_path.exists() {
        if let Ok(content) = std::fs::read_to_string(&bootstrap_path) {
            if let Ok(bootstrap_config) = serde_json::from_str::<serde_json::Value>(&content) {
                if let Ok(mut config) = config::get_app_config(app.clone()) {
                    if let Some(ws) = bootstrap_config.get("central_ws_url").and_then(|v| v.as_str()) {
                        config.central_ws_url = ws.to_string();
                    }
                    if let Some(amqp) = bootstrap_config.get("amqp_url").and_then(|v| v.as_str()) {
                        config.amqp_url = amqp.to_string();
                    }
                    if let Some(l_user) = bootstrap_config.get("logo_objects_user").and_then(|v| v.as_str()) {
                        config.logo_objects_user = l_user.to_string();
                    }
                    if let Some(l_pass) = bootstrap_config.get("logo_objects_pass").and_then(|v| v.as_str()) {
                        config.logo_objects_pass = l_pass.to_string();
                    }
                    if let Some(l_path) = bootstrap_config.get("logo_objects_path").and_then(|v| v.as_str()) {
                        config.logo_objects_path = l_path.to_string();
                    }
                    if let Some(l_active) = bootstrap_config.get("logo_objects_active").and_then(|v| v.as_bool()) {
                        config.logo_objects_active = l_active;
                    }
                    if let Some(v_fixed) = bootstrap_config.get("use_fixed_vpn_ip").and_then(|v| v.as_bool()) {
                        config.use_fixed_vpn_ip = v_fixed;
                    }
                    let _ = config::save_app_config(app.clone(), config);
                    let _ = std::fs::remove_file(bootstrap_path);
                }
            }
        }
    }
}

fn main() {
    tauri::Builder::default()
    .setup(|app| {
        let handle = app.handle();
        let _ = config::init_config_db();
        let _ = db::init_db(&handle);

        app.manage(DbState(Arc::new(Mutex::new(DbConnection {
            client: None,
            conn_str: None,
        }))));
        
        check_bootstrap_config(&handle);

        let (sync_service, rx) = BackgroundSyncService::new();
        app.manage(sync::SyncSender(sync_service.get_sender()));
        app.manage(vpn::VpnManager::new());
        sync_service.start(Some(handle.clone()), rx);

        let app_handle = handle.clone();
        tauri::async_runtime::spawn(async move {
            if let Ok(mut config) = config::get_app_config(app_handle.clone()) {
                // Auto-Migration on Startup
                if config.is_configured {
                    println!("🚀 Startup: Checking for pending database migrations...");
                    let app_version = app_handle.package_info().version.to_string();
                    match db_ops::apply_migrations_internal(&app_handle, &config, None, None, app_version).await {
                        Ok(msg) => println!("✅ Startup Migrations: {}", msg),
                        Err(e) => eprintln!("❌ Startup Migration Error: {}", e),
                    }
                    
                    // Auto-Update Check on Startup (Non-blocking)
                    println!("🚀 Startup: Checking for application updates...");
                    let update_handle = app_handle.clone();
                    tauri::async_runtime::spawn(async move {
                        let _ = check_update(update_handle).await; 
                    });
                }

                config.enable_mesh = true;
                let _ = config::save_app_config(app_handle.clone(), config.clone());
                if let Some(vpn_cfg) = config.vpn_config {
                    let vpn_state: tauri::State<vpn::VpnManager> = app_handle.state();
                    let _ = vpn::start_vpn_mesh(vpn_state, vpn_cfg).await;
                }
            }
        });
        Ok(())
    })
    .invoke_handler(tauri::generate_handler![
        check_pg16, install_pg16, get_system_id, get_os_username,
        list_supabase_projects, dump_supabase_to_sql, pg_execute_file,
        pg_query, pg_execute, read_init_sqls,
        db_ops::create_database, db_ops::run_migrations, db_ops::init_firm_schema, db_ops::init_period_schema, db_ops::check_db_status, db_ops::get_db_version,
        sync::send_websocket_message, sync::announce_node, sync::get_last_sync_info,
        verify_license, check_update,

        vpn::get_vpn_status, vpn::get_mesh_peers, vpn::generate_vpn_keys, vpn::start_vpn_mesh,
        vpn_keys::generate_device_bound_vpn_keys, vpn_keys::verify_device_and_decrypt_key,
        maintenance::compact_database, security::verify_token,
        config::get_app_config, config::save_app_config,
        config::get_dashboard_shortcuts, config::save_dashboard_shortcuts, config::reset_dashboard_shortcuts,
        backup_service::perform_manual_backup,
        mssql::test_mssql_connection, mssql::get_logo_firms, mssql::get_logo_periods, mssql::get_logo_data_preview, mssql::sync_logo_data,
        sync::enable_remote_support,
        bank_ops::get_bank_registers, bank_ops::save_bank_register, bank_ops::get_bank_transactions, bank_ops::save_bank_transaction
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}

#[tauri::command]
async fn check_update(app: tauri::AppHandle) -> Result<String, String> {
    let config = config::get_app_config(app.clone()).map_err(|e| e.to_string())?;
    
    let update_url = if config.update_source == "github" {
        // GitHub Releases (Requires strict format or proxy, using placeholder for now)
        // If repo is private, this won't work without a token proxy.
        "https://github.com/OWNER/REPO/releases/latest/download/latest.json".to_string() 
    } else {
        // Central Server (Default)
        // We construct the URL manually to match tauri.conf.json pattern expectation if we were to use it directly,
        // but here we are overriding it.
        // Note: Tauri replaces {{target}}, {{arch}} automatically if we pass the base URL.
        // Actually, builder().urls() expects the full URL with variables or the resolved one?
        // Tauri docs say: "The update endpoints... Tauri replaces {{target}}...".
        "https://updates.retailex.app/{{target}}/{{arch}}/{{current_version}}".to_string()
    };

    println!("Checking for updates from: {}", config.update_source);
    
    // Trigger the update check with the dynamic URL
    let builder = tauri::updater::builder(app.clone()).endpoints(&[update_url]);
    
    match builder.check().await {
        Ok(update) => {
            if update.is_update_available() {
                let latest_v = update.latest_version().to_string();
                println!("Update available: {}", latest_v);
                let install_res: Result<(), tauri::updater::Error> = update.download_and_install().await;
                install_res.map_err(|e| e.to_string())?;
                Ok(format!("Update installed: {}", latest_v))
            } else {
                Ok("No updates available".to_string())
            }
        },
        Err(e) => Err(format!("Update check failed: {}", e)),
    }
}
