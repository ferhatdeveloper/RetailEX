
use tokio::io::AsyncWriteExt;
use std::process::Command;

pub struct RemoteMaintenanceService;

impl RemoteMaintenanceService {
    
    /// Executes a SQL command directly on the local database
    pub async fn execute_sql(sql: String) -> Result<String, String> {
        // Connection string hardcoded for now, ideal to load from config
        let (client, connection) = tokio_postgres::connect(
            "host=localhost user=postgres password=Yq7xwQpt6c dbname=retailex_local", 
            tokio_postgres::NoTls
        ).await.map_err(|e| e.to_string())?;

        tauri::async_runtime::spawn(async move {
            if let Err(e) = connection.await {
                eprintln!("Maintenance DB connection error: {}", e);
            }
        });
        
        // Use batch_execute for multiple statements
        client.batch_execute(&sql).await.map_err(|e| e.to_string())?;
        Ok("SQL Executed Successfully".to_string())
    }

    /// Downloads and installs an update from a URL
    pub async fn update_app(url: String, version: String) -> Result<String, String> {
        let file_name = format!("RetailEx_Setup_{}.exe", version);
        let temp_dir = std::env::temp_dir();
        let file_path = temp_dir.join(&file_name);

        println!("⬇️ Downloading update from: {}", url);

        let response = reqwest::get(&url)
            .await
            .map_err(|e| format!("Download failed: {}", e))?;

        if !response.status().is_success() {
            return Err(format!("Download failed with status: {}", response.status()));
        }

        let bytes = response.bytes().await.map_err(|e| e.to_string())?;
        let mut file = tokio::fs::File::create(&file_path).await.map_err(|e| e.to_string())?;
        file.write_all(&bytes).await.map_err(|e| e.to_string())?;

        println!("📦 Installing: {:?}", file_path);

        // Run installer silently
        // /SILENT or /VERYSILENT depends on Inno Setup config. Assuming standard args.
        Command::new(&file_path)
            .args(["/SILENT", "/CLOSEAPPLICATIONS", "/RESTARTAPPLICATIONS"])
            .spawn()
            .map_err(|e| format!("Failed to start installer: {}", e))?;

        Ok("Update Process Started".to_string())
    }
}

#[tauri::command]
pub async fn compact_database() -> Result<String, String> {
    // Placeholder for VACUUM FULL or similar maintenance
    RemoteMaintenanceService::execute_sql("VACUUM ANALYZE".to_string()).await
}
