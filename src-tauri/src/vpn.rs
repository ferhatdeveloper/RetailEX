#![allow(dead_code)]
use serde::{Serialize, Deserialize};
use x25519_dalek::{StaticSecret, PublicKey};
use rand_core::OsRng;
use std::sync::{Mutex, Arc};
use std::thread;
use std::net::UdpSocket;
use tauri::State;
use reqwest;
use chrono;
use tokio;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct PeerConfig {
    pub public_key: String,
    pub endpoint: Option<String>,
    pub virtual_ip: Option<String>,
    pub allowed_ips: Vec<String>,
    pub hostname: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct VpnConfig {
    pub private_key: String,
    pub public_key: String,
    pub listen_port: u16,
    pub virtual_ip: String,
    pub endpoint: Option<String>,
    pub peers: Vec<PeerConfig>,
    pub enable_discovery: bool,
}

pub struct VpnManager {
    pub config: Mutex<Option<VpnConfig>>,
    pub is_running: Mutex<bool>,
    pub stored_peers: Arc<Mutex<Vec<PeerConfig>>>,
}

impl VpnManager {
    pub fn new() -> Self {
        Self {
            config: Mutex::new(None),
            is_running: Mutex::new(false),
            stored_peers: Arc::new(Mutex::new(Vec::new())),
        }
    }
}

#[tauri::command]
pub fn generate_vpn_keys() -> Result<VpnConfig, String> {
    let private_key = StaticSecret::random_from_rng(OsRng);
    let public_key = PublicKey::from(&private_key);

    use base64::{Engine as _, engine::general_purpose};
    let priv_base64 = general_purpose::STANDARD.encode(private_key.to_bytes());
    let pub_base64 = general_purpose::STANDARD.encode(public_key.as_bytes());

    Ok(VpnConfig {
        private_key: priv_base64,
        public_key: pub_base64,
        listen_port: 51820,
        virtual_ip: "10.8.0.2".to_string(),
        endpoint: None,
        peers: Vec::new(),
        enable_discovery: true,
    })
}

#[tauri::command]
pub async fn start_vpn_mesh(
    state: State<'_, VpnManager>,
    config: VpnConfig
) -> Result<String, String> {
    {
        let mut mg = state.config.lock().unwrap();
        *mg = Some(config.clone());
        
        let mut running = state.is_running.lock().unwrap();
        if *running {
            return Ok("VPN zaten çalışıyor.".to_string());
        }
        *running = true;
    }

    let config_clone = config.clone();
    let peers_handle = state.stored_peers.clone();
    
    // Spawn worker thread
    thread::spawn(move || {
        println!("RetailEX Mesh Worker Başlatıldı...");
        
        // Discovery Hub Logic
        if config_clone.enable_discovery {
            let hub_config = config_clone.clone();
            let hub_peers = peers_handle.clone();
            
            tauri::async_runtime::spawn(async move {
                let client = reqwest::Client::new();
                loop {
                    println!("📡 Signaling & Peer Discovery...");
                    
                    // 1. Announce self
                    let endpoint = discover_public_endpoint(hub_config.listen_port).await;
                    let announce_data = serde_json::json!({
                        "public_key": hub_config.public_key,
                        "virtual_ip": hub_config.virtual_ip,
                        "endpoint": endpoint,
                        "timestamp": chrono::Utc::now().to_rfc3339()
                    });

                    let hub_url_announce = "https://hub.retailex.app/announce";
                    let _ = client.post(hub_url_announce).json(&announce_data).send().await;

                    // 2. Fetch others
                    let hub_url_peers = "https://hub.retailex.app/peers";
                    if let Ok(res) = client.get(hub_url_peers).send().await {
                        if let Ok(peers) = res.json::<Vec<PeerConfig>>().await {
                            let mut p_list = hub_peers.lock().unwrap();
                            *p_list = peers;
                        }
                    }

                    tokio::time::sleep(tokio::time::Duration::from_secs(60)).await;
                }
            });
        }

        #[cfg(target_os = "windows")]
        {
            let _ = run_vpn_loop(config_clone);
        }
    });

    Ok("VPN aktif edildi.".to_string())
}

#[derive(Serialize, Deserialize)]
pub struct VpnStatus {
    pub is_running: bool,
    pub virtual_ip: String,
}

#[tauri::command]
pub fn get_vpn_status(state: State<'_, VpnManager>) -> Result<VpnStatus, String> {
    let running = state.is_running.lock().unwrap();
    let config = state.config.lock().unwrap();
    
    Ok(VpnStatus {
        is_running: *running,
        virtual_ip: config.as_ref().map(|c| c.virtual_ip.clone()).unwrap_or_else(|| "N/A".to_string()),
    })
}

#[tauri::command]
pub fn get_mesh_peers(state: State<'_, VpnManager>) -> Result<Vec<PeerConfig>, String> {
    let peers = state.stored_peers.lock().unwrap();
    Ok(peers.clone())
}

pub async fn discover_public_endpoint(listen_port: u16) -> Option<String> {
    let stun_server = "stun.l.google.com:19302";
    let socket = UdpSocket::bind(format!("0.0.0.0:{}", listen_port)).ok()
        .or_else(|| UdpSocket::bind("0.0.0.0:0").ok())?;
    
    match stunclient::StunClient::new(stun_server.parse().ok()?).query_external_address(&socket) {
        Ok(addr) => Some(addr.to_string()),
        Err(_) => None,
    }
}

#[cfg(target_os = "windows")]
fn run_vpn_loop(config: VpnConfig) -> Result<(), Box<dyn std::error::Error>> {
    use std::sync::Arc;
    use std::process::Command;

    println!("🔧 Initializing Wintun adapter for {}...", config.virtual_ip);
    
    // 1. Load Wintun
    let wintun = match unsafe { wintun::load() } {
        Ok(w) => w,
        Err(e) => {
            eprintln!("❌ Failed to load wintun.dll: {}. VPN will not be pingable.", e);
            return Err(e.into());
        }
    };

    // 2. Create Adapter
    let adapter = match wintun::Adapter::create(&wintun, "RetailEX VPN", "Berqenas.cloud VPN", None) {
        Ok(a) => a,
        Err(_) => wintun::Adapter::open(&wintun, "Berqenas.cloud VPN")?
    };

    let adapter = Arc::new(adapter);
    
    // 3. Assign IP Address via Netsh
    // netsh interface ipv4 set address name="RetailEX VPN" static 10.8.0.x 255.255.255.0
    let status = Command::new("netsh")
        .args([
            "interface", "ipv4", "set", "address", 
            "name=RetailEX VPN", 
            "static", &config.virtual_ip, "255.255.255.0"
        ])
        .status()?;

    if status.success() {
        println!("✅ IP {} assigned to RetailEX VPN adapter.", config.virtual_ip);
    } else {
        eprintln!("⚠️ Failed to assign IP via netsh. Admin privileges might be missing.");
    }

    // 4. Start Session
    let session = adapter.start_session(wintun::MAX_RING_CAPACITY)?;
    let session = Arc::new(session);

    println!("🚀 Mesh tunnel active on {}. Now pingable.", config.virtual_ip);

    // 5. Basic Packet Loop (Idle but session keeps interface up)
    loop {
        match session.receive_blocking() {
             Ok(packet) => {
                 // Forwarding logic to Mesh (boringtun) would go here
                 // For now, we drop it or it just allows OS to handle stack
                 drop(packet);
             },
             Err(e) => {
                 eprintln!("Wintun session error: {}", e);
                 break;
             }
        }
    }
    
    Ok(())
}

