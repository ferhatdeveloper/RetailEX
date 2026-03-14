use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use std::collections::HashMap;
use std::net::{UdpSocket, SocketAddr};
use boringtun::noise::{Tunn, TunnResult};
use boringtun::x25519::{StaticSecret, PublicKey};
use tauri::State;
use std::time::Duration;
use std::sync::atomic::{AtomicBool, Ordering};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PeerConfig {
    pub name: String,
    pub public_key: String,
    pub virtual_ip: String,
    pub endpoint: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct VpnConfig {
    #[serde(default)]
    pub private_key: String,
    #[serde(default)]
    pub public_key: String,
    #[serde(default = "default_listen_port")]
    pub listen_port: u16,
    #[serde(default = "default_vpn_ip")]
    pub virtual_ip: String,
    #[serde(default)]
    pub endpoint: Option<String>,
    #[serde(default)]
    pub peers: Vec<PeerConfig>,
    #[serde(default = "default_enable_discovery")]
    pub enable_discovery: bool,
}

fn default_vpn_ip() -> String { "10.8.0.5".to_string() }

fn default_listen_port() -> u16 { 51820 }
fn default_enable_discovery() -> bool { true }

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct VpnStatus {
    pub is_connected: bool,
    pub virtual_ip: String,
    pub public_key: String,
    pub tx_bytes: u64,
    pub rx_bytes: u64,
}

pub struct VpnManager {
    pub tunnel: Arc<Mutex<Option<VpnSession>>>,
    pub running: Arc<AtomicBool>,
    pub peer_endpoints: Arc<Mutex<HashMap<String, SocketAddr>>>,
}

pub struct VpnSession {
    pub config: VpnConfig,
    pub tx_bytes: u64,
    pub rx_bytes: u64,
}

impl VpnManager {
    pub fn new() -> Self {
        Self {
            tunnel: Arc::new(Mutex::new(None)),
            running: Arc::new(AtomicBool::new(false)),
            peer_endpoints: Arc::new(Mutex::new(HashMap::new())),
        }
    }
}

impl VpnConfig {
    pub fn from_keys(private: String, public: String) -> Self {
        Self {
            private_key: private,
            public_key: public,
            listen_port: 51820,
            virtual_ip: "10.8.0.5".to_string(),
            endpoint: None,
            peers: vec![],
            enable_discovery: true,
        }
    }
}

#[tauri::command]
pub fn generate_vpn_keys() -> Result<serde_json::Value, String> {
    use x25519_dalek::{StaticSecret, PublicKey};
    use rand_core::OsRng;
    use base64::{Engine as _, engine::general_purpose};

    let secret = StaticSecret::random_from_rng(OsRng);
    let public = PublicKey::from(&secret);

    Ok(serde_json::json!({
        "private_key": general_purpose::STANDARD.encode(secret.to_bytes()),
        "public_key": general_purpose::STANDARD.encode(public.as_bytes())
    }))
}

#[tauri::command]
pub async fn start_vpn_mesh(
    app_handle: tauri::AppHandle,
    state: State<'_, VpnManager>,
    config: VpnConfig
) -> Result<String, String> {
    if state.running.load(Ordering::SeqCst) {
        return Err("VPN is already running".to_string());
    }

    println!("🚀 Starting VPN Mesh with BoringTun and Wintun...");
    
    let mut session = state.tunnel.lock().map_err(|e| e.to_string())?;
    *session = Some(VpnSession {
        config: config.clone(),
        tx_bytes: 0,
        rx_bytes: 0,
    });

    state.running.store(true, Ordering::SeqCst);
    let running_flag = state.running.clone();
    let endpoints = state.peer_endpoints.clone();

    tokio::spawn(async move {
        if let Err(e) = run_vpn_loop(app_handle, config, running_flag, endpoints).await {
            eprintln!("❌ VPN Loop Error: {}", e);
        }
    });

    Ok("VPN Started".to_string())
}

#[tauri::command]
pub async fn update_peer_endpoint(
    state: State<'_, VpnManager>,
    virtual_ip: String,
    endpoint: String
) -> Result<(), String> {
    let addr = endpoint.parse::<SocketAddr>().map_err(|_| "Invalid endpoint format")?;
    let mut eps = state.peer_endpoints.lock().map_err(|_| "Lock error")?;
    eps.insert(virtual_ip.clone(), addr);
    println!("🔄 Updated endpoint for {}: {}", virtual_ip, endpoint);
    Ok(())
}

#[tauri::command]
pub async fn stop_vpn(state: State<'_, VpnManager>) -> Result<String, String> {
    state.running.store(false, Ordering::SeqCst);
    let mut session = state.tunnel.lock().map_err(|e| e.to_string())?;
    *session = None;
    Ok("VPN Stopped".to_string())
}

#[tauri::command]
pub fn get_vpn_status(state: State<'_, VpnManager>) -> Result<VpnStatus, String> {
    let session = state.tunnel.lock().map_err(|e| e.to_string())?;
    if let Some(s) = &*session {
        Ok(VpnStatus {
            is_connected: true,
            virtual_ip: s.config.virtual_ip.clone(),
            public_key: s.config.public_key.clone(),
            tx_bytes: s.tx_bytes,
            rx_bytes: s.rx_bytes,
        })
    } else {
        Ok(VpnStatus {
            is_connected: false,
            virtual_ip: "".to_string(),
            public_key: "".to_string(),
            tx_bytes: 0,
            rx_bytes: 0,
        })
    }
}

#[tauri::command]
pub fn get_mesh_peers(state: State<'_, VpnManager>) -> Result<Vec<PeerConfig>, String> {
    let session = state.tunnel.lock().map_err(|e| e.to_string())?;
    if let Some(s) = &*session {
        Ok(s.config.peers.clone())
    } else {
        Ok(vec![])
    }
}

async fn run_vpn_loop(
    app_handle: tauri::AppHandle,
    config: VpnConfig, 
    running: Arc<AtomicBool>,
    peer_endpoints_shared: Arc<Mutex<HashMap<String, SocketAddr>>>
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    use base64::{Engine as _, engine::general_purpose};
    use tauri::Emitter;

    // 1. Setup BoringTun
    let private_key_bytes = general_purpose::STANDARD.decode(&config.private_key)?;
    let static_private: [u8; 32] = private_key_bytes.try_into().map_err(|_| "Invalid private key length")?;
    
    let mut peers: HashMap<String, Box<Tunn>> = HashMap::new();
    
    // Initial endpoints from config
    {
        let mut eps = peer_endpoints_shared.lock().unwrap();
        for (i, peer) in config.peers.iter().enumerate() {
            let peer_public_bytes = general_purpose::STANDARD.decode(&peer.public_key)?;
            let static_public: [u8; 32] = peer_public_bytes.try_into().map_err(|_| "Invalid public key length")?;
            
            let tunnel = Tunn::new(
                StaticSecret::from(static_private),
                PublicKey::from(static_public),
                None, None, (i + 1) as u32, None
            ).map_err(|e| format!("Failed to create tunnel: {}", e))?;
            
            peers.insert(peer.virtual_ip.clone(), Box::new(tunnel));
            
            if let Some(ep_str) = &peer.endpoint {
                if let Ok(addr) = ep_str.parse::<SocketAddr>() {
                    eps.insert(peer.virtual_ip.clone(), addr);
                }
            }
        }
    }

    // 2. Setup Wintun
    let wintun_path = "wintun.dll";
    let wintun = unsafe { wintun::load_from_path(wintun_path).map_err(|e| format!("Failed to load wintun.dll: {}. Make sure it's in the app directory.", e))? };
    
    // Try to open existing adapter first, fallback to create
    let adapter = match wintun::Adapter::open(&wintun, "RetailEX") {
        Ok(a) => {
            println!("✅ Existing RetailEX Wintun adapter found and opened.");
            a
        },
        Err(_) => {
            println!("ℹ️ Creating new RetailEX Wintun adapter...");
            wintun::Adapter::create(&wintun, "RetailEX", "RetailEX VPN", None)
                .map_err(|e| {
                    let err_msg = e.to_string();
                    if err_msg.contains("Access is denied") || err_msg.contains("Failed to create adapter") {
                        let _ = app_handle.emit("vpn-permission-error", "Administrator yetkisi gerekiyor.");
                        "❌ Wintun Adapter HATASI: Yönetici (Administrator) yetkisi gerekiyor! Lütfen uygulamayı yönetici olarak çalıştırın.".to_string()
                    } else {
                        format!("❌ Wintun Adapter oluşturulamadı: {}", err_msg)
                    }
                })?
        }
    };
    
    let set_ip_cmd = format!("netsh interface ip set address name=\"RetailEX\" static {} 255.255.255.0", config.virtual_ip);
    let output = std::process::Command::new("powershell").args(["-Command", &set_ip_cmd]).output();
    if let Ok(out) = output {
        if !out.status.success() {
            let err = String::from_utf8_lossy(&out.stderr);
            eprintln!("⚠️ IP assignment warning: {}", err);
            if err.contains("Elevation") || err.contains("Yükseltme") {
                let _ = app_handle.emit("vpn-permission-error", "IP Yapılandırma için yönetici yetkisi gerekiyor.");
                return Err("❌ IP Yapılandırma HATASI: Yönetici yetkisi gerekiyor.".into());
            }
        }
    }

    let session = Arc::new(adapter.start_session(wintun::MAX_RING_CAPACITY).map_err(|e| format!("Failed to start Wintun session: {}", e))?);
    println!("✅ Wintun adapter ready on {}", config.virtual_ip);

    // 3. Bind UDP Socket
    let socket = Arc::new(UdpSocket::bind(format!("0.0.0.0:{}", config.listen_port))?);
    socket.set_nonblocking(true)?;
    
    let peers_mutex = Arc::new(Mutex::new(peers));

    // A. Network TO Tunnel (UDP -> Wintun)
    let running_a = running.clone();
    let socket_a = socket.clone();
    let session_a = session.clone();
    let peers_a = peers_mutex.clone();
    
    tokio::spawn(async move {
        let mut buf_net = [0u8; 2048];
        while running_a.load(Ordering::SeqCst) {
            if let Ok((len, addr)) = socket_a.recv_from(&mut buf_net) {
                let mut peer_map = peers_a.lock().unwrap();
                for tun in peer_map.values_mut() {
                    let mut out = [0u8; 2048];
                    match tun.decapsulate(None, &buf_net[..len], &mut out) {
                        TunnResult::WriteToTunnelV4(packet, _) => {
                            if let Ok(mut wpacket) = session_a.allocate_send_packet(packet.len() as u16) {
                                wpacket.bytes_mut().copy_from_slice(packet);
                                session_a.send_packet(wpacket);
                            }
                        }
                        TunnResult::WriteToNetwork(packet) => {
                            let _ = socket_a.send_to(packet, addr);
                        }
                        _ => {}
                    }
                }
            }
            tokio::time::sleep(Duration::from_micros(100)).await;
        }
    });

    // B. Tunnel TO Network (Wintun -> UDP)
    let running_b = running.clone();
    let socket_b = socket.clone();
    let session_b = session.clone();
    let peers_b = peers_mutex.clone();
    let endpoints_shared_b = peer_endpoints_shared.clone();
    
    while running_b.load(Ordering::SeqCst) {
        if let Ok(packet) = session_b.receive_blocking() {
            let bytes = packet.bytes();
            if bytes.len() >= 20 {
                let dest_ip = format!("{}.{}.{}.{}", bytes[16], bytes[17], bytes[18], bytes[19]);
                
                let mut peer_map = peers_b.lock().unwrap();
                if let Some(tun) = peer_map.get_mut(&dest_ip) {
                    let eps = endpoints_shared_b.lock().unwrap();
                    if let Some(endpoint) = eps.get(&dest_ip) {
                        let mut out = [0u8; 2048];
                        match tun.encapsulate(bytes, &mut out) {
                            TunnResult::WriteToNetwork(enc_packet) => {
                                let _ = socket_b.send_to(enc_packet, endpoint);
                            }
                            _ => {}
                        }
                    }
                }
            }
        }
        tokio::time::sleep(Duration::from_micros(100)).await;
    }

    Ok(())
}
