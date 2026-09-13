// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
mod connections;
mod definitions;
mod events;
mod plans;
mod runs;
mod scenarios;
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
            definitions::definitions_load,
            definitions::definitions_save,
            events::events_load,
            events::events_save,
            events::events_delete,
            plans::plans_load,
            plans::plans_save,
            plans::plans_delete,
            runs::runs_load,
            runs::runs_save,
            runs::executor::start_plan_run,
            runs::executor::start_scenario_run,
            scenarios::scenarios_load,
            scenarios::scenarios_save,
            scenarios::scenarios_delete,
            sends::sends_dispatch_douyin,
            sends::sends_dispatch_wecom,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
