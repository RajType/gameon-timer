//! GameOn Timer — Tauri host.
//!
//! All operational data lives in one SQLite database in the app data
//! directory (override with `GAMEON_DATA_DIR`, used by tests). The UI talks to
//! it only through the commands in [`commands`].

pub mod admin;
pub mod backup;
pub mod billing;
pub mod bootstrap;
pub mod commands;
pub mod db;
pub mod error;
pub mod fa;
pub mod legacy;
pub mod models;
pub mod repo;
pub mod seed;
pub mod state;

use std::path::PathBuf;

use tauri::Manager;

fn data_dir(app: &tauri::App) -> PathBuf {
    if let Some(dir) = std::env::var_os("GAMEON_DATA_DIR").filter(|d| !d.is_empty()) {
        return PathBuf::from(dir);
    }
    app.path().app_data_dir().unwrap_or_else(|_| std::env::temp_dir().join("com.gameon.timer"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let dir = data_dir(app);
            app.manage(state::init(&dir));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::bootstrap,
            commands::skip_legacy_import,
            commands::get_floor,
            commands::start_session,
            commands::pause_session,
            commands::resume_session,
            commands::set_session_controllers,
            commands::add_order_item,
            commands::remove_order_item,
            commands::preview_checkout,
            commands::checkout,
            commands::day_summary,
            commands::get_catalog,
            commands::create_station,
            commands::update_station,
            commands::set_station_enabled,
            commands::create_rate_plan,
            commands::update_rate_plan,
            commands::get_settings,
            commands::update_settings,
            commands::data_info,
            commands::create_backup,
            commands::export_backup,
            commands::restore_backup,
            commands::restore_backup_from_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running GameOn Timer");
}
