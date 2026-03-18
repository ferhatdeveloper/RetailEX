#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod db_ops;
mod db_utils;
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
use tauri::{Manager, Emitter};
use tauri::path::BaseDirectory;
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
    // Fast path 1: Check common PostgreSQL install paths (microseconds, no process spawn)
    let pg_paths = [
        "C:\\Program Files\\PostgreSQL\\17\\bin\\pg_ctl.exe",
        "C:\\Program Files\\PostgreSQL\\16\\bin\\pg_ctl.exe",
        "C:\\Program Files\\PostgreSQL\\15\\bin\\pg_ctl.exe",
        "C:\\Program Files\\PostgreSQL\\14\\bin\\pg_ctl.exe",
    ];
    for path in &pg_paths {
        if std::path::Path::new(path).exists() {
            return Ok(true);
        }
    }

    // Fast path 2: Check if PostgreSQL is already accepting connections on port 5432 (200ms max)
    use std::net::TcpStream;
    use std::time::Duration;
    if let Ok(addr) = "127.0.0.1:5432".parse() {
        if TcpStream::connect_timeout(&addr, Duration::from_millis(200)).is_ok() {
            return Ok(true);
        }
    }

    // Slow path: PowerShell service check (only reached if above checks fail)
    let output = Command::new("powershell")
        .args(["-Command", "Get-Service -Name 'postgresql*' -ErrorAction SilentlyContinue"])
        .creation_flags(0x08000000)
        .output()
        .map_err(|e| e.to_string())?;

    Ok(output.status.success() && !output.stdout.is_empty())
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

    // 1. Resolve using tauri::path::resolve_resource
    if let Ok(res) = app.path().resolve("database/init", BaseDirectory::Resource) {
        search_paths.push(res);
    }
    
    // 2. Resolve relative to _up_ (common in bundling)
    if let Ok(res) = app.path().resolve("_up_/database/init", BaseDirectory::Resource) {
        search_paths.push(res);
    }
 
    // 3. Fallback to resource_dir manual joins
    if let Ok(resource_dir) = app.path().resource_dir() {
        search_paths.push(resource_dir.join("database").join("init"));
        search_paths.push(resource_dir.join("init"));
        search_paths.push(resource_dir.join("_up_").join("database").join("init"));
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
        use std::str::FromStr;
        let mut pg_config = tokio_postgres::Config::from_str(&conn_str)
            .map_err(|e| format!("Invalid connection string: {}", e))?;
        pg_config.connect_timeout(Duration::from_secs(5));

        let (client, connection) = pg_config.connect(NoTls)
            .await
            .map_err(|e| format!("Connection failed: {}", crate::db_ops::format_pg_error(e)))?;

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
    client.batch_execute(&sql).await.map_err(|e| crate::db_utils::format_pg_error(e))?;
    Ok("Success".to_string())
}

