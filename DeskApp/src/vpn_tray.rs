#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::ffi::OsString;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use serde::{Serialize, Deserialize};
use tokio::time::sleep;
use windows_service::{
    define_windows_service,
    service::{
        ServiceControl, ServiceControlAccept, ServiceExitCode, ServiceState, ServiceStatus,
        ServiceType, ServiceAccess, ServiceStartType, ServiceErrorControl, ServiceInfo,
    },
    service_control_handler::{self, ServiceControlHandlerResult},
    service_dispatcher,
    service_manager::{ServiceManager, ServiceManagerAccess},
};

// Shared VPN module
#[path = "vpn.rs"]
mod vpn;

#[path = "config.rs"]
mod config;

use vpn::{VpnConfig, VpnManager};

const SERVICE_NAME: &str = "RetailEX_VPN";
const DISPLAY_NAME: &str = "RetailEX VPN Service";

// Application state
#[derive(Clone)]
struct AppState {
    vpn_manager: Arc<VpnManager>,
    is_connected: Arc<Mutex<bool>>,
    peers: Arc<Mutex<Vec<PeerInfo>>>,
    my_ip: Arc<Mutex<String>>,
}

#[derive(Clone, Serialize, Deserialize, Debug)]
struct PeerInfo {
    name: String,
    ip: String,
    download_mb: f64,
    upload_mb: f64,
    latency_ms: u32,
    is_online: bool,
}

impl AppState {
    fn new() -> Self {
        Self {
            vpn_manager: Arc::new(VpnManager::new()),
            is_connected: Arc::new(Mutex::new(false)),
            peers: Arc::new(Mutex::new(Vec::new())),
            my_ip: Arc::new(Mutex::new("10.8.0.5".to_string())),
        }
    }

    fn update_connection_status(&self, connected: bool) {
        if let Ok(mut status) = self.is_connected.lock() {
            *status = connected;
        }
    }

    fn update_peers(&self, new_peers: Vec<PeerInfo>) {
        if let Ok(mut peers) = self.peers.lock() {
            *peers = new_peers;
        }
    }

    fn get_peers(&self) -> Vec<PeerInfo> {
        match self.peers.lock() {
            Ok(peers) => peers.clone(),
            Err(_) => Vec::new(),
        }
    }

    fn is_connected(&self) -> bool {
        match self.is_connected.lock() {
            Ok(status) => *status,
            Err(_) => false,
        }
    }

    fn get_my_ip(&self) -> String {
        match self.my_ip.lock() {
            Ok(ip) => ip.clone(),
            Err(_) => "Unknown".to_string(),
        }
    }
}

#[path = "windows_service_install.rs"]
mod windows_service_install;

// Main entry point
fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<String> = std::env::args().collect();
    match windows_service_install::scan_bootstrap_service_cmd(&args) {
        Some(windows_service_install::BootstrapServiceCmd::Console) => {
            let rt = tokio::runtime::Runtime::new()?;
            rt.block_on(run_app_logic());
            return Ok(());
        }
        Some(windows_service_install::BootstrapServiceCmd::Install) => return install_service(),
        Some(windows_service_install::BootstrapServiceCmd::Uninstall) => return uninstall_service(),
        None => {}
    }

    if args.len() > 1 {
        println!("Usage: RetailEX_VPN.exe [--install | --uninstall | --console]");
        return Ok(());
    }

    service_dispatcher::start(SERVICE_NAME, ffi_service_main).map_err(|e| e.into())
}

