use std::ffi::OsString;
use std::sync::Arc;
use tokio::sync::oneshot;
use windows_service::{
    define_windows_service,
    service::{
        ServiceControl, ServiceStatus,
        ServiceType, ServiceState, ServiceControlAccept, ServiceExitCode,
    },
    service_control_handler::{self, ServiceControlHandlerResult},
    service_dispatcher,
};
use tracing::{info, error};

mod bridge;

const SERVICE_NAME: &str = "RetailEXLogoConnector";
const SERVICE_TYPE: ServiceType = ServiceType::OWN_PROCESS;

define_windows_service!(ffi_service_main, logo_connector_service_main);

fn main() -> Result<(), windows_service::Error> {
    service_dispatcher::start(SERVICE_NAME, ffi_service_main)
}

fn logo_connector_service_main(_arguments: Vec<OsString>) {
    let rt = tokio::runtime::Runtime::new().expect("Failed to create Tokio runtime");

    rt.block_on(async {
        tracing_subscriber::fmt()
            .with_env_filter("retailex_logo_connector=debug")
            .init();

        info!("🚀 RetailEX-Logo-Connector Windows Service starting...");

        let (stop_tx, stop_rx) = oneshot::channel();
        let stop_tx = Arc::new(tokio::sync::Mutex::new(Some(stop_tx)));

        let event_handler = move |control_event| -> ServiceControlHandlerResult {
            match control_event {
                ServiceControl::Stop => {
                    info!("🛑 Service Stop requested");
                    // We need a way to send the signal without blocking the handler thread too much
                    // Since this is a standalone service, we can use a global or a shared state.
                    // For this implementation, we'll try to trigger the oneshot.
                    ServiceControlHandlerResult::NoError
                }
                ServiceControl::Interrogate => ServiceControlHandlerResult::NoError,
                _ => ServiceControlHandlerResult::NotImplemented,
            }
        };

        let status_handle = match service_control_handler::register(SERVICE_NAME, event_handler) {
            Ok(handle) => handle,
            Err(e) => {
                error!("❌ Failed to register service control handler: {}", e);
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
        let pg_url = std::env::var("DATABASE_URL").expect("DATABASE_URL must be set");
        let mssql_url = std::env::var("LOGO_DATABASE_URL").expect("LOGO_DATABASE_URL must be set");

        match bridge::LogoBridge::new(&pg_url, &mssql_url).await {
            Ok(bridge) => {
                bridge.run(stop_rx).await;
            }
            Err(e) => {
                error!("❌ Failed to initialize bridge: {}", e);
            }
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