// get_app_version removed because it was unused


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
            use rust_decimal::prelude::FromPrimitive;
            
            let is_text_type = match *ty {
                Type::VARCHAR | Type::TEXT | Type::BPCHAR | Type::NAME | Type::UNKNOWN => true,
                _ => false,
            };

            match self {
                QueryParam::Null => Ok(tokio_postgres::types::IsNull::Yes),

                // ── Text → target type conversion ──────────────────────
                // The frontend normalises every value to a JSON string.
                // tokio-postgres uses the *extended* (binary) protocol, so
                // we MUST parse the string into the native Rust type that
                // matches the PostgreSQL column, otherwise the server
                // receives raw UTF-8 bytes where it expects a binary int /
                // bool / uuid / date and returns 22P03.
                QueryParam::Text(s) => {
                    if is_text_type {
                        return s.to_sql(ty, out);
                    }
                    match *ty {
                        // Boolean
                        Type::BOOL => {
                            let b = match s.to_lowercase().as_str() {
                                "true" | "t" | "1" | "yes" => true,
                                _ => false,
                            };
                            b.to_sql(ty, out)
                        },
                        // Integers
                        Type::INT2 => {
                            let v: i16 = s.parse().unwrap_or(0);
                            v.to_sql(ty, out)
                        },
                        Type::INT4 | Type::OID => {
                            let v: i32 = s.parse().unwrap_or(0);
                            v.to_sql(ty, out)
                        },
                        Type::INT8 => {
                            let v: i64 = s.parse().unwrap_or(0);
                            v.to_sql(ty, out)
                        },
                        // Floats
                        Type::FLOAT4 => {
                            let v: f32 = s.parse().unwrap_or(0.0);
                            v.to_sql(ty, out)
                        },
                        Type::FLOAT8 => {
                            let v: f64 = s.parse().unwrap_or(0.0);
                            v.to_sql(ty, out)
                        },
                        // Decimal / Numeric
                        Type::NUMERIC => {
                            let v = s.parse::<rust_decimal::Decimal>()
                                .unwrap_or(rust_decimal::Decimal::from(0));
                            v.to_sql(ty, out)
                        },
                        // UUID
                        Type::UUID => {
                            if let Ok(u) = Uuid::parse_str(s) {
                                u.to_sql(ty, out)
                            } else {
                                // Fallback: send as text and let PG cast
                                s.to_sql(&Type::TEXT, out)
                            }
                        },
                        // Date
                        Type::DATE => {
                            let d = chrono::NaiveDate::parse_from_str(s, "%Y-%m-%d")
                                .or_else(|_| chrono::NaiveDate::parse_from_str(&s[..10.min(s.len())], "%Y-%m-%d"))
                                .or_else(|_| chrono::NaiveDate::parse_from_str(s, "%Y/%m/%d"));
                            if let Ok(val) = d {
                                val.to_sql(ty, out)
                            } else {
                                s.to_sql(&Type::TEXT, out)
                            }
                        },
                        // Timestamp without timezone
                        Type::TIMESTAMP => {
                            if let Ok(dt) = chrono::NaiveDateTime::parse_from_str(s, "%Y-%m-%dT%H:%M:%S%.f") {
                                dt.to_sql(ty, out)
                            } else if let Ok(dt) = chrono::NaiveDateTime::parse_from_str(s, "%Y-%m-%d %H:%M:%S") {
                                dt.to_sql(ty, out)
                            } else {
                                s.to_sql(&Type::TEXT, out)
                            }
                        },
                        // Timestamp with timezone
                        Type::TIMESTAMPTZ => {
                            if let Ok(dt) = DateTime::parse_from_rfc3339(s) {
                                let utc: DateTime<Utc> = dt.with_timezone(&Utc);
                                utc.to_sql(ty, out)
                            } else if let Ok(dt) = chrono::NaiveDateTime::parse_from_str(s, "%Y-%m-%dT%H:%M:%S%.f") {
                                let utc = DateTime::<Utc>::from_naive_utc_and_offset(dt, Utc);
                                utc.to_sql(ty, out)
                            } else {
                                s.to_sql(&Type::TEXT, out)
                            }
                        },
                        // JSONB / JSON
                        Type::JSONB | Type::JSON => {
                            let v: serde_json::Value = serde_json::from_str(s)
                                .unwrap_or(serde_json::Value::String(s.clone()));
                            v.to_sql(ty, out)
                        },
                        // Anything else: send as text (PG will cast via ::type if query uses it)
                        _ => {
                            s.to_sql(&Type::TEXT, out)
                        }
                    }
                },

                // ── Num (Decimal) ──────────────────────────────────────
                QueryParam::Num(n) => {
                    if is_text_type {
                        n.to_string().to_sql(ty, out)
                    } else {
                        match *ty {
                            Type::INT2 => { let v = n.to_string().parse::<i16>().unwrap_or(0); v.to_sql(ty, out) },
                            Type::INT4 | Type::OID => { let v = n.to_string().parse::<i32>().unwrap_or(0); v.to_sql(ty, out) },
                            Type::INT8 => { let v = n.to_string().parse::<i64>().unwrap_or(0); v.to_sql(ty, out) },
                            Type::FLOAT4 => { let v = n.to_string().parse::<f32>().unwrap_or(0.0); v.to_sql(ty, out) },
                            Type::FLOAT8 => { let v = n.to_string().parse::<f64>().unwrap_or(0.0); v.to_sql(ty, out) },
                            _ => n.to_sql(ty, out)
                        }
                    }
                },

                // ── Bool ───────────────────────────────────────────────
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
            // Always convert numbers to Text so that SQL-side ::text::int4 / ::text::uuid casts work
            serde_json::Value::Number(n) => query_params.push(QueryParam::Text(n.to_string())),
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
        use std::str::FromStr;
        let mut pg_config = tokio_postgres::Config::from_str(&conn_str)
            .map_err(|e| format!("Invalid connection string: {}", e))?;
        pg_config.connect_timeout(Duration::from_secs(5));

        let (client, connection) = pg_config.connect(NoTls)
            .await
            .map_err(|e| format!("Connection failed: {}", crate::db_ops::format_pg_error(e)))?;

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
    let rows = client.query(&sql, &params_to_sql).await.map_err(|e| {
        // Expose the real Postgres error with source chain
        let mut msg = e.to_string();
        if let Some(db_err) = e.as_db_error() {
            msg = format!("PG Error {}: {} | Detail: {} | Hint: {}",
                db_err.code().code(),
                db_err.message(),
                db_err.detail().unwrap_or("yok"),
                db_err.hint().unwrap_or("yok"),
            );
        }
        msg
    })?;

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
            } else if let Ok(v) = row.try_get::<_, Option<chrono::NaiveDate>>(i) {
                match v { Some(d) => serde_json::Value::String(d.to_string()), None => serde_json::Value::Null }
            } else if let Ok(v) = row.try_get::<_, Option<chrono::NaiveDateTime>>(i) {
                match v { Some(dt) => serde_json::Value::String(dt.to_string()), None => serde_json::Value::Null }
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

#[derive(serde::Serialize)]
struct TableSchema {
    table_ddl: String,
    type_ddls: Vec<String>,
    sequence_ddls: Vec<String>,
}

#[tauri::command]
async fn get_supabase_table_schema(project_ref: String, token: String, table_name: String) -> Result<TableSchema, String> {
    let client = reqwest::Client::new();
    let url = format!("https://api.supabase.com/v1/projects/{}/database/query", project_ref);

    // 1. Get column information
    let sql = format!("
        SELECT column_name, data_type, udt_name, is_nullable, column_default 
        FROM information_schema.columns 
        WHERE table_name = '{}' AND table_schema = 'public'
        ORDER BY ordinal_position", table_name);

    let res = client.post(&url)
        .header("Authorization", format!("Bearer {}", token))
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({ "query": sql }))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        let err_text = res.text().await.unwrap_or_else(|_| "Unknown API Error".to_string());
        return Err(format!("Supabase API Hatası (Columns): {}", err_text));
    }

    let cols: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
    let cols_array = cols.as_array().ok_or("Invalid response format")?;
    
    if cols_array.is_empty() {
        return Err(format!("Table '{}' not found or has no columns", table_name));
    }

    // 1.5 Get Primary Key information
    let pk_sql = format!("
        SELECT kcu.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
        WHERE tc.table_name = '{}' AND tc.table_schema = 'public' AND tc.constraint_type = 'PRIMARY KEY'
        ORDER BY kcu.ordinal_position", table_name);

    let res_pk = client.post(&url)
        .header("Authorization", format!("Bearer {}", token))
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({ "query": pk_sql }))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let mut pk_cols = Vec::new();
    if res_pk.status().is_success() {
        if let Ok(pk_data) = res_pk.json::<serde_json::Value>().await {
            if let Some(pk_array) = pk_data.as_array() {
                for pk in pk_array {
                    if let Some(name) = pk["column_name"].as_str() {
                        pk_cols.push(format!("\"{}\"", name));
                    }
                }
            }
        }
    }

    let mut user_defined_types = Vec::new();
    let mut table_ddl_parts = Vec::new();

    for col in cols_array {
        let name = col["column_name"].as_str().unwrap_or("");
        let mut dtype = col["data_type"].as_str().unwrap_or("text").to_string();
        let udt_name = col["udt_name"].as_str().unwrap_or("text");
        
        if dtype.to_uppercase() == "ARRAY" {
            if udt_name.starts_with('_') {
                dtype = format!("{}[]", &udt_name[1..]);
            } else {
                dtype = format!("{}[]", udt_name);
            }
        } else if dtype.to_uppercase() == "USER-DEFINED" {
            dtype = udt_name.to_string();
            user_defined_types.push(udt_name.to_string());
        }
        
        let nullable = col["is_nullable"].as_str().unwrap_or("YES");
        let default_val = col["column_default"].as_str();
        
        let mut def = format!("    \"{}\" {}", name, dtype);
        if nullable == "NO" { def.push_str(" NOT NULL"); }
        if let Some(d) = default_val { def.push_str(&format!(" DEFAULT {}", d)); }
        table_ddl_parts.push(def);
    }

    if !pk_cols.is_empty() {
        table_ddl_parts.push(format!("    PRIMARY KEY ({})", pk_cols.join(", ")));
    }

    let table_ddl = format!("CREATE TABLE IF NOT EXISTS public.\"{}\" (\n{}\n);", 
        table_name, 
        table_ddl_parts.join(",\n")
    );

    // 2. Resolve custom types (enums)
    let mut type_ddls = Vec::new();
    if !user_defined_types.is_empty() {
        let types_list = user_defined_types.iter().map(|t| format!("'{}'", t)).collect::<Vec<_>>().join(",");
        let types_sql = format!("
            SELECT 
                t.typname as type_name,
                n.nspname as schema_name,
                array_agg(e.enumlabel ORDER BY e.enumsortorder) as enum_values
            FROM pg_type t
            JOIN pg_enum e ON t.oid = e.enumtypid
            JOIN pg_namespace n ON n.oid = t.typnamespace
            WHERE t.typname IN ({})
            GROUP BY t.typname, n.nspname", types_list);

        let res_types = client.post(&url)
            .header("Authorization", format!("Bearer {}", token))
            .header("Content-Type", "application/json")
            .json(&serde_json::json!({ "query": types_sql }))
            .send()
            .await
            .map_err(|e| e.to_string())?;

        if res_types.status().is_success() {
            if let Ok(types_data) = res_types.json::<serde_json::Value>().await {
                if let Some(types_array) = types_data.as_array() {
                    for t in types_array {
                        let type_name = t["type_name"].as_str().unwrap_or("");
                        let schema_name = t["schema_name"].as_str().unwrap_or("public");
                        let values = t["enum_values"].as_array().map(|arr| {
                            arr.iter().map(|v| format!("'{}'", v.as_str().unwrap_or(""))).collect::<Vec<_>>().join(", ")
                        }).unwrap_or_default();
                        
                        if !type_name.is_empty() && !values.is_empty() {
                            let type_ddl = format!(
                                "DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE t.typname = '{}' AND n.nspname = '{}') THEN CREATE TYPE \"{}\".\"{}\" AS ENUM ({}); END IF; END $$;",
                                type_name, schema_name, schema_name, type_name, values
                            );
                            type_ddls.push(type_ddl);
                        }
                    }
                }
            }
        }
    }

    // 3. Resolve sequences
    let mut sequence_ddls = Vec::new();
    let seq_sql = format!("
        SELECT 
            s.sequence_name,
            s.start_value,
            s.increment,
            s.minimum_value,
            s.maximum_value
        FROM information_schema.sequences s
        WHERE s.sequence_schema = 'public'
        AND EXISTS (
            SELECT 1 FROM information_schema.columns c 
            WHERE c.table_name = '{}' AND c.table_schema = 'public'
            AND c.column_default LIKE '%' || s.sequence_name || '%'
        )", table_name);

    let res_seqs = client.post(&url)
        .header("Authorization", format!("Bearer {}", token))
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({ "query": seq_sql }))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if res_seqs.status().is_success() {
        if let Ok(seqs_data) = res_seqs.json::<serde_json::Value>().await {
            if let Some(seqs_array) = seqs_data.as_array() {
                for s in seqs_array {
                    let name = s["sequence_name"].as_str().unwrap_or("");
                    let start = s["start_value"].as_str().unwrap_or("1");
                    let inc = s["increment"].as_str().unwrap_or("1");
                    if !name.is_empty() {
                        let seq_ddl = format!(
                            "CREATE SEQUENCE IF NOT EXISTS public.\"{}\" START WITH {} INCREMENT BY {};",
                            name, start, inc
                        );
                        sequence_ddls.push(seq_ddl);
                    }
                }
            }
        }
    }

    Ok(TableSchema { table_ddl, type_ddls, sequence_ddls })
}

#[tauri::command]
async fn execute_supabase_sql(project_ref: String, token: String, sql: String) -> Result<String, String> {
    let client = reqwest::Client::new();
    let url = format!("https://api.supabase.com/v1/projects/{}/database/query", project_ref);

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

    Ok("Success".to_string())
}

#[tauri::command]
async fn get_supabase_table_ddl(project_ref: String, token: String, table_name: String) -> Result<String, String> {
    let client = reqwest::Client::new();
    let url = format!("https://api.supabase.com/v1/projects/{}/database/query", project_ref);

    // SQL to get column information
    let sql = format!("
        SELECT column_name, data_type, udt_name, is_nullable, column_default 
        FROM information_schema.columns 
        WHERE table_name = '{}' AND table_schema = 'public'
        ORDER BY ordinal_position", table_name);

    let res = client.post(&url)
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

    let cols: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
    let cols_array = cols.as_array().ok_or("Invalid response format")?;
    
    if cols_array.is_empty() {
        return Err(format!("Table '{}' not found or has no columns", table_name));
    }

    // Get Primary Key information
    let pk_sql = format!("
        SELECT kcu.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
        WHERE tc.table_name = '{}' AND tc.table_schema = 'public' AND tc.constraint_type = 'PRIMARY KEY'
        ORDER BY kcu.ordinal_position", table_name);

    let res_pk = client.post(&url)
        .header("Authorization", format!("Bearer {}", token))
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({ "query": pk_sql }))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let mut pk_cols = Vec::new();
    if res_pk.status().is_success() {
        if let Ok(pk_data) = res_pk.json::<serde_json::Value>().await {
            if let Some(pk_array) = pk_data.as_array() {
                for pk in pk_array {
                    if let Some(name) = pk["column_name"].as_str() {
                        pk_cols.push(format!("\"{}\"", name));
                    }
                }
            }
        }
    }

    let mut ddl = format!("CREATE TABLE IF NOT EXISTS public.\"{}\" (\n", table_name);
    let mut parts = Vec::new();

    for col in cols_array {
        let name = col["column_name"].as_str().unwrap_or("");
        let mut dtype = col["data_type"].as_str().unwrap_or("text").to_string();
        let udt_name = col["udt_name"].as_str().unwrap_or("text");
        
        if dtype.to_uppercase() == "ARRAY" {
            if udt_name.starts_with('_') {
                dtype = format!("{}[]", &udt_name[1..]);
            } else {
                dtype = format!("{}[]", udt_name);
            }
        } else if dtype.to_uppercase() == "USER-DEFINED" {
            dtype = udt_name.to_string();
        }
        
        let nullable = col["is_nullable"].as_str().unwrap_or("YES");
        let default_val = col["column_default"].as_str();
        
        let mut def = format!("    \"{}\" {}", name, dtype);
        if nullable == "NO" { def.push_str(" NOT NULL"); }
        if let Some(d) = default_val { def.push_str(&format!(" DEFAULT {}", d)); }
        parts.push(def);
    }

    if !pk_cols.is_empty() {
        parts.push(format!("    PRIMARY KEY ({})", pk_cols.join(", ")));
    }

    ddl.push_str(&parts.join(",\n"));
    ddl.push_str("\n);");

    Ok(ddl)
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
async fn get_supabase_functions(project_ref: String, token: String) -> Result<Vec<String>, String> {
    let client = reqwest::Client::new();
    let url = format!("https://api.supabase.com/v1/projects/{}/database/query", project_ref);

    let sql = "
        SELECT pg_get_functiondef(p.oid) as definition
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public'";

    let res = client.post(url)
        .header("Authorization", format!("Bearer {}", token))
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({ "query": sql }))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        let err_text = res.text().await.unwrap_or_else(|_| "Unknown API Error".to_string());
        return Err(format!("Supabase API Hatası (Functions): {}", err_text));
    }

    let rows: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
    let defs = rows.as_array()
        .ok_or("Invalid response format")?
        .iter()
        .map(|r| r["definition"].as_str().unwrap_or("").to_string())
        .filter(|n| !n.is_empty())
        .collect();

    Ok(defs)
}

#[tauri::command]
async fn get_supabase_views(project_ref: String, token: String) -> Result<Vec<(String, String)>, String> {
    let client = reqwest::Client::new();
    let url = format!("https://api.supabase.com/v1/projects/{}/database/query", project_ref);

    let sql = "SELECT viewname, definition FROM pg_views WHERE schemaname = 'public'";

    let res = client.post(url)
        .header("Authorization", format!("Bearer {}", token))
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({ "query": sql }))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        let err_text = res.text().await.unwrap_or_else(|_| "Unknown API Error".to_string());
        return Err(format!("Supabase API Hatası (Views): {}", err_text));
    }

    let rows: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
    let views = rows.as_array()
        .ok_or("Invalid response format")?
        .iter()
        .map(|r| (
            r["viewname"].as_str().unwrap_or("").to_string(),
            r["definition"].as_str().unwrap_or("").to_string()
        ))
        .filter(|(n, _)| !n.is_empty())
        .collect();

    Ok(views)
}

