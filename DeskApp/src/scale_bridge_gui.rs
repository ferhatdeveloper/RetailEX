//! Terazi köprüsü — Slint masaüstü yönetim arayüzü (WinForms benzeri).

use crate::{ScaleBridgeWindow, ScaleRow};
use serde::{Deserialize, Serialize};
use slint::ComponentHandle;
use slint::{ModelRc, VecModel};
use std::path::PathBuf;
use std::process::Command;
use std::sync::{Arc, Mutex};
use std::time::Duration;

const BRIDGE_BASE: &str = "http://127.0.0.1:3012";
const SERVICE_NAME: &str = "RetailEX_Scale_Bridge";

#[derive(Debug, Clone, Deserialize, Serialize)]
struct BridgeConfig {
    #[serde(rename = "storeCode", default)]
    store_code: String,
    #[serde(rename = "storeName", default)]
    store_name: String,
    #[serde(rename = "authToken", default)]
    auth_token: String,
    #[serde(default)]
    scales: Vec<ScaleConfig>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct ScaleConfig {
    id: String,
    name: String,
    #[serde(default = "default_brand")]
    brand: String,
    #[serde(default = "default_model")]
    model: String,
    #[serde(rename = "ipAddress")]
    ip_address: String,
    #[serde(default = "default_port")]
    port: u16,
    #[serde(default = "default_enabled")]
    enabled: bool,
}

fn default_brand() -> String {
    "rongta".into()
}
fn default_model() -> String {
    "RLS1100".into()
}
fn default_port() -> u16 {
    20304
}
fn default_enabled() -> bool {
    true
}

#[derive(Deserialize)]
struct StatusResponse {
    ok: bool,
}

#[derive(Deserialize)]
struct ProbeResponse {
    found: bool,
    #[serde(default)]
    suggested_port: Option<u16>,
}

#[derive(Deserialize)]
struct TestResponse {
    ok: bool,
    #[serde(default)]
    message: Option<String>,
    #[serde(default)]
    suggested_port: Option<u16>,
}

#[derive(Deserialize)]
struct ScanResponse {
    #[serde(default)]
    devices: Vec<ScanDevice>,
}

#[derive(Deserialize)]
struct ScanDevice {
    ip_address: String,
    port: u16,
    #[serde(default)]
    brand: String,
}

struct AppState {
    config: BridgeConfig,
    token: String,
}

fn http_client() -> reqwest::blocking::Client {
    reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(120))
        .build()
        .unwrap_or_else(|_| reqwest::blocking::Client::new())
}

fn get_json<T: serde::de::DeserializeOwned>(path: &str, token: &str) -> Result<T, String> {
    let client = http_client();
    let mut req = client.get(format!("{BRIDGE_BASE}{path}"));
    if !token.is_empty() {
        req = req.header("Authorization", format!("Bearer {token}"));
    }
    let res = req.send().map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Err(format!("HTTP {}", res.status()));
    }
    res.json().map_err(|e| e.to_string())
}

fn send_json<T: serde::de::DeserializeOwned>(
    method: reqwest::Method,
    path: &str,
    token: &str,
    body: Option<serde_json::Value>,
) -> Result<T, String> {
    let client = http_client();
    let mut req = client.request(method, format!("{BRIDGE_BASE}{path}"));
    if !token.is_empty() {
        req = req.header("Authorization", format!("Bearer {token}"));
    }
    if let Some(b) = body {
        req = req.json(&b);
    }
    let res = req.send().map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        let status = res.status();
        let text = res.text().unwrap_or_default();
        return Err(if text.is_empty() {
            format!("HTTP {status}")
        } else {
            format!("HTTP {status}: {text}")
        });
    }
    res.json().map_err(|e| e.to_string())
}

fn load_config_from_bridge(token: &str) -> Result<BridgeConfig, String> {
    let mut cfg: BridgeConfig = get_json("/config", token)?;
    if cfg.auth_token == "***" && !token.is_empty() {
        cfg.auth_token = token.to_string();
    }
    Ok(cfg)
}

fn save_config_to_bridge(state: &AppState) -> Result<(), String> {
    let mut cfg = state.config.clone();
    cfg.auth_token = state.token.clone();
    let _: serde_json::Value = send_json(
        reqwest::Method::PUT,
        "/config",
        &state.token,
        Some(serde_json::to_value(&cfg).map_err(|e| e.to_string())?),
    )?;
    Ok(())
}

