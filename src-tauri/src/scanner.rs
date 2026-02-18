use tokio::net::TcpListener;
use tokio_tungstenite::accept_async;
use futures::{StreamExt, SinkExt};
use serde::{Deserialize, Serialize};
use std::process::Command;
use std::sync::Arc;
use tokio::sync::Mutex;
use std::time::Duration;
use base64::{Engine as _, engine::general_purpose};
use tokio_tungstenite::tungstenite::Message;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ScannerInfo {
    pub id: String,
    pub name: String,
    pub status: String,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "command")]
enum ScannerCommand {
    #[serde(rename = "list_scanners")]
    ListScanners,
    #[serde(rename = "refresh_scanners")]
    RefreshScanners,
    #[serde(rename = "scan")]
    Scan {
        #[serde(rename = "scannerId")]
        scanner_id: String,
        settings: Option<ScanSettings>,
    },
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct ScanSettings {
    pub resolution: Option<u32>,
    pub format: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(tag = "type")]
enum ScannerResponse {
    #[serde(rename = "scanner_list")]
    ScannerList { scanners: Vec<ScannerInfo> },
    #[serde(rename = "scan_progress")]
    ScanProgress { progress: u32, message: String },
    #[serde(rename = "scan_complete")]
    ScanComplete {
        #[serde(rename = "dataUrl")]
        data_url: String,
        size: usize,
        format: String,
        resolution: u32,
    },
    #[serde(rename = "scan_error")]
    ScanError { error: String },
    #[serde(rename = "error")]
    Error { message: String },
}

pub struct ScannerManager {
    scanners: Arc<Mutex<Vec<ScannerInfo>>>,
}

impl ScannerManager {
    pub fn new() -> Self {
        Self {
            scanners: Arc::new(Mutex::new(Vec::new())),
        }
    }

    pub async fn start_server(self: Arc<Self>) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let addr = "127.0.0.1:9999";
        let listener = TcpListener::bind(&addr).await?;
        println!("📡 Scanner Service listening on: ws://{}", addr);

        // Initial detection
        let manager_clone = self.clone();
        tokio::spawn(async move {
            let _ = manager_clone.detect_scanners().await;
        });

        // Periodic detection
        let manager_clone = self.clone();
        tokio::spawn(async move {
            loop {
                tokio::time::sleep(Duration::from_secs(60)).await;
                let _ = manager_clone.detect_scanners().await;
            }
        });

        while let Ok((stream, _)) = listener.accept().await {
            let manager = self.clone();
            tokio::spawn(async move {
                if let Err(e) = manager.handle_connection(stream).await {
                    eprintln!("Error handling scanner connection: {}", e);
                }
            });
        }

        Ok(())
    }

    async fn handle_connection(&self, stream: tokio::net::TcpStream) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let ws_stream = accept_async(stream).await?;
        let (mut ws_sender, mut ws_receiver) = ws_stream.split();

        while let Some(msg) = ws_receiver.next().await {
            let msg = msg?;
            if msg.is_text() {
                let text = msg.to_text()?;
                match serde_json::from_str::<ScannerCommand>(text) {
                    Ok(cmd) => match cmd {
                        ScannerCommand::ListScanners => {
                            let scanners = self.scanners.lock().await.clone();
                            let resp = ScannerResponse::ScannerList { scanners };
                            let json = serde_json::to_string(&resp)?;
                            ws_sender.send(Message::Text(json)).await?;
                        }
                        ScannerCommand::RefreshScanners => {
                            let scanners = self.detect_scanners().await?;
                            let resp = ScannerResponse::ScannerList { scanners };
                            let json = serde_json::to_string(&resp)?;
                            ws_sender.send(Message::Text(json)).await?;
                        }
                        ScannerCommand::Scan { scanner_id, settings } => {
                            let settings = settings.unwrap_or(ScanSettings { resolution: Some(300), format: Some("jpg".to_string()) });
                            
                            // Send initial progress
                            let prog = ScannerResponse::ScanProgress { progress: 10, message: "TaranÄ±yor...".to_string() };
                            let json_prog = serde_json::to_string(&prog)?;
                            ws_sender.send(Message::Text(json_prog)).await?;

                            match self.perform_scan(&scanner_id, &settings).await {
                                Ok((data, size)) => {
                                    let b64 = general_purpose::STANDARD.encode(data);
                                    let data_url = format!("data:image/{};base64,{}", settings.format.as_ref().unwrap_or(&"jpg".to_string()), b64);
                                    let resp = ScannerResponse::ScanComplete {
                                        data_url,
                                        size,
                                        format: settings.format.unwrap_or("jpg".to_string()),
                                        resolution: settings.resolution.unwrap_or(300),
                                    };
                                    let json_resp = serde_json::to_string(&resp)?;
                                    ws_sender.send(Message::Text(json_resp)).await?;
                                }
                                Err(e) => {
                                    let resp = ScannerResponse::ScanError { error: e.to_string() };
                                    let json_err = serde_json::to_string(&resp)?;
                                    ws_sender.send(Message::Text(json_err)).await?;
                                }
                            }
                        }
                    },
                    Err(e) => {
                        let resp = ScannerResponse::Error { message: format!("Invalid command: {}", e) };
                        let json_err = serde_json::to_string(&resp)?;
                        ws_sender.send(Message::Text(json_err)).await?;
                    }
                }
            }
        }