#[tauri::command]
async fn get_supabase_triggers(project_ref: String, token: String) -> Result<Vec<String>, String> {
    let client = reqwest::Client::new();
    let url = format!("https://api.supabase.com/v1/projects/{}/database/query", project_ref);

    let sql = "SELECT pg_get_triggerdef(oid) as definition FROM pg_trigger WHERE tgisinternal = false";

    let res = client.post(url)
        .header("Authorization", format!("Bearer {}", token))
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({ "query": sql }))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        let err_text = res.text().await.unwrap_or_else(|_| "Unknown API Error".to_string());
        return Err(format!("Supabase API Hatası (Triggers): {}", err_text));
    }

    let rows: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
    let defs = rows.as_array()
        .ok_or("Invalid response format")?
        .iter()
        .map(|r| r["definition"].as_str().unwrap_or("").to_string())
        .filter(|n| !n.is_empty())
        .collect();

    Ok(defs)
}

#[tauri::command]
async fn get_supabase_policies(project_ref: String, token: String) -> Result<Vec<(String, String, bool)>, String> {
    let client = reqwest::Client::new();
    let url = format!("https://api.supabase.com/v1/projects/{}/database/query", project_ref);

    // Get policies and table RLS status
    let sql = "
        WITH policies AS (
            SELECT 
                tablename,
                'CREATE POLICY \"' || policyname || '\" ON \"public\".\"' || tablename || 
                '\" FOR ' || cmd || ' TO ' || (SELECT string_agg(r, ',') FROM unnest(roles) r) || 
                ' USING (' || qual || ')' || 
                CASE WHEN with_check IS NOT NULL THEN ' WITH CHECK (' || with_check || ')' ELSE '' END as definition
            FROM pg_policies
            WHERE schemaname = 'public'
        ),
        rls_status AS (
            SELECT relname as table_name, relrowsecurity as rls_enabled
            FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public' AND c.relkind = 'r'
        )
        SELECT r.table_name, p.definition, r.rls_enabled
        FROM rls_status r
        LEFT JOIN policies p ON r.table_name = p.tablename";

    let res = client.post(url)
        .header("Authorization", format!("Bearer {}", token))
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({ "query": sql }))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        let err_text = res.text().await.unwrap_or_else(|_| "Unknown API Error".to_string());
        return Err(format!("Supabase API Hatası (Policies): {}", err_text));
    }

    let rows: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
    let policies = rows.as_array()
        .ok_or("Invalid response format")?
        .iter()
        .map(|r| (
            r["table_name"].as_str().unwrap_or("").to_string(),
            r["definition"].as_str().unwrap_or("").to_string(),
            r["rls_enabled"].as_bool().unwrap_or(false)
        ))
        .collect();

    Ok(policies)
}

