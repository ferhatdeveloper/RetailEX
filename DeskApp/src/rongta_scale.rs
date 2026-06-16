//! Rongta RLS1000 / RLS1100 — doğrudan TCP PLU gönderimi (RLS1000.exe olmadan).

use serde::{Deserialize, Serialize};
use std::io::{Read, Write};
use std::net::TcpStream;
use std::time::Duration;

const CMD_START: &str = "0201";
const CMD_ACK: &str = "0102";
const CMD_PLU: &str = "0110";
const CMD_REQUEST_SALES: &str = "0120";
const CMD_SALES_RECORD: &str = "0210";
const CMD_SALES_END: &str = "0220";
const DEFAULT_PORT: u16 = 20304;
const FALLBACK_PORTS: [u16; 13] = [20304, 4001, 19204, 20104, 3001, 3000, 4000, 5000, 8000, 8001, 8080, 9000, 10001];
const TIMEOUT_MS: u64 = 8000;
const TEST_DISPLAY_TEXT: &str = "EXFIN RETAIL";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RongtaPluRecord {
    pub plu_code: String,
    pub name: String,
    pub price: f64,
    #[serde(default)]
    pub unit: Option<String>,
    #[serde(default)]
    pub barcode: Option<String>,
    pub rank: u32,
    #[serde(default)]
    pub lf_code: Option<String>,
    #[serde(default)]
    pub barcode_type: Option<u32>,
    #[serde(default)]
    pub department: Option<u32>,
    #[serde(default)]
    pub tare_grams: Option<u32>,
    #[serde(default)]
    pub shelf_days: Option<u32>,
    #[serde(default)]
    pub operate: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RongtaSalesRecord {
    pub scale_no: String,
    pub user_id: String,
    pub fresh_code: String,
    pub unit_price: f64,
    pub weight_unit: String,
    pub total_amount: f64,
    pub weight: f64,
    pub sale_date: String,
    pub discount_type: String,
    pub final_online_time: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RongtaSalesFetchResult {
    pub success: bool,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub count: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub records: Option<Vec<RongtaSalesRecord>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub port: Option<u16>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RongtaSyncResult {
    pub success: bool,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sent_count: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub failed_count: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub errors: Option<Vec<String>>,
}

fn parse_sales_record(data: &str) -> Option<RongtaSalesRecord> {
    if data.len() < 74 {
        return None;
    }
    let unit_price_raw: i64 = data[20..28].parse().unwrap_or(0);
    let total_raw: i64 = data[29..39].parse().unwrap_or(0);
    let weight_raw: i64 = data[39..45].parse().unwrap_or(0);
    Some(RongtaSalesRecord {
        scale_no: data[0..8].trim().to_string(),
        user_id: data[8..14].trim().to_string(),
        fresh_code: data[14..20].trim().to_string(),
        unit_price: unit_price_raw as f64 / 100.0,
        weight_unit: data[28..29].to_string(),
        total_amount: total_raw as f64 / 100.0,
        weight: weight_raw as f64 / 1000.0,
        sale_date: data[45..59].to_string(),
        discount_type: data[59..60].to_string(),
        final_online_time: data[60..74].to_string(),
    })
}

fn parse_packet_cmd(raw: &str) -> Option<(String, String)> {
    if raw.len() < 8 {
        return None;
    }
    let cmd = raw[4..8].to_string();
    let data = if raw.len() > 8 { raw[8..].to_string() } else { String::new() };
    Some((cmd, data))
}

fn pad_field(value: &str, width: usize) -> String {
    let s: String = value.chars().take(width).collect();
    if s.len() >= width {
        return s;
    }
    format!("{:width$}", s, width = width)
}

fn pad_num(value: &str, width: usize) -> String {
    let digits: String = value.chars().filter(|c| c.is_ascii_digit()).collect();
    let d = if digits.len() > width {
        digits[digits.len() - width..].to_string()
    } else {
        digits
    };
    format!("{:0>width$}", d, width = width)
}

fn encode_price(price: f64) -> String {
    let cents = (price.max(0.0) * 100.0).round() as i64;
    pad_num(&cents.to_string(), 8)
}

fn map_weight_unit(unit: Option<&str>) -> char {
    let u = unit.unwrap_or("KG").to_uppercase();
    if u == "GR" || u == "GRAM" || u == "G" {
        '1'
    } else {
        '4'
    }
}

fn build_packet(command: &str, data: &str) -> String {
    let cmd = if command.len() >= 4 {
        command[command.len() - 4..].to_string()
    } else {
        format!("{:0>4}", command)
    };
    let body = format!("{}{}", cmd, data);
    let len = format!("{:04}", 4 + body.len());
    format!("{}{}", len, body)
}

fn build_plu_body(plu: &RongtaPluRecord) -> String {
    let lf = plu.lf_code.as_deref().unwrap_or(&plu.plu_code);
    let art: String = plu
        .barcode
        .as_deref()
        .unwrap_or(&plu.plu_code)
        .chars()
        .filter(|c| c.is_ascii_digit())
        .collect();
    let art_no = if art.len() > 10 {
        art[art.len() - 10..].to_string()
    } else {
        art
    };
    format!(
        "{}{}{}{}{}{}{}{}{}{}{}{}{}{}{}{}{}{}{}{}",
        plu.operate.as_deref().unwrap_or("I"),
        pad_num(&plu.rank.to_string(), 2),
        pad_field(&plu.name, 36),
        pad_num(lf, 6),
        pad_num(&art_no, 10),
        pad_num(
            &plu.barcode_type.unwrap_or(27).to_string(),
            2
        ),
        encode_price(plu.price),
        map_weight_unit(plu.unit.as_deref()),
        pad_num(&plu.department.unwrap_or(0).to_string(), 2),
        pad_num(&plu.tare_grams.unwrap_or(0).to_string(), 6),
        pad_num(&plu.shelf_days.unwrap_or(15).to_string(), 3),
        '0',
        pad_num("0", 6),
        pad_num("5", 2),
        pad_num("0", 3),
        pad_num("0", 3),
        pad_num("0", 3),
        pad_num("0", 3),
        '0',
        '0',
    )
}

fn connect_stream(ip: &str, port: Option<u16>) -> Result<(TcpStream, u16), String> {
    let ports: Vec<u16> = match port {
        Some(p) => {
            let mut list = vec![p];
            for fp in FALLBACK_PORTS {
                if fp != p {
                    list.push(fp);
                }
            }
            list
        }
        None => FALLBACK_PORTS.to_vec(),
    };
    let mut last_err = String::from("Bağlantı kurulamadı");
    for p in ports {
        let addr = format!("{}:{}", ip, p);
        match TcpStream::connect_timeout(
            &addr.parse().map_err(|e: std::net::AddrParseError| e.to_string())?,
            Duration::from_millis(TIMEOUT_MS),
        ) {
            Ok(stream) => {
                let _ = stream.set_read_timeout(Some(Duration::from_millis(TIMEOUT_MS)));
                let _ = stream.set_write_timeout(Some(Duration::from_millis(TIMEOUT_MS)));
                return Ok((stream, p));
            }
            Err(e) => last_err = format!("{}:{} — {}", ip, p, e),
        }
    }
    Err(last_err)
}

fn read_packet(stream: &mut TcpStream, max_wait_ms: u64) -> Result<String, String> {
    let mut buf = [0u8; 4096];
    let started = std::time::Instant::now();
    let mut acc = String::new();
    while started.elapsed().as_millis() < max_wait_ms as u128 {
        match stream.read(&mut buf) {
            Ok(0) => break,
            Ok(n) => {
                acc.push_str(&String::from_utf8_lossy(&buf[..n]));
                if acc.len() >= 8 {
                    if let Ok(len) = acc[..4].parse::<usize>() {
                        if acc.len() >= len {
                            return Ok(acc[..len].to_string());
                        }
                    }
                }
            }
            Err(e) if e.kind() == std::io::ErrorKind::WouldBlock || e.kind() == std::io::ErrorKind::TimedOut => {
                if !acc.is_empty() {
                    return Ok(acc);
                }
            }
            Err(e) => return Err(e.to_string()),
        }
        std::thread::sleep(Duration::from_millis(50));
    }
    Ok(acc)
}

fn write_packet(stream: &mut TcpStream, packet: &str) -> Result<(), String> {
    stream
        .write_all(packet.as_bytes())
        .map_err(|e| e.to_string())
}

fn ack_ok(raw: &str) -> bool {
    if raw.len() < 8 {
        return raw.is_empty();
    }
    let cmd = &raw[4..8];
    if cmd != CMD_ACK {
        return true;
    }
    let data = &raw[8..];
    if data.len() >= 14 {
        return data.ends_with("0000");
    }
    true
}

#[tauri::command]
pub async fn rongta_scale_test(ip_address: String, port: Option<u16>) -> Result<serde_json::Value, String> {
    let ip = ip_address.trim().to_string();
    if ip.is_empty() {
        return Err("IP adresi gerekli".into());
    }
    tokio::task::spawn_blocking(move || {
        let (mut stream, used_port) = connect_stream(&ip, port)?;
        let test_plu = RongtaPluRecord {
            plu_code: "99999".into(),
            name: TEST_DISPLAY_TEXT.into(),
            price: 0.01,
            unit: Some("KG".into()),
            barcode: Some("9999900001".into()),
            rank: 99,
            lf_code: Some("999999".into()),
            barcode_type: Some(27),
            department: None,
            tare_grams: None,
            shelf_days: None,
            operate: Some("I".into()),
        };

        let initial = read_packet(&mut stream, 1500)?;
        if initial.contains(CMD_START) {
            write_packet(&mut stream, &build_packet(CMD_ACK, &format!("{}0000000000", CMD_START)))?;
        } else {
            write_packet(&mut stream, &build_packet(CMD_START, ""))?;
            let _ = read_packet(&mut stream, 3000)?;
        }

        write_packet(&mut stream, &build_packet(CMD_PLU, &build_plu_body(&test_plu)))?;
        let ack = read_packet(&mut stream, 5000)?;
        let display_ok = ack_ok(&ack);
        let message = if display_ok {
            format!(
                "Test başarılı — terazi ekranında \"{}\" görünmeli (PLU 99)",
                TEST_DISPLAY_TEXT
            )
        } else {
            "Bağlantı var ancak test PLU gönderilemedi".into()
        };

        Ok(serde_json::json!({
            "ok": display_ok,
            "port": used_port,
            "displayText": TEST_DISPLAY_TEXT,
            "message": message,
        }))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn rongta_scale_send_plu(
    ip_address: String,
    port: Option<u16>,
    records: Vec<RongtaPluRecord>,
) -> Result<RongtaSyncResult, String> {
    let ip = ip_address.trim().to_string();
    if ip.is_empty() {
        return Err("IP adresi gerekli".into());
    }
    if records.is_empty() {
        return Err("Gönderilecek ürün yok".into());
    }

    tokio::task::spawn_blocking(move || {
        let (mut stream, used_port) = connect_stream(&ip, port)?;
        let mut errors: Vec<String> = Vec::new();
        let mut sent_count = 0u32;

        let initial = read_packet(&mut stream, 1500)?;
        if initial.contains(CMD_START) {
            write_packet(&mut stream, &build_packet(CMD_ACK, &format!("{}0000000000", CMD_START)))?;
        } else {
            write_packet(&mut stream, &build_packet(CMD_START, ""))?;
            let _ = read_packet(&mut stream, 3000)?;
        }

        for rec in &records {
            let body = build_plu_body(rec);
            write_packet(&mut stream, &build_packet(CMD_PLU, &body))?;
            let ack = read_packet(&mut stream, 5000)?;
            if ack_ok(&ack) {
                sent_count += 1;
            } else {
                errors.push(format!("{}: terazi ACK hatası", rec.name));
            }
        }

        let failed = records.len() as u32 - sent_count;
        Ok(RongtaSyncResult {
            success: errors.is_empty(),
            message: if errors.is_empty() {
                format!(
                    "{} ürün Rongta terazisine gönderildi (port {})",
                    sent_count, used_port
                )
            } else {
                format!(
                    "{} gönderildi, {} hata (port {})",
                    sent_count,
                    errors.len(),
                    used_port
                )
            },
            sent_count: Some(sent_count),
            failed_count: Some(failed),
            errors: if errors.is_empty() { None } else { Some(errors) },
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn rongta_scale_fetch_sales(
    ip_address: String,
    port: Option<u16>,
    max_records: Option<u32>,
    timeout_ms: Option<u64>,
) -> Result<RongtaSalesFetchResult, String> {
    let ip = ip_address.trim().to_string();
    if ip.is_empty() {
        return Err("IP adresi gerekli".into());
    }
    let max_records = max_records.unwrap_or(500).min(5000);
    let timeout_ms = timeout_ms.unwrap_or(15000).min(120_000);

    tokio::task::spawn_blocking(move || {
        let (mut stream, used_port) = connect_stream(&ip, port)?;
        let mut records: Vec<RongtaSalesRecord> = Vec::new();

        let initial = read_packet(&mut stream, 1500)?;
        if initial.contains(CMD_START) {
            write_packet(&mut stream, &build_packet(CMD_ACK, &format!("{}0000000000", CMD_START)))?;
        } else {
            write_packet(&mut stream, &build_packet(CMD_START, ""))?;
            let _ = read_packet(&mut stream, 3000)?;
        }

        write_packet(&mut stream, &build_packet(CMD_REQUEST_SALES, ""))?;

        let deadline = std::time::Instant::now() + Duration::from_millis(timeout_ms);
        while (records.len() as u32) < max_records && std::time::Instant::now() < deadline {
            let wait = deadline.saturating_duration_since(std::time::Instant::now()).as_millis() as u64;
            let raw = read_packet(&mut stream, wait.min(3000))?;
            if raw.len() < 8 {
                continue;
            }
            let Some((cmd, data)) = parse_packet_cmd(&raw) else {
                continue;
            };
            if cmd == CMD_SALES_END {
                break;
            }
            if cmd == CMD_SALES_RECORD {
                if let Some(rec) = parse_sales_record(&data) {
                    records.push(rec);
                }
            }
            if cmd == CMD_ACK && !ack_ok(&raw) {
                break;
            }
        }

        let count = records.len() as u32;
        Ok(RongtaSalesFetchResult {
            success: true,
            message: if count > 0 {
                format!("{} satış kaydı alındı (port {})", count, used_port)
            } else {
                format!("Satış kaydı yok veya terazi yanıt vermedi (port {})", used_port)
            },
            count: Some(count),
            records: Some(records),
            port: Some(used_port),
        })
    })
    .await
    .map_err(|e| e.to_string())?
}
