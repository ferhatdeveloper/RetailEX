fn main() {
    slint_build::compile("src/ui_hub.slint").unwrap();
    tauri_build::build();
}