fn install_service() -> Result<(), Box<dyn std::error::Error>> {
    let manager = ServiceManager::local_computer(
        None::<&str>,
        ServiceManagerAccess::CONNECT | ServiceManagerAccess::CREATE_SERVICE,
    )
    .map_err(|e| {
        windows_service_install::log_service_install_failure("RetailEX_VPN", &e);
        Box::new(e) as Box<dyn std::error::Error>
    })?;
    let exe_path = std::env::current_exe().map_err(|e| {
        windows_service_install::log_install_any_error("RetailEX_VPN", &e);
        Box::new(e) as Box<dyn std::error::Error>
    })?;
    
    let info = ServiceInfo {
        name: SERVICE_NAME.to_string().into(),
        display_name: DISPLAY_NAME.to_string().into(),
        service_type: ServiceType::OWN_PROCESS,
        start_type: ServiceStartType::AutoStart,
        error_control: ServiceErrorControl::Normal,
        executable_path: exe_path,
        launch_arguments: Vec::new(),
        dependencies: Vec::new(),
        account_name: None,
        account_password: None,
    };

    match windows_service_install::create_service_or_accept_exists(
        &manager,
        &info,
        ServiceAccess::all(),
        "RetailEX_VPN",
    )? {
        windows_service_install::CreateServiceOutcome::Created => {
            println!("VPN Service installed successfully.");
        }
        windows_service_install::CreateServiceOutcome::AlreadyExisted => {
            println!("VPN Service already exists.");
        }
    }
    Ok(())
}

fn uninstall_service() -> Result<(), Box<dyn std::error::Error>> {
    let manager = ServiceManager::local_computer(None::<&str>, ServiceManagerAccess::CONNECT)?;
    let service = manager.open_service(SERVICE_NAME, ServiceAccess::DELETE)?;
    service.delete()?;
    println!("VPN Service uninstalled successfully.");
    Ok(())
}

define_windows_service!(ffi_service_main, my_service_main);

fn my_service_main(_arguments: Vec<OsString>) {
    let (shutdown_tx, shutdown_rx) = std::sync::mpsc::channel();

    let event_handler = move |control_event| -> ServiceControlHandlerResult {
        match control_event {
            ServiceControl::Stop | ServiceControl::Interrogate => {
                shutdown_tx.send(()).ok();
                ServiceControlHandlerResult::NoError
            }
            _ => ServiceControlHandlerResult::NotImplemented,
        }
    };

    let status_handle = match service_control_handler::register(SERVICE_NAME, event_handler) {
        Ok(h) => h,
        Err(_) => return,
    };

    let _ = status_handle.set_service_status(ServiceStatus {
        service_type: ServiceType::OWN_PROCESS,
        current_state: ServiceState::Running,
        controls_accepted: ServiceControlAccept::STOP,
        exit_code: ServiceExitCode::Win32(0),
        checkpoint: 0,
        wait_hint: Duration::default(),
        process_id: None,
    });

    let rt = tokio::runtime::Runtime::new().unwrap();
    rt.block_on(async {
        let app_handle = tokio::spawn(run_app_logic());
        
        loop {
            if shutdown_rx.try_recv().is_ok() {
                break;
            }
            tokio::time::sleep(Duration::from_millis(500)).await;
        }
        
        app_handle.abort();
    });

    let _ = status_handle.set_service_status(ServiceStatus {
        service_type: ServiceType::OWN_PROCESS,
        current_state: ServiceState::Stopped,
        controls_accepted: ServiceControlAccept::empty(),
        exit_code: ServiceExitCode::Win32(0),
        checkpoint: 0,
        wait_hint: Duration::default(),
        process_id: None,
    });
}

async fn run_app_logic() {
    clear_screen();
    print_header();
    
    let state = AppState::new();
    
    // Load VPN configuration
    let config = load_vpn_config().await;
    
    if let Some(vpn_config) = config {
        println!("✓ VPN Configuration loaded");
        
        // Start VPN connection in background
        let state_clone = state.clone();
        tokio::spawn(async move {
            start_vpn_connection(state_clone, vpn_config).await;
        });
    } else {
        println!("⚠️  No VPN configuration found");
        println!("   VPN will remain disconnected");
    }

    // Start UI update loop (only if in console) - actually let's keep it running for logs
    let state_clone = state.clone();
    tokio::spawn(async move {
        ui_update_loop(state_clone).await;
    });

    // Start status monitoring loop
    monitor_vpn_status(state).await;
}

// Clear screen
fn clear_screen() {
    print!("\x1B[2J\x1B[1;1H");
}

// Print header
fn print_header() {
    println!("╔═══════════════════════════════════════════════════════════════╗");
    println!("║           🌐 RetailEX VPN Manager v0.2.1                     ║");
    println!("║           Mesh Network Monitoring & Management               ║");
    println!("╚═══════════════════════════════════════════════════════════════╝");
    println!();
}

