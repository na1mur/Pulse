//! Pulse desktop shell: hosts the Svelte UI in a Tauri window and the `pulse-core` library in this
//! native process. Commands stay thin: parse input, call `pulse_core::api`, map errors
//! (docs/ARCHITECTURE.md section 3). Platform code (tray, shortcut, OS events, trackers) arrives
//! in its own modules with the tasks that need it.

// Release builds are GUI apps with no console window; debug builds keep it for logs.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

/// The version of the linked core, for the About section (SET-05).
#[tauri::command]
fn core_version() -> &'static str {
    pulse_core::api::version()
}

fn main() -> Result<(), tauri::Error> {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![core_version])
        .run(tauri::generate_context!())
}
