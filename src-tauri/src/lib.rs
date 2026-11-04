//! GameOn Timer — Tauri host.
//!
//! The UI owns session state today (persisted to the WebView's localStorage,
//! which Tauri keeps in the app data directory). Native commands — SQLite
//! storage, receipt printing — will be registered here.

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running GameOn Timer");
}