// UI update loop
async fn ui_update_loop(state: AppState) {
    loop {
        sleep(Duration::from_secs(3)).await;
        
        // Clear and redraw
        clear_screen();
        print_header();
        
        // Connection status
        if state.is_connected() {
            println!("📡 Status: \x1b[32m●\x1b[0m CONNECTED");
            println!("🌐 My IP: {}", state.get_my_ip());
            println!();
            
            let peers = state.get_peers();
            println!("┌─────────────────────────────────────────────────────────────┐");
            println!("│  📋 Connected Peers ({})                                    │", peers.len());
            println!("├─────────────────────────────────────────────────────────────┤");
            
            if peers.is_empty() {
                println!("│  No peers connected                                         │");
            } else {
                for peer in peers {
                    println!("│                                                             │");
                    println!("│  🏪 {}                                          │", pad_right(&peer.name, 50));
                    println!("│     IP: {}                                       │", pad_right(&peer.ip, 48));
                    println!("│     ↓ {:.1} MB  ↑ {:.1} MB  ⏱ {} ms                    │", 
                        peer.download_mb, peer.upload_mb, peer.latency_ms);
                }
            }
            
            println!("└─────────────────────────────────────────────────────────────┘");
            println!();
            
            // Total stats
            let total_down: f64 = state.get_peers().iter().map(|p| p.download_mb).sum();
            let total_up: f64 = state.get_peers().iter().map(|p| p.upload_mb).sum();
            
            println!("📊 Total Traffic: ↓ {:.1} MB  ↑ {:.1} MB", total_down, total_up);
        } else {
            println!("📡 Status: \x1b[31m●\x1b[0m DISCONNECTED");
            println!("⚠️  VPN connection is not active");
            println!();
            println!("   Waiting for configuration...");
        }
        
        println!();
        println!("─────────────────────────────────────────────────────────────────");
        println!("Press Ctrl+C to exit");
    }
}

// Pad string to right
fn pad_right(s: &str, width: usize) -> String {
    if s.len() >= width {
        s[..width].to_string()
    } else {
        format!("{}{}", s, " ".repeat(width - s.len()))
    }
}

// Load VPN configuration
async fn load_vpn_config() -> Option<VpnConfig> {
    // TODO: Integrate with config::get_app_config
    // For now, return mock config for testing
    Some(VpnConfig {
        private_key: "mock_private_key".to_string(),
        public_key: "mock_public_key".to_string(),
        listen_port: 51820,
        virtual_ip: "10.8.0.5".to_string(),
        endpoint: None,
        peers: vec![],
        enable_discovery: true,
    })
}

// Start VPN connection
async fn start_vpn_connection(state: AppState, _config: VpnConfig) {
    println!("🔌 Starting VPN connection...");
    
    state.update_connection_status(false);
    sleep(Duration::from_secs(2)).await;
    state.update_connection_status(true);
    
    // Mock peer data
    let mock_peers = vec![
        PeerInfo {
            name: "Store-001".to_string(),
            ip: "10.8.0.2".to_string(),
            download_mb: 2.1,
            upload_mb: 1.3,
            latency_ms: 45,
            is_online: true,
        },
        PeerInfo {
            name: "Store-002".to_string(),
            ip: "10.8.0.3".to_string(),
            download_mb: 1.8,
            upload_mb: 0.9,
            latency_ms: 32,
            is_online: true,
        },
        PeerInfo {
            name: "HQ-Server".to_string(),
            ip: "10.8.0.1".to_string(),
            download_mb: 5.2,
            upload_mb: 3.1,
            latency_ms: 12,
            is_online: true,
        },
    ];
    
    state.update_peers(mock_peers);
}

// Monitor VPN status
async fn monitor_vpn_status(state: AppState) {
    loop {
        sleep(Duration::from_secs(10)).await;
        
        // Simulate traffic updates
        if state.is_connected() {
            let mut peers = state.get_peers();
            for peer in &mut peers {
                peer.download_mb += 0.1;
                peer.upload_mb += 0.05;
                peer.latency_ms = (peer.latency_ms as f32 * 0.9 + rand::random::<f32>() * 20.0) as u32;
            }
            state.update_peers(peers);
        }
    }
}
