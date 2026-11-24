//! Desktop and phone shell. All calculations live in TypeScript (`src/calc`), so the same code
//! runs in the app and in the browser demo; Rust hosts the window, keeps the API key in the
//! system vault and carries the "Sprawdź przepisy z AI" question (`ai.rs`).

mod ai;
mod secrets;
#[cfg(target_os = "android")]
mod tls;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Without the vault the calculator still works fully - only the AI check has no key.
    if let Err(e) = secrets::init() {
        eprintln!("vault: {}", e.message);
    }
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            secrets::ai_key_hint,
            secrets::ai_key_set,
            secrets::ai_key_delete,
            secrets::ai_key_reveal,
            ai::ai_ask,
            ai::ai_fetch_source,
        ])
        .run(tauri::generate_context!())
        .expect("error while running the application");
}
