#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// This is the main entry point for the Windows Service (RetailEX_Service.exe)
// It runs independently of the Tauri UI.

use std::ffi::OsString;
use std::sync::{mpsc, Arc};
use std::time::Duration;
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
use std::fs::OpenOptions;
use std::io::Write;
use std::env;

// --- SHARED MODULES ---
#[path = "license.rs"]
mod license;

#[path = "vpn.rs"]
mod vpn;

#[path = "config.rs"]
mod config;

#[path = "backup_service.rs"]
mod backup_service;

#[path = "remote_input.rs"]
mod remote_input;

#[path = "screen_capture.rs"]
mod screen_capture;

#[path = "sync.rs"]
mod sync;

#[path = "security.rs"]
mod security;

#[path = "maintenance.rs"]
mod maintenance;

#[path = "logger.rs"]
mod logger;

#[path = "db.rs"]
mod db;

#[path = "enterprise_sync.rs"]
mod enterprise_sync;

#[path = "db_utils.rs"]
mod db_utils;

#[path = "scanner.rs"]
mod scanner;

#[path = "windows_service_install.rs"]
mod windows_service_install;

// ----------------------

const SERVICE_NAME: &str = "RetailEX_Service";
const DISPLAY_NAME: &str = "RetailEX Background Service";
const LOG_FILE: &str = "C:\\ProgramData\\RetailEX\\service.log";

fn main() {
    if let Err(e) = run() {
        eprintln!("Service error: {}", e);
        std::process::exit(1);
    }
}

pub fn run() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<String> = env::args().collect();
    match windows_service_install::scan_bootstrap_service_cmd(&args) {
        Some(windows_service_install::BootstrapServiceCmd::Install) => return install_service(),
        Some(windows_service_install::BootstrapServiceCmd::Uninstall) => return uninstall_service(),
        Some(windows_service_install::BootstrapServiceCmd::Console) => {
            println!("Usage: RetailEX_Service.exe [--install | --uninstall]");
            return Ok(());
        }
        None => {}
    }
    if args.len() > 1 {
        println!("Usage: RetailEX_Service.exe [--install | --uninstall]");
        return Ok(());
    }
    println!("Starting RetailEX Background Service...");
    service_dispatcher::start(SERVICE_NAME, ffi_service_main).map_err(|e| e.into())
}

