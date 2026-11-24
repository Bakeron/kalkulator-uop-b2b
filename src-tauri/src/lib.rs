//! Desktop and phone shell. All calculations live in TypeScript (`src/calc`), so the same code
//! runs in the app and in the browser demo; Rust only hosts the window (later: the API key vault).

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running the application");
}
