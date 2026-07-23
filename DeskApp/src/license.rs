#![allow(dead_code)]
use serde::{Deserialize, Serialize};
use machine_uid::get;

#[allow(dead_code)]
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct LicenseInfo {
    pub key: String,
    pub owner: String,
    pub expiry_date: String, // YYYY-MM-DD
    pub machine_id: String,
    pub status: String, // ACTIVE, EXPIRED, INVALID
}

pub struct LicenseManager;

impl LicenseManager {
    pub fn get_machine_id() -> String {
        get().unwrap_or_else(|_| "UNKNOWN-MACHINE-ID".to_string())
    }

    pub fn check_license(_key: &str) -> LicenseInfo {
        // TEMPORARY BYPASS: Always return active license
        let current_machine = Self::get_machine_id();
        
        LicenseInfo {
            key: "BYPASS-ACTIVE".to_string(),
            owner: "RetailEX Enterprise User".to_string(),
            expiry_date: "2099-12-31".to_string(),
            machine_id: current_machine,
            status: "ACTIVE".to_string(),
        }
    }

    pub fn is_expired(expiry_str: &str) -> bool {
        if let Ok(expiry) = chrono::NaiveDate::parse_from_str(expiry_str, "%Y-%m-%d") {
            let now = chrono::Local::now().date_naive();
            return now > expiry;
        }
        true // Invalid date treated as expired
    }
}