        Ok(())
    }

    async fn detect_scanners(&self) -> Result<Vec<ScannerInfo>, Box<dyn std::error::Error + Send + Sync>> {
        let ps_script = r#"
            Add-Type -AssemblyName System.Drawing
            try {
              $deviceManager = New-Object -ComObject WIA.DeviceManager
              $devices = $deviceManager.DeviceInfos
              
              $scanners = @()
              foreach ($device in $devices) {
                if ($device.Type -eq 1) {
                  $scanners += @{
                    id = $device.DeviceID
                    name = $device.Properties("Name").Value
                    status = "ready"
                  }
                }
              }
              
              $scanners | ConvertTo-Json -Compress
            } catch {
              Write-Output "[]"
            }
        "#;

        let output = Command::new("powershell")
            .args(["-Command", ps_script])
            .output()?;

        let stdout = String::from_utf8_lossy(&output.stdout);
        let scanners: Vec<ScannerInfo> = if stdout.trim().is_empty() || stdout.trim() == "[]" {
            Vec::new()
        } else {
            // PowerShell might return a single object instead of an array if only one scanner is found
            if stdout.trim().starts_with('{') {
                vec![serde_json::from_str(&stdout.trim())?]
            } else {
                serde_json::from_str(&stdout.trim())?
            }
        };

        let mut lock = self.scanners.lock().await;
        *lock = scanners.clone();
        
        Ok(scanners)
    }

    async fn perform_scan(&self, scanner_id: &str, settings: &ScanSettings) -> Result<(Vec<u8>, usize), Box<dyn std::error::Error + Send + Sync>> {
        let temp_dir = std::env::temp_dir();
        let file_name = format!("scan_{}.jpg", chrono::Local::now().timestamp_millis());
        let output_path = temp_dir.join(file_name);
        let output_path_str = output_path.to_str().ok_or("Invalid output path")?;

        let resolution = settings.resolution.unwrap_or(300);

        let ps_script = format!(r#"
            Add-Type -AssemblyName System.Drawing
            try {{
              $deviceManager = New-Object -ComObject WIA.DeviceManager
              $device = $null
              
              foreach ($d in $deviceManager.DeviceInfos) {{
                if ($d.DeviceID -eq "{}") {{
                  $device = $d.Connect()
                  break
                }}
              }}
              
              if ($device -eq $null) {{
                Write-Error "TarayÄ±cÄ± bulunamadÄ±"
                exit 1
              }}
              
              $item = $device.Items(1)
              $item.Properties("6146").Value = {}
              $item.Properties("6147").Value = {}
              
              $image = $item.Transfer("{{B96B3CAE-0728-11D3-9D7B-0000F81EF32E}}")
              $image.SaveFile("{}")
              
              Write-Output "SUCCESS"
            }} catch {{
              Write-Error $_.Exception.Message
              exit 1
            }}
        "#, scanner_id, resolution, resolution, output_path_str.replace('\\', "\\\\"));

        let output = Command::new("powershell")
            .args(["-Command", &ps_script])
            .output()?;

        let stdout = String::from_utf8_lossy(&output.stdout);
        
        if stdout.contains("SUCCESS") && output_path.exists() {
            let data = std::fs::read(&output_path)?;
            let size = data.len();
            let _ = std::fs::remove_file(&output_path);
            Ok((data, size))
        } else {
            let stderr = String::from_utf8_lossy(&output.stderr);
            Err(format!("Scan failed: {} {}", stdout, stderr).into())
        }
    }
}
