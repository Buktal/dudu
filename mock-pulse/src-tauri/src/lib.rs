// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
mod connections;
mod events;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            connections::connections_load,
            connections::connections_save,
            connections::connections_test_douyin,
            events::events_load,
            events::events_save,
            events::events_delete,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
