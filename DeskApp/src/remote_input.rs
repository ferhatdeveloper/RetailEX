use enigo::*;
use serde::{Deserialize, Serialize};
use std::sync::Mutex;

#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum RemoteInputEvent {
    #[serde(rename = "MOUSE_MOVE")]
    MouseMove { x: i32, y: i32 },
    #[serde(rename = "MOUSE_CLICK")]
    MouseClick { button: String }, // "left", "right"
    #[serde(rename = "KEY_PRESS")]
    KeyPress { key: String },
    #[serde(rename = "SCROLL")]
    Scroll { x: i32, y: i32 },
}

pub struct RemoteInputManager {
    enigo: Mutex<Enigo>,
}

impl RemoteInputManager {
    pub fn new() -> Self {
        Self {
            enigo: Mutex::new(Enigo::new()),
        }
    }

    pub fn handle_event_json(&self, json_str: &str) -> Result<(), String> {
        let event: RemoteInputEvent = serde_json::from_str(json_str).map_err(|e| e.to_string())?;
        self.handle_event(event);
        Ok(())
    }

    pub fn handle_event(&self, event: RemoteInputEvent) {
        let mut enigo = self.enigo.lock().unwrap();
        match event {
            RemoteInputEvent::MouseMove { x, y } => {
                enigo.mouse_move_to(x, y);
            }
            RemoteInputEvent::MouseClick { button } => {
                match button.as_str() {
                    "left" => enigo.mouse_click(MouseButton::Left),
                    "right" => enigo.mouse_click(MouseButton::Right),
                    _ => {}
                }
            }
            RemoteInputEvent::KeyPress { key } => {
                 enigo.key_click(Key::Layout(key.chars().next().unwrap_or(' ')));
            }
            RemoteInputEvent::Scroll { x, y } => {
                enigo.mouse_scroll_y(y);
                enigo.mouse_scroll_x(x);
            }
        }
    }
}
