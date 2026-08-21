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

pub mod crypto;

#[cfg(desktop)]
mod updater;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_sql::Builder::new().build());

    let builder = builder.manage(std::sync::Mutex::new(crypto::state::CryptoState::default()));

    #[cfg(desktop)]
    let builder = builder
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            send_app_notification,
            updater::check_update,
            updater::install_update,
            crypto::state::crypto_prepare_registration,
            crypto::state::crypto_begin_unlock,
            crypto::state::crypto_complete_unlock,
            crypto::state::crypto_unlock_with_recovery,
            crypto::state::crypto_lock,
            crypto::state::crypto_is_unlocked,
            crypto::state::crypto_encrypt_record,
            crypto::state::crypto_decrypt_record,
        ]);

    #[cfg(not(desktop))]
    let builder = builder.invoke_handler(tauri::generate_handler![
        send_app_notification,
        crypto::state::crypto_prepare_registration,
        crypto::state::crypto_begin_unlock,
        crypto::state::crypto_complete_unlock,
        crypto::state::crypto_unlock_with_recovery,
        crypto::state::crypto_lock,
        crypto::state::crypto_is_unlocked,
        crypto::state::crypto_encrypt_record,
        crypto::state::crypto_decrypt_record,
    ]);

    builder
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
