use image::DynamicImage;
use screenshots::Screen;
use std::sync::{Arc, Mutex};
use tokio::time::{sleep, Duration};
use crate::sync::SyncSender;
use base64::{Engine as _, engine::general_purpose};

pub struct ScreenCaptureService {
    // cancel_token: tokio_util::sync::CancellationToken, // Not used strictly yet, rely on running flag
    running: Arc<Mutex<bool>>,
}

impl ScreenCaptureService {
    pub fn new() -> Self {
        Self {
            running: Arc::new(Mutex::new(false)),
        }
    }

    pub fn start(&self, _app_handle: tauri::AppHandle, sender: SyncSender) {
        let running = self.running.clone();

        tauri::async_runtime::spawn(async move {
            println!("📸 ScreenCaptureService started (waiting for command)...");
            
            loop {
                // Check running state
                let is_running = *running.lock().unwrap();
                if !is_running {
                    sleep(Duration::from_secs(1)).await;
                    continue;
                }

                let start = std::time::Instant::now();
                
                // Capture Primary Screen
                let screens = Screen::all().unwrap_or_default();
                if let Some(screen) = screens.first() {
                     match screen.capture() {
                         Ok(image) => {
                             // screenshots crate returns RgbaImage (image crate DynamicImage compatible buffer)
                             // let buffer = image.to_png().unwrap(); 
                             
                             let dynamic_image = DynamicImage::ImageRgba8(image);
                             let resized = dynamic_image.thumbnail(1280, 720);
                             
                             let mut jpeg_buffer = Vec::new();
                             let mut encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut jpeg_buffer, 60);
                             
                             if encoder.encode_image(&resized).is_ok() {
                                 let b64 = general_purpose::STANDARD.encode(&jpeg_buffer);
                                     
                                     // Construct JSON manually to avoid huge dependency chain if possible
                                     let json = serde_json::json!({
                                        "type": "SCREEN_FRAME",
                                        "payload": b64,
                                        "timestamp": chrono::Utc::now().to_rfc3339()
                                     }).to_string();
                                     
                                     // Ignore send errors (client might be disconnected)
                                 let _ = sender.0.send(json).await;
                             }
                         },
                         Err(e) => eprintln!("Capture failed: {}", e),
                     }
                }

                // Cap at ~10 FPS (100ms)
                let elapsed = start.elapsed();
                if elapsed < Duration::from_millis(100) {
                    sleep(Duration::from_millis(100) - elapsed).await;
                }
            }
        });
    }

    pub fn stop(&self) {
        self.set_running(false);
    }

    pub fn set_running(&self, state: bool) {
        let mut running = self.running.lock().unwrap();
        *running = state;
        println!("📸 Screen Capture State: {}", state);
    }
}
