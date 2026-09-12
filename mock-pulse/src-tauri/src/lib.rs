// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
mod connections;
mod events;
mod runs;
mod sends;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            connections::connections_load,
            connections::connections_save,
            connections::connections_test_douyin,
            connections::connections_test_wecom,
            events::events_load,
            events::events_save,
            events::events_delete,
            runs::runs_load,
            runs::runs_save,
            sends::sends_dispatch_douyin,
            sends::sends_dispatch_wecom,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