fn scales_to_rows(scales: &[ScaleConfig]) -> ModelRc<ScaleRow> {
    let rows: Vec<ScaleRow> = scales
        .iter()
        .map(|s| ScaleRow {
            id: s.id.clone().into(),
            label: format!("{} — {}:{}", s.name, s.ip_address, s.port).into(),
            ip: s.ip_address.clone().into(),
            port: s.port.to_string().into(),
            name: s.name.clone().into(),
        })
        .collect();
    ModelRc::new(VecModel::from(rows))
}

fn bridge_ready() -> bool {
    get_json::<StatusResponse>("/status", "").map(|s| s.ok).unwrap_or(false)
}

fn service_status_text() -> String {
    let out = Command::new("sc").args(["query", SERVICE_NAME]).output();
    match out {
        Ok(o) => {
            let s = String::from_utf8_lossy(&o.stdout);
            if s.contains("RUNNING") {
                "Çalışıyor".into()
            } else if s.contains("STOPPED") {
                "Durduruldu".into()
            } else {
                "Kurulu değil / bilinmiyor".into()
            }
        }
        Err(_) => "Servis sorgulanamadı".into(),
    }
}

fn apply_config_to_ui(ui: &ScaleBridgeWindow, state: &AppState) {
    ui.set_store_code(state.config.store_code.clone().into());
    ui.set_store_name(state.config.store_name.clone().into());
    ui.set_auth_token(state.token.clone().into());
    ui.set_scales(scales_to_rows(&state.config.scales));
}

