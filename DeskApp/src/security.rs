use std::fs::{self};
use std::io::{Read};
use std::sync::{Arc, Mutex};
use tokio::time::{sleep, Duration};

pub struct SecurityService {
    blocked_apps: Arc<Mutex<Vec<String>>>,
    blocked_sites: Arc<Mutex<Vec<String>>>,
    running: Arc<Mutex<bool>>,
}

impl SecurityService {
    pub fn new() -> Self {
        Self {
            blocked_apps: Arc::new(Mutex::new(Vec::new())),
            blocked_sites: Arc::new(Mutex::new(Vec::new())),
            running: Arc::new(Mutex::new(false)),
        }
    }

    pub fn start(&self) {
        let mut running = self.running.lock().unwrap();
        if *running { return; }
        *running = true;

        let blocked_apps = self.blocked_apps.clone();
        let blocked_sites = self.blocked_sites.clone();
        let is_running = self.running.clone();

        tauri::async_runtime::spawn(async move {
            println!("🛡️ Security Service Started (Active Enforcement)...");
            
            loop {
                // check if we should stop
                if !*is_running.lock().unwrap() { break; }

                // 1. Enforce App Blocking
                let apps = blocked_apps.lock().unwrap().clone();
                if !apps.is_empty() {
                     // Check running tasks
                    if let Ok(output) = std::process::Command::new("tasklist").output() {
                        let tasks = String::from_utf8_lossy(&output.stdout).to_lowercase();
                        for app in &apps {
                            if tasks.contains(&app.to_lowercase()) {
                                println!("🚫 Detected prohibited app: {}. Killing...", app);
                                let _ = std::process::Command::new("taskkill")
                                    .args(["/IM", app, "/F"])
                                    .output();
                                
                                // Show "System Administrator Blocked This" Message
                                // Using PowerShell to show a native Windows MessageBox
                                let msg_script = format!(
                                    "Add-Type -AssemblyName PresentationFramework;[System.Windows.MessageBox]::Show('Bu uygulama Sistem Yöneticisi tarafından engellenmiştir: {}', 'Erişim Engellendi 🛡️', 'OK', 'Error')",
                                    app
                                );
                                let _ = std::process::Command::new("powershell")
                                    .args(["-Command", &msg_script])
                                    .spawn(); // Spawn async so it doesn't block the loop
                            }
                        }
                    }
                }

                // 2. Enforce Hosts File (Site Blocking)
                // We re-apply rules every 10 seconds to prevent user tampering
                let sites = blocked_sites.lock().unwrap().clone();
                if !sites.is_empty() {
                    let _ = Self::enforce_hosts_rules(&sites);
                }

                sleep(Duration::from_secs(5)).await;
            }
        });
    }

    pub fn update_policy(&self, apps: Vec<String>, sites: Vec<String>) {
        self.set_blocked_apps(apps);
        self.set_blocked_sites(sites);
    }

    pub fn set_blocked_apps(&self, apps: Vec<String>) {
        let mut a = self.blocked_apps.lock().unwrap();
        *a = apps;
        self.start();
    }

    pub fn set_blocked_sites(&self, sites: Vec<String>) {
        let mut s = self.blocked_sites.lock().unwrap();
        *s = sites;
        self.start();
    }

    fn enforce_hosts_rules(domains: &[String]) -> Result<(), String> {
        let hosts_path = r"C:\Windows\System32\drivers\etc\hosts";
        
        // Read
        let mut content = String::new();
        match fs::File::open(hosts_path) {
            Ok(mut file) => {
                file.read_to_string(&mut content).map_err(|e| e.to_string())?;
            },
            Err(e) => return Err(format!("Read Error: {}", e)),
        }

        let mut _dirty = false;
        let mut new_content = content.clone();

        // Check if our special marker exists
        if !new_content.contains("# RETAILEX SECURITY BLOCK START") {
            new_content.push_str("\n\n# RETAILEX SECURITY BLOCK START\n");
            new_content.push_str("# RETAILEX SECURITY BLOCK END\n");
            _dirty = true;
        }

        // We will reconstruct the block between markers
        let start_marker = "# RETAILEX SECURITY BLOCK START";
        let end_marker = "# RETAILEX SECURITY BLOCK END";

        if let (Some(start_idx), Some(end_idx)) = (new_content.find(start_marker), new_content.find(end_marker)) {
             let prefix = &new_content[..start_idx + start_marker.len()];
             let suffix = &new_content[end_idx..];
             
             let mut block_content = String::from("\n");
             for domain in domains {
                 block_content.push_str(&format!("127.0.0.1 {}\n", domain));
                 block_content.push_str(&format!("127.0.0.1 www.{}\n", domain));
             }

             // Compare with existing 'inner' content to avoid disk writes if no change
             let current_inner = &new_content[start_idx + start_marker.len()..end_idx];
             if current_inner != block_content {
                 let final_content = format!("{}{}{}", prefix, block_content, suffix);
                 
                 // Write Back
                 // Requires Admin Privileges!
                 match fs::write(hosts_path, final_content) {
                     Ok(_) => {}, // Success
                     Err(e) => eprintln!("Failed to write hosts (Admin required?): {}", e),
                 }
             }
        }

        Ok(())
    }
}

#[tauri::command]
pub async fn verify_token(token: String) -> Result<bool, String> {
    // Basic verification logic
    Ok(!token.is_empty())
}
