use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use std::collections::HashMap;
use std::net::{UdpSocket, SocketAddr};
use boringtun::noise::{Tunn, TunnResult};
use boringtun::x25519::{StaticSecret, PublicKey};
use tauri::State;
use tokio::sync::mpsc;
use std::time::Duration;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PeerConfig {
    pub name: String,
    pub public_key: String,
    pub virtual_ip: String,
    pub endpoint: Option<String>, // External IP:Port
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct VpnConfig {
    pub private_key: String,
    pub public_key: String,
    pub listen_port: u16,
    pub virtual_ip: String,
    pub endpoint: Option<String>,
    pub peers: Vec<PeerConfig>,
    pub enable_discovery: bool,
}

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
        }
    }
}

impl VpnConfig {
    pub fn from_keys(private: String, public: String) -> Self {
        Self {
            private_key: private,
            public_key: public,
            listen_port: 51820,
            virtual_ip: "10.8.0.5".to_string(), // Default ip
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
    state: State<'_, VpnManager>,
    config: VpnConfig
) -> Result<String, String> {
    println!("🚀 Starting VPN Mesh with BoringTun...");
    
    let mut session = state.tunnel.lock().map_err(|e| e.to_string())?;
    *session = Some(VpnSession {
        config: config.clone(),
        tx_bytes: 0,
        rx_bytes: 0,
    });

    // Spawn the core VPN loop
    // In a real implementation, we'd use Wintun to create the adapter here.
    // For now, we spawn the processing loop.
    tokio::spawn(async move {
        if let Err(e) = run_vpn_loop(config).await {
            eprintln!("❌ VPN Loop Error: {}", e);
        }
    });

    Ok("VPN Started".to_string())
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

async fn run_vpn_loop(config: VpnConfig) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    use base64::{Engine as _, engine::general_purpose};

    // 1. Setup BoringTun
    let private_key = general_purpose::STANDARD.decode(&config.private_key)?;
    let static_private: [u8; 32] = private_key.try_into().map_err(|_| "Invalid private key length")?;
    
    // We'll use a Map to handle multiple peers
    // Note: BoringTun's Tunn is usually for a single peer.
    // In a mesh, we might need multiple Tunn instances or a different abstraction.
    let mut peers: HashMap<String, Box<Tunn>> = HashMap::new();
    let mut peer_endpoints: HashMap<String, SocketAddr> = HashMap::new();
    
    for peer in &config.peers {
        let peer_public = general_purpose::STANDARD.decode(&peer.public_key)?;
        let static_public: [u8; 32] = peer_public.try_into().map_err(|_| "Invalid public key length")?;
        
        let tunnel = Tunn::new(
            StaticSecret::from(static_private),
            PublicKey::from(static_public),
            None, // Preshared key
            None, // Keepalive
            1,    // Index
            None  // Netstack
        ).map_err(|e| format!("Failed to create tunnel: {}", e))?;
        
        peers.insert(peer.virtual_ip.clone(), Box::new(tunnel));
        
        if let Some(ep_str) = &peer.endpoint {
            if let Ok(addr) = ep_str.parse::<SocketAddr>() {
                peer_endpoints.insert(peer.virtual_ip.clone(), addr);
            }
        }
    }

    // 2. Bind UDP Socket
    let socket = UdpSocket::bind(format!("0.0.0.0:{}", config.listen_port))?;
    socket.set_nonblocking(true)?;
    
    println!("📡 VPN Socket bound to port {}", config.listen_port);

    // 3. Setup Wintun (Placeholder logic - requires library loading)
    /*
    let adapter = match wintun::load_adapter("RetailEX_VPN") {
        Ok(a) => a,
        Err(_) => wintun::Adapter::create("retailex", "RetailEX VPN", None)?,
    };
    let session = adapter.start_session(wintun::MAX_RING_CAPACITY)?;
    */

    let mut buf_net = [0u8; 2048];
    let mut buf_tun = [0u8; 2048];

    loop {
        // A. Read from UDP (Network -> Tunnel)
        if let Ok((len, addr)) = socket.recv_from(&mut buf_net) {
            // Find which peer this belongs to (usually via some identifier in the packet or mapping)
            // For WireGuard, we'd check the receiver index.
            // Simplified: try all peers for now or use addr mapping
            for tun in peers.values_mut() {
                 let mut out = [0u8; 2048];
                match tun.decapsulate(None, &buf_net[..len], &mut out) {
                    TunnResult::WriteToTunnelV4(packet, _) => {
                         // Write packet to Wintun
                         // session.allocate_send_packet(packet.len() as u16)?.bytes_mut().copy_from_slice(packet);
                    }
                    TunnResult::WriteToNetwork(packet) => {
                         let _ = socket.send_to(packet, addr);
                    }
                    _ => {
                        // The provided snippet was syntactically incorrect here.
                        // Assuming it was meant to be a placeholder or a different context.
                        // Keeping the original `_ => {}` to maintain valid syntax.
                    }
                }
            }
        }

        // B. Read from Wintun (Tunnel -> Network)
        // This would be: let packet = session.receive_packet()?;
        // Then find peer by dest IP in packet headers.
        
        tokio::time::sleep(Duration::from_millis(1)).await;
    }
}