pub fn launch_gui(bridge_exe: &PathBuf) -> Result<(), Box<dyn std::error::Error>> {
    let _ = Command::new("net").args(["start", SERVICE_NAME]).status();

    if !wait_bridge(30) {
        return Err("Köprü servisi yanıt vermiyor (port 3012). Servis kurulumunu çalıştırın.".into());
    }

    let ui = ScaleBridgeWindow::new()?;
    ui.window().set_maximized(true);
    let state = Arc::new(Mutex::new(AppState {
        config: BridgeConfig {
            store_code: String::new(),
            store_name: String::new(),
            auth_token: String::new(),
            scales: vec![],
        },
        token: String::new(),
    }));

    ui.set_service_status(service_status_text().into());
    if let Ok(cfg) = load_config_from_bridge("") {
        if let Ok(mut st) = state.lock() {
            st.token = cfg.auth_token.clone();
            st.config = cfg;
            apply_config_to_ui(&ui, &st);
        }
    }

    let ui_weak = ui.as_weak();
    let state_sel = state.clone();
    ui.on_select_scale({
        move |idx| {
            if let Some(ui) = ui_weak.upgrade() {
                if let Ok(st) = state_sel.lock() {
                    if let Some(s) = st.config.scales.get(idx as usize) {
                        ui.set_scale_name(s.name.clone().into());
                        ui.set_scale_ip(s.ip_address.clone().into());
                        ui.set_scale_port(s.port.to_string().into());
                    }
                }
            }
        }
    });

    let ui_weak = ui.as_weak();
    let state_reload = state.clone();
    ui.on_reload_config({
        move || {
            if let Some(ui) = ui_weak.upgrade() {
                let token = state_reload.lock().map(|s| s.token.clone()).unwrap_or_default();
                match load_config_from_bridge(&token) {
                    Ok(cfg) => {
                        if let Ok(mut st) = state_reload.lock() {
                            st.token = cfg.auth_token.clone();
                            st.config = cfg;
                            apply_config_to_ui(&ui, &st);
                        }
                        ui.set_status_msg("Yapılandırma yüklendi.".into());
                    }
                    Err(e) => ui.set_status_msg(format!("Yükleme hatası: {e}").into()),
                }
                ui.set_service_status(service_status_text().into());
            }
        }
    });

    let ui_weak = ui.as_weak();
    let state_save = state.clone();
    ui.on_save_settings({
        move || {
            if let Some(ui) = ui_weak.upgrade() {
                if let Ok(mut st) = state_save.lock() {
                    st.config.store_code = ui.get_store_code().to_string();
                    st.config.store_name = ui.get_store_name().to_string();
                    st.token = ui.get_auth_token().to_string();
                    match save_config_to_bridge(&st) {
                        Ok(()) => ui.set_status_msg("Kaydedildi.".into()),
                        Err(e) => ui.set_status_msg(format!("Kayıt hatası: {e}").into()),
                    }
                }
            }
        }
    });

    let ui_weak = ui.as_weak();
    let state_add = state.clone();
    ui.on_add_scale({
        move || {
            if let Some(ui) = ui_weak.upgrade() {
                let ip = ui.get_scale_ip().to_string();
                let name = ui.get_scale_name().to_string();
                let port: u16 = ui.get_scale_port().parse().unwrap_or(20304);
                if ip.trim().is_empty() {
                    ui.set_status_msg("IP adresi gerekli.".into());
                    return;
                }
                if let Ok(mut st) = state_add.lock() {
                    st.config.scales.push(ScaleConfig {
                        id: format!("scale-{}", chrono::Local::now().timestamp_millis()),
                        name: if name.trim().is_empty() {
                            format!("Terazi {ip}")
                        } else {
                            name
                        },
                        brand: default_brand(),
                        model: default_model(),
                        ip_address: ip,
                        port,
                        enabled: true,
                    });
                    apply_config_to_ui(&ui, &st);
                    let _ = save_config_to_bridge(&st);
                    ui.set_status_msg("Terazi eklendi.".into());
                }
            }
        }
    });

    let ui_weak = ui.as_weak();
    let state_upd = state.clone();
    ui.on_update_scale({
        move || {
            if let Some(ui) = ui_weak.upgrade() {
                let idx = ui.get_selected_index();
                if idx < 0 {
                    ui.set_status_msg("Listeden terazi seçin.".into());
                    return;
                }
                if let Ok(mut st) = state_upd.lock() {
                    if let Some(scale) = st.config.scales.get_mut(idx as usize) {
                        scale.name = ui.get_scale_name().to_string();
                        scale.ip_address = ui.get_scale_ip().to_string();
                        scale.port = ui.get_scale_port().parse().unwrap_or(scale.port);
                        apply_config_to_ui(&ui, &st);
                        let _ = save_config_to_bridge(&st);
                        ui.set_status_msg("Terazi güncellendi.".into());
                    }
                }
            }
        }
    });

    let ui_weak = ui.as_weak();
    let state_del = state.clone();
    ui.on_delete_scale({
        move || {
            if let Some(ui) = ui_weak.upgrade() {
                let idx = ui.get_selected_index();
                if idx < 0 {
                    ui.set_status_msg("Silinecek terazi seçin.".into());
                    return;
                }
                if let Ok(mut st) = state_del.lock() {
                    if (idx as usize) < st.config.scales.len() {
                        st.config.scales.remove(idx as usize);
                        ui.set_selected_index(-1);
                        apply_config_to_ui(&ui, &st);
                        let _ = save_config_to_bridge(&st);
                        ui.set_status_msg("Terazi silindi.".into());
                    }
                }
            }
        }
    });

    let ui_weak = ui.as_weak();
    let state_test = state.clone();
    ui.on_test_scale({
        move || {
            if let Some(ui) = ui_weak.upgrade() {
                let idx = ui.get_selected_index();
                if idx < 0 {
                    ui.set_status_msg("Test için listeden terazi seçin.".into());
                    return;
                }
                let id = state_test
                    .lock()
                    .ok()
                    .and_then(|st| st.config.scales.get(idx as usize).map(|s| s.id.clone()));
                let Some(id) = id else {
                    return;
                };
                let token = state_test.lock().map(|s| s.token.clone()).unwrap_or_default();
                ui.set_status_msg("Test yapılıyor…".into());
                let path = format!("/scales/{id}/test");
                match send_json::<TestResponse>(reqwest::Method::POST, &path, &token, None) {
                    Ok(r) => {
                        let msg = r.message.unwrap_or_else(|| {
                            if r.ok {
                                "Test başarılı — EXFIN RETAIL".into()
                            } else {
                                "Test başarısız".into()
                            }
                        });
                        if let Some(p) = r.suggested_port {
                            ui.set_scale_port(p.to_string().into());
                        }
                        ui.set_status_msg(msg.into());
                    }
                    Err(e) => ui.set_status_msg(format!("Test hatası: {e}").into()),
                }
            }
        }
    });

    let ui_weak = ui.as_weak();
    let state_probe = state.clone();
    ui.on_probe_scale({
        move || {
            if let Some(ui) = ui_weak.upgrade() {
                let ip = ui.get_scale_ip().to_string();
                let port: u16 = ui.get_scale_port().parse().unwrap_or(20304);
                if ip.trim().is_empty() {
                    ui.set_status_msg("IP gerekli.".into());
                    return;
                }
                ui.set_status_msg("Tüm terazi portları deneniyor…".into());
                let token = state_probe.lock().map(|s| s.token.clone()).unwrap_or_default();
                let body = serde_json::json!({ "ipAddress": ip, "port": port });
                match send_json::<ProbeResponse>(
                    reqwest::Method::POST,
                    "/scales/probe",
                    &token,
                    Some(body),
                ) {
                    Ok(r) => {
                        if r.found {
                            if let Some(p) = r.suggested_port {
                                ui.set_scale_port(p.to_string().into());
                            }
                            ui.set_status_msg(
                                format!("Terazi bulundu — port {}", ui.get_scale_port()).into(),
                            );
                        } else {
                            ui.set_status_msg(
                                "Terazi bulunamadı. RLS1000 ile IP/port doğrulayın.".into(),
                            );
                        }
                    }
                    Err(e) => ui.set_status_msg(format!("Probe hatası: {e}").into()),
                }
            }
        }
    });

    let ui_weak = ui.as_weak();
    let state_scan = state.clone();
    ui.on_scan_network({
        move || {
            if let Some(ui) = ui_weak.upgrade() {
                ui.set_status_msg("Ağ taranıyor (tüm terazi portları)…".into());
                let token = state_scan.lock().map(|s| s.token.clone()).unwrap_or_default();
                let body = serde_json::json!({ "ports": "all" });
                match send_json::<ScanResponse>(
                    reqwest::Method::POST,
                    "/scan",
                    &token,
                    Some(body),
                ) {
                    Ok(r) => {
                        if r.devices.is_empty() {
                            ui.set_status_msg("Taramada terazi bulunamadı.".into());
                            return;
                        }
                        if let Ok(mut st) = state_scan.lock() {
                            for d in r.devices {
                                if st
                                    .config
                                    .scales
                                    .iter()
                                    .any(|s| s.ip_address == d.ip_address)
                                {
                                    continue;
                                }
                                st.config.scales.push(ScaleConfig {
                                    id: format!("scale-{}", d.ip_address.replace('.', "-")),
                                    name: format!("Rongta {}", d.ip_address),
                                    brand: if d.brand.is_empty() {
                                        default_brand()
                                    } else {
                                        d.brand
                                    },
                                    model: default_model(),
                                    ip_address: d.ip_address,
                                    port: d.port,
                                    enabled: true,
                                });
                            }
                            apply_config_to_ui(&ui, &st);
                            let _ = save_config_to_bridge(&st);
                            ui.set_status_msg("Tarama tamamlandı — bulunanlar eklendi.".into());
                        }
                    }
                    Err(e) => ui.set_status_msg(format!("Tarama hatası: {e}").into()),
                }
            }
        }
    });

    let bridge_exe = bridge_exe.clone();
    let ui_weak = ui.as_weak();
    ui.on_install_service({
        move || {
            let _ = Command::new(&bridge_exe).arg("--install").status();
            if let Some(ui) = ui_weak.upgrade() {
                ui.set_service_status(service_status_text().into());
                ui.set_status_msg("Servis kurulum komutu çalıştırıldı.".into());
            }
        }
    });

    ui.on_open_web_ui({
        move || {
            let _ = Command::new("cmd")
                .args(["/C", "start", "", "http://127.0.0.1:3012/ui/"])
                .spawn();
        }
    });

    ui.run()?;
    Ok(())
}

fn wait_bridge(max_secs: u64) -> bool {
    for _ in 0..(max_secs * 2) {
        if bridge_ready() {
            return true;
        }
        std::thread::sleep(Duration::from_millis(500));
    }
    false
}
