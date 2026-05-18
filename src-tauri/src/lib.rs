#[cfg(target_os = "macos")]
#[tauri::command]
fn send_app_notification(title: String, body: String) -> Result<(), String> {
    use mac_notification_sys::{send_notification, set_application, Notification};

    let bundle_id = if tauri::is_dev() {
        "com.apple.Terminal"
    } else {
        "com.bunly.app"
    };
    let _ = set_application(bundle_id);

    let options = Notification::new();

    send_notification(&title, None, &body, Some(&options))
        .map(|_| ())
        .map_err(|e| e.to_string())
}

#[cfg(not(target_os = "macos"))]
#[tauri::command]
fn send_app_notification(app: tauri::AppHandle, title: String, body: String) -> Result<(), String> {
    use tauri_plugin_notification::NotificationExt;
    app.notification()
        .builder()
        .title(&title)
        .body(&body)
        .show()
        .map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_sql::Builder::new().build())
        .invoke_handler(tauri::generate_handler![send_app_notification])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
