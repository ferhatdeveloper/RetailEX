#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

//! RetailEX-Logo-Connector — Logo MSSQL ↔ PostgreSQL arka plan servisi (GUI yok).
//! Kurulum: RetailEX-Logo-Connector.exe --install

use std::ffi::OsString;
use tokio::sync::oneshot;
use tracing::{error, info};
use windows_service::{
    define_windows_service,
    service::{
        ServiceAccess, ServiceControl, ServiceControlAccept, ServiceErrorControl, ServiceExitCode,
        ServiceInfo, ServiceStartType, ServiceState, ServiceStatus, ServiceType,
    },
    service_control_handler::{self, ServiceControlHandlerResult},
    service_dispatcher,
    service_manager::{ServiceManager, ServiceManagerAccess},
};

#[path = "../../../DeskApp/src/logo_bridge.rs"]
mod logo_bridge;

const SERVICE_NAME: &str = "RetailEXLogoConnector";
const DISPLAY_NAME: &str = "RetailEX-Logo-Connector";
const SERVICE_TYPE: ServiceType = ServiceType::OWN_PROCESS;

define_windows_service!(ffi_service_main, connector_service_main);

fn main() -> anyhow::Result<()> {
    let args: Vec<String> = std::env::args().collect();

    if args.iter().any(|a| a == "--install") {
        install_service()?;
        return Ok(());
    }
    if args.iter().any(|a| a == "--uninstall") {
        uninstall_service()?;
        return Ok(());
    }
    if args.iter().any(|a| a == "--console") {
        run_console()?;
        return Ok(());
    }

    service_dispatcher::start(SERVICE_NAME, ffi_service_main)?;
    Ok(())
}

fn install_service() -> anyhow::Result<()> {
    let manager = ServiceManager::local_computer(
        None::<&str>,
        ServiceManagerAccess::CONNECT | ServiceManagerAccess::CREATE_SERVICE,
    )?;
    let exe_path = std::env::current_exe()?;

    if manager
        .open_service(SERVICE_NAME, ServiceAccess::QUERY_STATUS)
        .is_ok()
    {
        println!("Servis zaten kurulu: {SERVICE_NAME}");
        return Ok(());
    }

    println!("Kuruluyor: {DISPLAY_NAME} ({SERVICE_NAME})…");
    let info = ServiceInfo {
        name: OsString::from(SERVICE_NAME),
        display_name: OsString::from(DISPLAY_NAME),
        service_type: ServiceType::OWN_PROCESS,
        start_type: ServiceStartType::AutoStart,
        error_control: ServiceErrorControl::Normal,
        executable_path: exe_path,
        launch_arguments: vec![],
        dependencies: vec![],
        account_name: None,
        account_password: None,
    };

    let service = manager.create_service(&info, ServiceAccess::all())?;
    service.start::<OsString>(&[])?;
    println!("✅ Servis kuruldu ve başlatıldı.");
    Ok(())
}

fn uninstall_service() -> anyhow::Result<()> {
    let manager = ServiceManager::local_computer(None::<&str>, ServiceManagerAccess::CONNECT)?;
    if let Ok(service) = manager.open_service(
        SERVICE_NAME,
        ServiceAccess::STOP | ServiceAccess::DELETE,
    ) {
        let _ = service.stop();
        service.delete()?;
        println!("✅ Servis kaldırıldı.");
    } else {
        println!("Servis bulunamadı.");
    }
    Ok(())
}

fn run_console() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter("retailex_logo_connector=info,retailex=info")
        .init();
    info!("Konsol modu — Ctrl+C ile çıkış");

    let rt = tokio::runtime::Runtime::new()?;
    rt.block_on(async {
        dotenv::dotenv().ok();
        let pg_url = std::env::var("DATABASE_URL").expect("DATABASE_URL gerekli");
        let mssql_url = std::env::var("LOGO_DATABASE_URL").expect("LOGO_DATABASE_URL gerekli");
        let (stop_tx, stop_rx) = oneshot::channel::<()>();
        let bridge = logo_bridge::LogoBridge::new(&pg_url, &mssql_url).await?;
        tokio::spawn(async move {
            if tokio::signal::ctrl_c().await.is_ok() {
                let _ = stop_tx.send(());
            }
        });
        bridge.run(stop_rx).await;
        Ok::<(), anyhow::Error>(())
    })?;
    Ok(())
}

fn connector_service_main(_arguments: Vec<OsString>) {
    let rt = tokio::runtime::Runtime::new().expect("Tokio runtime");

    rt.block_on(async {
        tracing_subscriber::fmt()
            .with_env_filter("retailex_logo_connector=info,retailex=info")
            .init();

        info!("🚀 {DISPLAY_NAME} başlatılıyor…");

        let (stop_tx, stop_rx) = oneshot::channel();
        let stop_tx_mutex = std::sync::Mutex::new(Some(stop_tx));

        let event_handler = move |control_event| -> ServiceControlHandlerResult {
            match control_event {
                ServiceControl::Stop => {
                    info!("Durdurma isteği alındı");
                    if let Ok(mut guard) = stop_tx_mutex.lock() {
                        if let Some(tx) = guard.take() {
                            let _ = tx.send(());
                        }
                    }
                    ServiceControlHandlerResult::NoError
                }
                ServiceControl::Interrogate => ServiceControlHandlerResult::NoError,
                _ => ServiceControlHandlerResult::NotImplemented,
            }
        };

        let status_handle = match service_control_handler::register(SERVICE_NAME, event_handler) {
            Ok(h) => h,
            Err(e) => {
                error!("Servis handler kaydı başarısız: {e}");
                return;
            }
        };

        let _ = status_handle.set_service_status(ServiceStatus {
            service_type: SERVICE_TYPE,
            current_state: ServiceState::Running,
            controls_accepted: ServiceControlAccept::STOP,
            exit_code: ServiceExitCode::Win32(0),
            checkpoint: 0,
            wait_hint: std::time::Duration::default(),
            process_id: None,
        });

        dotenv::dotenv().ok();
        let pg_url = match std::env::var("DATABASE_URL") {
            Ok(v) => v,
            Err(_) => {
                error!("DATABASE_URL ortam değişkeni tanımlı değil");
                return;
            }
        };
        let mssql_url = match std::env::var("LOGO_DATABASE_URL") {
            Ok(v) => v,
            Err(_) => {
                error!("LOGO_DATABASE_URL ortam değişkeni tanımlı değil");
                return;
            }
        };

        match logo_bridge::LogoBridge::new(&pg_url, &mssql_url).await {
            Ok(bridge) => bridge.run(stop_rx).await,
            Err(e) => error!("Logo köprüsü başlatılamadı: {e}"),
        }

        let _ = status_handle.set_service_status(ServiceStatus {
            service_type: SERVICE_TYPE,
            current_state: ServiceState::Stopped,
            controls_accepted: ServiceControlAccept::empty(),
            exit_code: ServiceExitCode::Win32(0),
            checkpoint: 0,
            wait_hint: std::time::Duration::default(),
            process_id: None,
        });
    });
}