#[tauri::command]
async fn get_supabase_tables(project_ref: String, token: String) -> Result<Vec<String>, String> {
    let client = reqwest::Client::new();
    let url = format!("https://api.supabase.com/v1/projects/{}/database/query", project_ref);

    let sql = "SELECT table_name::text FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name";
    
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

    let rows: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
    let table_names = rows.as_array()
        .ok_or("Invalid response format")?
        .iter()
        .map(|r| r["table_name"].as_str().unwrap_or("").to_string())
        .filter(|n| !n.is_empty())
        .collect();

    Ok(table_names)
}

#[tauri::command]
async fn dump_supabase_to_sql(window: tauri::Window, project_ref: String, token: String, output_path: String, tables_only: Option<bool>) -> Result<String, String> {
    let skip_data = tables_only.unwrap_or(false);
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
        SELECT t.table_schema, t.table_name, c.column_name, c.data_type, c.udt_name, c.is_nullable, c.column_default, c.ordinal_position 
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

    // Get Custom ENUM Types
    let _ = window.emit("supabase-dump-progress", "Özel veri tipleri (ENUM) analiz ediliyor...");
    let enum_sql = "
        SELECT n.nspname AS schema, t.typname AS name, array_agg(e.enumlabel ORDER BY e.enumsortorder) AS labels
        FROM pg_type t
        JOIN pg_enum e ON t.oid = e.enumtypid
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname NOT IN ('information_schema', 'pg_catalog', 'pg_toast')
        GROUP BY n.nspname, t.typname";
    
    if let Ok(enums_val) = fetch_supabase_query(&client, &url, &token, enum_sql).await {
        if let Some(enums) = enums_val.as_array() {
            for enm in enums {
                let schema = enm["schema"].as_str().unwrap_or("public");
                let name = enm["name"].as_str().unwrap_or("");
                let labels = enm["labels"].as_array().map(|arr| {
                    arr.iter().map(|l| format!("'{}'", l.as_str().unwrap_or(""))).collect::<Vec<_>>().join(", ")
                }).unwrap_or_default();
                sql_dump.push_str("DO $$ BEGIN\n");
                sql_dump.push_str(&format!("    IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE t.typname = '{}' AND n.nspname = '{}') THEN\n", name, schema));
                sql_dump.push_str(&format!("        CREATE TYPE {}.\"{}\" AS ENUM ({});\n", schema, name, labels));
                sql_dump.push_str("    END IF;\n");
                sql_dump.push_str("END $$;\n");
            }
        }
    }
    sql_dump.push_str("\n");

    // Get SEQUENCES
    let _ = window.emit("supabase-dump-progress", "Sayı dizileri (SEQUENCES) analiz ediliyor...");
    let seq_sql = "
        SELECT sequence_schema, sequence_name, start_value, minimum_value, maximum_value, increment
        FROM information_schema.sequences
        WHERE sequence_schema NOT IN ('information_schema', 'pg_catalog', 'pg_toast')";
    
    if let Ok(seqs_val) = fetch_supabase_query(&client, &url, &token, seq_sql).await {
        if let Some(seqs) = seqs_val.as_array() {
            for seq in seqs {
                let schema = seq["sequence_schema"].as_str().unwrap_or("public");
                let name = seq["sequence_name"].as_str().unwrap_or("");
                let start = seq["start_value"].as_str().unwrap_or("1");
                let inc = seq["increment"].as_str().unwrap_or("1");
                sql_dump.push_str(&format!("CREATE SEQUENCE IF NOT EXISTS {}.\"{}\" START WITH {} INCREMENT BY {};\n", schema, name, start, inc));
            }
        }
    }
    sql_dump.push_str("\n");

    let total_tables = table_order.len();
    for (idx, full_table_name) in table_order.iter().enumerate() {
        let _ = window.emit("supabase-dump-progress", format!("Tablo işleniyor ({}/{}): {}...", idx + 1, total_tables, full_table_name));
        sql_dump.push_str(&format!("CREATE TABLE IF NOT EXISTS {} (\n", full_table_name));
        let cols = &table_columns[full_table_name];
        let mut col_defs = Vec::new();
        let mut col_names = Vec::new();
        for col in cols {
            let name = col["column_name"].as_str().unwrap_or("");
            col_names.push(name.to_string());
            let mut dtype = col["data_type"].as_str().unwrap_or("text").to_string();
            let udt_name = col["udt_name"].as_str().unwrap_or("text");
            
            if dtype.to_uppercase() == "ARRAY" {
                if udt_name.starts_with('_') {
                    dtype = format!("{}[]", &udt_name[1..]);
                } else {
                    dtype = format!("{}[]", udt_name);
                }
            } else if dtype.to_uppercase() == "USER-DEFINED" {
                dtype = udt_name.to_string();
                if dtype == "hstore" { dtype = "text".to_string(); } // Fallback for unsupported extensions
            }
            
            let nullable = col["is_nullable"].as_str().unwrap_or("YES");
            let default_val = col["column_default"].as_str();
            let mut def = format!("    \"{}\" {}", name, dtype);
            if nullable == "NO" { def.push_str(" NOT NULL"); }
            if let Some(d) = default_val { def.push_str(&format!(" DEFAULT {}", d)); }
            col_defs.push(def);
        }
        sql_dump.push_str(&col_defs.join(",\n"));

        // Get Primary Keys for dump
        let pk_sql = format!("
            SELECT kcu.column_name
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
            WHERE tc.table_name = '{}' AND tc.table_schema = '{}' AND tc.constraint_type = 'PRIMARY KEY'
            ORDER BY kcu.ordinal_position", cols[0]["table_name"].as_str().unwrap_or(""), cols[0]["table_schema"].as_str().unwrap_or("public"));
        
        if let Ok(pk_val) = fetch_supabase_query(&client, &url, &token, &pk_sql).await {
            if let Some(pk_array) = pk_val.as_array() {
                if !pk_array.is_empty() {
                    let pks = pk_array.iter()
                        .map(|pk| format!("\"{}\"", pk["column_name"].as_str().unwrap_or("")))
                        .collect::<Vec<_>>()
                        .join(", ");
                    sql_dump.push_str(&format!(",\n    PRIMARY KEY ({})", pks));
                }
            }
        }

        sql_dump.push_str("\n);\n\n");
        if !skip_data {
            let sql_data = format!("SELECT * FROM {}", full_table_name);
            if let Ok(data_rows_val) = fetch_supabase_query(&client, &url, &token, &sql_data).await {
                if let Some(data_rows) = data_rows_val.as_array() {
                    if !data_rows.is_empty() {
                        for row_obj in data_rows {
                            if let Some(row_map) = row_obj.as_object() {
                                let mut values = Vec::new();
                                let mut valid_cols = Vec::new();
                                 for (c_idx, col_name) in col_names.iter().enumerate() {
                                     let val_json = row_map.get(col_name).unwrap_or(&serde_json::Value::Null);
                                     
                                     // Get metadata for this column to determine cast
                                     let col_meta = &cols[c_idx];
                                     let udt_name = col_meta["udt_name"].as_str().unwrap_or("text");
                                     let data_type = col_meta["data_type"].as_str().unwrap_or("text");

                                     let mut val_str = match val_json {
                                         serde_json::Value::Null => "NULL".to_string(),
                                         serde_json::Value::Number(n) => n.to_string(),
                                         serde_json::Value::String(s) => format!("'{}'", s.replace("'", "''")),
                                         serde_json::Value::Bool(b) => b.to_string(),
                                         serde_json::Value::Array(arr) => {
                                             let mut elements = Vec::new();
                                             for item in arr {
                                                 match item {
                                                     serde_json::Value::String(s) => elements.push(format!("'{}'", s.replace("'", "''"))),
                                                     serde_json::Value::Null => elements.push("NULL".to_string()),
                                                     _ => elements.push(item.to_string()),
                                                 }
                                             }
                                             
                                             // Cast the array itself if it's a known type
                                             if data_type.to_uppercase() == "ARRAY" {
                                                let inner_type = if udt_name.starts_with('_') { &udt_name[1..] } else { udt_name };
                                                format!("ARRAY[{}]::{}[]", elements.join(", "), inner_type)
                                             } else {
                                                format!("ARRAY[{}]", elements.join(", "))
                                             }
                                         },
                                         serde_json::Value::Object(_) => format!("'{}'", val_json.to_string().replace("'", "''")),
                                     };

                                     // Apply explicit casting for values that often need them (UUID, JSONB, etc)
                                     if val_json != &serde_json::Value::Null && data_type.to_uppercase() != "ARRAY" {
                                         match udt_name {
                                             "uuid" => { val_str = format!("{}::uuid", val_str); },
                                             "jsonb" => { val_str = format!("{}::jsonb", val_str); },
                                             "json" => { val_str = format!("{}::json", val_str); },
                                             "timestamptz" => { val_str = format!("{}::timestamptz", val_str); },
                                             "timestamp" => { val_str = format!("{}::timestamp", val_str); },
                                             _ => {}
                                         }
                                     }

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
async fn write_bytes(path: String, data: Vec<u8>) -> Result<(), String> {
    if let Some(parent) = std::path::Path::new(&path).parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(&path, &data).map_err(|e| e.to_string())
}

#[tauri::command]
async fn list_system_printers() -> Result<Vec<serde_json::Value>, String> {
    let ps_script = r#"
        Get-Printer | Select-Object Name, PrinterStatus, Type, DriverName, PortName | ConvertTo-Json
    "#;

    let output = Command::new("powershell")
        .args(["-Command", ps_script])
        .creation_flags(0x08000000) 
        .output()
        .map_err(|e| e.to_string())?;

    if output.status.success() {
        let stdout = String::from_utf8_lossy(&output.stdout);
        if stdout.trim().is_empty() {
             return Ok(vec![]);
        }
        let printers: serde_json::Value = serde_json::from_str(&stdout).map_err(|e| e.to_string())?;
        
        if printers.is_array() {
            Ok(printers.as_array().unwrap().clone())
        } else if printers.is_object() {
            Ok(vec![printers])
        } else {
            Ok(vec![])
        }
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

#[tauri::command]
async fn print_html_silent(html: String, printer_name: Option<String>) -> Result<(), String> {
    use std::io::Write;
    use std::fs::File;
    use std::env;
    use std::process::Command;

    // 1. Find msedge.exe
    let mut edge_path = "msedge.exe".to_string();
    let common_paths = [
        r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
        r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
    ];

    let edge_exists = Command::new("where").arg("msedge").output().map(|o| o.status.success()).unwrap_or(false);
    if !edge_exists {
        for path in common_paths {
            if std::path::Path::new(path).exists() {
                edge_path = path.to_string();
                break;
            }
        }
    }

    // 2. Create temporary HTML file
    let temp_dir = env::temp_dir();
    let file_id = uuid::Uuid::new_v4();
    let html_path = temp_dir.join(format!("receipt_{}.html", file_id));
    let pdf_path = temp_dir.join(format!("receipt_{}.pdf", file_id));

    let mut file = File::create(&html_path).map_err(|e| e.to_string())?;
    file.write_all(html.as_bytes()).map_err(|e| e.to_string())?;

    let html_path_str = html_path.to_str().ok_or("Invalid HTML path")?;
    let pdf_path_str = pdf_path.to_str().ok_or("Invalid PDF path")?;

    // 3. PowerShell script to convert to PDF and Print
    let printer_logic = match &printer_name {
        Some(name) => format!(
            r#"
            $printer = '{}'
            # Note: PowerShell doesn't have a built-in silent PDF printer that takes a name easily 
            # without external tools or complex COM objects. 
            # We'll use the 'Print' verb on the default printer for now as it's the most compatible.
            # If a specific printer is needed, we'd ideally use a CLI tool like SumatraPDF or PDFtoPrinter.
            Start-Process -FilePath $pdfPath -Verb Print -Wait
            "#,
            name.replace("'", "''")
        ),
        None => r#"Start-Process -FilePath $pdfPath -Verb Print -Wait"#.to_string(),
    };

    let ps_script = format!(
        r#"
        $edgePath = '{}'
        $htmlPath = '{}'
        $pdfPath = '{}'
        
        # 1. Convert HTML to PDF using Edge (Headless)
        # We use --no-pdf-header-footer to get a clean receipt
        $process = Start-Process $edgePath -ArgumentList "--headless", "--disable-gpu", "--print-to-pdf=$pdfPath", "--no-pdf-header-footer", $htmlPath -PassThru -Wait
        
        if (Test-Path $pdfPath) {{
            # 2. Print the PDF
            {}
        }} else {{
            throw "Failed to generate PDF from HTML. Edge might have failed or input was invalid."
        }}
        "#,
        edge_path.replace("'", "''"),
        html_path_str.replace("'", "''"),
        pdf_path_str.replace("'", "''"),
        printer_logic
    );

    let output = Command::new("powershell")
        .args(["-Command", &ps_script])
        .creation_flags(0x08000000) // CREATE_NO_WINDOW
        .output()
        .map_err(|e| e.to_string())?;

    // Cleanup
    let _ = std::fs::remove_file(&html_path);
    // We don't remove the PDF immediately because the print process might still be reading it
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_secs(60)).await;
        let _ = std::fs::remove_file(pdf_path);
    });

    if output.status.success() {
        Ok(())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        if stderr.is_empty() {
             Err("PowerShell script failed without error output. Check if Microsoft Edge is installed correctly.".to_string())
        } else {
             Err(stderr)
        }
    }
}

#[tauri::command]
async fn verify_license(key: String) -> Result<license::LicenseInfo, String> {
    Ok(license::LicenseManager::check_license(&key))
}

fn check_bootstrap_config(app: &tauri::AppHandle) {
    let bootstrap_path = app.path().app_config_dir().unwrap_or_else(|_| std::path::PathBuf::from("C:\\RetailEx")).join("bootstrap.json");
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
    .plugin(tauri_plugin_shell::init())
    .plugin(tauri_plugin_process::init())
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_http::init())
    .plugin(tauri_plugin_updater::Builder::new().build())
    .setup(|app| {
        let handle = app.handle();
        let _ = config::init_config_db();
        let _ = db::init_db(&handle);
        ensure_bridge_service(&handle);

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
                    
                }

                config.enable_mesh = true;
                let _ = config::save_app_config(app_handle.clone(), config.clone());
                if let Some(vpn_cfg) = config.vpn_config {
                    let vpn_state: tauri::State<vpn::VpnManager> = app_handle.state();
                    let _ = vpn::start_vpn_mesh(app_handle.clone(), vpn_state, vpn_cfg).await;
                }
            }
        });
        Ok(())
    })
    .invoke_handler(tauri::generate_handler![
        check_pg16, install_pg16, get_system_id, get_os_username,
        list_supabase_projects, get_supabase_tables, execute_supabase_sql, get_supabase_table_ddl, get_supabase_table_schema,
        get_supabase_functions, get_supabase_views, get_supabase_triggers, get_supabase_policies,
        dump_supabase_to_sql, pg_execute_file,
        pg_query, pg_execute, read_init_sqls,
        db_ops::create_database, db_ops::run_migrations, db_ops::open_migration_log, db_ops::init_firm_schema, db_ops::init_period_schema, db_ops::check_db_status, db_ops::get_db_version,
        db_ops::pg_execute_supabase_dump,
        sync::send_websocket_message, sync::announce_node, sync::get_last_sync_info,
        verify_license, check_update_status,

        vpn::get_vpn_status, vpn::get_mesh_peers, vpn::generate_vpn_keys, vpn::start_vpn_mesh, vpn::stop_vpn, vpn::update_peer_endpoint,
        vpn_keys::generate_device_bound_vpn_keys, vpn_keys::verify_device_and_decrypt_key,
        maintenance::compact_database, security::verify_token,
        logger::log_from_frontend, logger::log_crud_error,
        config::get_app_config, config::save_app_config,
        config::get_dashboard_shortcuts, config::save_dashboard_shortcuts, config::reset_dashboard_shortcuts,
        backup_service::perform_manual_backup, list_system_printers, write_bytes, print_html_silent,
        mssql::test_mssql_connection, mssql::get_logo_firms, mssql::get_logo_periods, mssql::get_logo_data_preview, mssql::sync_logo_data,
        sync::enable_remote_support,
        bank_ops::get_bank_registers, bank_ops::save_bank_register, bank_ops::get_bank_transactions, bank_ops::save_bank_transaction,
        request_elevation,
        show_touch_keyboard
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}


/// Windows: Dokunmatik klavyeyi (TabTip) açar. Tauri WebView'da input focus'ta klavye açılmıyorsa frontend bu komutu çağırır.
#[tauri::command]
async fn show_touch_keyboard() -> Result<(), String> {
    #[cfg(windows)]
    {
        let tabtip = r"C:\Program Files\Common Files\microsoft shared\ink\TabTip.exe";
        if std::path::Path::new(tabtip).exists() {
            let _ = Command::new(tabtip)
                .creation_flags(0x08000000) // CREATE_NO_WINDOW
                .spawn();
        }
    }
    #[cfg(not(windows))]
    {
        let _ = ();
    }
    Ok(())
}

#[tauri::command]
async fn request_elevation() -> Result<(), String> {
    let current_exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let path = current_exe.to_str().ok_or("Invalid executable path")?;

    println!("Elevation requested for: {}", path);

    // Use PowerShell's Start-Process with -Verb RunAs to trigger UAC
    let script = format!(
        "Start-Process -FilePath '{}' -Verb RunAs",
        path
    );

    Command::new("powershell")
        .args(["-Command", &script])
        .creation_flags(0x08000000) // CREATE_NO_WINDOW
        .spawn()
        .map_err(|e| format!("Failed to spawn elevation process: {}", e))?;

    // The app will relaunch; the current instance should probably stay or close depending on UX
    // For now we just return success and let the frontend handle closing if needed.
    Ok(())
}



fn ensure_bridge_service(handle: &tauri::AppHandle) {
    let handle_clone = handle.clone();
    let resource_path = handle.path().resolve("resources/install-bridge.ps1", BaseDirectory::Resource);
    
    if let Ok(ps_script) = resource_path {
        println!("🛠️ Startup: Checking SQL Bridge Service...");
        tauri::async_runtime::spawn(async move {
            let output = Command::new("powershell")
                .args([
                    "-ExecutionPolicy", "Bypass",
                    "-File", ps_script.to_str().unwrap()
                ])
                .creation_flags(0x08000000) // CREATE_NO_WINDOW
                .output();
            
            match output {
                Ok(_) => println!("✅ Startup: SQL Bridge setup check completed."),
                Err(e) => eprintln!("❌ Startup: SQL Bridge setup failed: {}", e),
            }
        });
    }
}

#[tauri::command]
async fn check_update_status() -> Result<String, String> {
    Ok("Update check not configured".to_string())
}