fn install_service() -> Result<(), Box<dyn std::error::Error>> {
    let manager = ServiceManager::local_computer(
        None::<&str>,
        ServiceManagerAccess::CONNECT | ServiceManagerAccess::CREATE_SERVICE,
    )
    .map_err(|e| {
        windows_service_install::log_service_install_failure("RetailEX_Service", &e);
        Box::new(e) as Box<dyn std::error::Error>
    })?;
    let exe_path = env::current_exe().map_err(|e| {
        windows_service_install::log_install_any_error("RetailEX_Service", &e);
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
        "RetailEX_Service",
    )? {
        windows_service_install::CreateServiceOutcome::Created => {
            println!("Service installed successfully.");
        }
        windows_service_install::CreateServiceOutcome::AlreadyExisted => {
            println!("Service already exists.");
        }
    }
    Ok(())
}

fn uninstall_service() -> Result<(), Box<dyn std::error::Error>> {
    let manager = ServiceManager::local_computer(None::<&str>, ServiceManagerAccess::CONNECT)?;
    let service = manager.open_service(SERVICE_NAME, ServiceAccess::DELETE)?;
    service.delete()?;
    println!("Service uninstalled successfully.");
    Ok(())
}

define_windows_service!(ffi_service_main, my_service_main);

fn my_service_main(_arguments: Vec<OsString>) {
    if let Err(_e) = run_service() {
        log(format!("Service startup failed: {:?}", _e));
    }
}

fn run_service() -> windows_service::Result<()> {
    let (shutdown_tx, shutdown_rx) = mpsc::channel();

    let event_handler = move |control_event| -> ServiceControlHandlerResult {
        match control_event {
            ServiceControl::Stop | ServiceControl::Interrogate => {
                shutdown_tx.send(()).ok();
                ServiceControlHandlerResult::NoError
            }
            _ => ServiceControlHandlerResult::NotImplemented,
        }
    };

    let status_handle = service_control_handler::register(SERVICE_NAME, event_handler)?;

    status_handle.set_service_status(ServiceStatus {
        service_type: ServiceType::OWN_PROCESS,
        current_state: ServiceState::Running,
        controls_accepted: ServiceControlAccept::STOP,
        exit_code: ServiceExitCode::Win32(0),
        checkpoint: 0,
        wait_hint: Duration::default(),
        process_id: None,
    })?;

    log("RetailEX Service Started.".to_string());

    // 1. Initialize Databases
    let _ = config::init_config_db();
    let _ = db::init_db_internal();

    // 2. Start Background Sync (Async context)
    let rt = tokio::runtime::Runtime::new().expect("Failed to create tokio runtime");
    
    // Legacy Sync Service (WebSocket Heartbeat)
    let (sync_service, rx) = sync::BackgroundSyncService::new();
    sync_service.start(None, rx);
    
    // Enterprise Sync Service (RabbitMQ / Redis)
    let amqp_url = config::get_app_config_internal().map(|c| c.amqp_url).unwrap_or_default();
    let device_id = config::get_app_config_internal().map(|c| c.device_id).unwrap_or("unknown".to_string());
    
    if !amqp_url.is_empty() {
        let enterprise_sync = Arc::new(enterprise_sync::EnterpriseSyncManager::new());
        let es_clone = enterprise_sync.clone();
        let tid = device_id.clone();
        let url = amqp_url.clone();
        
        rt.spawn(async move {
            if let Err(e) = es_clone.start_worker(&tid, &url).await {
                eprintln!("❌ Enterprise Sync failed to start: {}", e);
            }
        });
    }

    log("Background Sync & Enterprise Sync Services started.".to_string());

    // 3. Start Scanner Service
    let scanner_manager = Arc::new(scanner::ScannerManager::new());
    rt.spawn(async move {
        if let Err(e) = scanner_manager.start_server().await {
            eprintln!("❌ Scanner Service failed to start: {}", e);
        }
    });

    log("Scanner Service started on port 9999.".to_string());

    loop {
        perform_tasks();

        for _ in 0..60 {
            if shutdown_rx.try_recv().is_ok() {
                 status_handle.set_service_status(ServiceStatus {
                    service_type: ServiceType::OWN_PROCESS,
                    current_state: ServiceState::Stopped,
                    controls_accepted: ServiceControlAccept::empty(),
                    exit_code: ServiceExitCode::Win32(0),
                    checkpoint: 0,
                    wait_hint: Duration::default(),
                    process_id: None,
                })?;
                return Ok(());
            }
            std::thread::sleep(Duration::from_secs(1));
        }
    }
}

fn log(msg: String) {
    let _ = std::fs::create_dir_all("C:\\ProgramData\\RetailEX");
    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(LOG_FILE) {
         let _ = writeln!(file, "[{}] {}", chrono::Local::now(), msg);
    }
}

fn perform_tasks() {
    // 1. Load Config
    if let Ok(config) = config::get_app_config_internal() {
        // 2. Automated Backup Check
         if let Some(backup_conf) = &config.backup_config {
            if backup_conf.enabled {
                let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_secs();
                let last_run = backup_conf.last_run.as_ref()
                    .and_then(|s| s.parse::<u64>().ok())
                    .unwrap_or(0);
                
                let mut run_needed = false;
                
                // Check Hourly
                if backup_conf.hourly_backup && (now - last_run) >= 3600 {
                    run_needed = true;
                }
                // Check Daily (Simplified: if > 24h since last run)
                else if backup_conf.daily_backup && (now - last_run) >= 86400 {
                    run_needed = true;
                }
                // Check Periodic
                else if backup_conf.periodic_min > 0 && (now - last_run) >= (backup_conf.periodic_min as u64 * 60) {
                    run_needed = true;
                }

                if run_needed {
                    log("Starting automated backup...".to_string());
                    match backup_service::BackupService::perform_backup_internal(config.clone()) {
                        Ok(path) => log(format!("Backup successful: {}", path)),
                        Err(e) => log(format!("Backup failed: {}", e)),
                    }
                }
            }
        }

        // 3. License Check
        // let license_status = license::LicenseManager::new().check_license();
        // log(format!("License status: {:?}", license_status));
    } else {
        log("Failed to load AppConfig from DB".to_string());
    }
}
