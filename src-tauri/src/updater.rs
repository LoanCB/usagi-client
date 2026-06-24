//! Custom updater commands.
//!
//! The JS `@tauri-apps/plugin-updater` `check()` API only allows overriding
//! request headers, not the endpoint — the endpoint is frozen in
//! `tauri.conf.json` (the stable manifest). To support the beta channel, which
//! lives at a different manifest URL, we build the updater at runtime here with
//! `updater_builder().endpoints(...)` and expose two commands the frontend
//! drives for both channels.
//!
//! The signing pubkey is inherited from `tauri.conf.json`, so beta artifacts
//! (signed by CI with the same key) are verified without extra configuration.

use serde::Serialize;
use tauri::ipc::Channel;
use tauri_plugin_updater::UpdaterExt;
use url::Url;

/// Update metadata returned to the frontend. The native `Update` object is not
/// serializable and cannot cross the JS bridge, so we only return metadata from
/// the check; `install_update` re-runs its own check to obtain an installable
/// `Update` (the recommended pattern for a dynamic endpoint).
#[derive(Serialize)]
pub struct UpdateInfo {
    version: String,
    current_version: String,
    notes: Option<String>,
}

/// Download progress events streamed to the frontend over an IPC channel.
///
/// The variant names are kept in PascalCase (`tag = "event"` → `"Started"`,
/// `"Progress"`, `"Finished"`) to match the frontend's `message.event` checks,
/// while each variant's fields are camelCased (`content_length` →
/// `contentLength`) to match the frontend's `message.data` reads. A single
/// container-level `rename_all` would (wrongly) rename the variants too, so the
/// field renaming is applied per variant instead.
#[derive(Clone, Serialize)]
#[serde(tag = "event", content = "data")]
pub enum DownloadEvent {
    #[serde(rename_all = "camelCase")]
    Started { content_length: Option<u64> },
    #[serde(rename_all = "camelCase")]
    Progress { chunk_length: usize },
    Finished,
}

fn parse_endpoints(endpoints: Vec<String>) -> Result<Vec<Url>, String> {
    endpoints
        .into_iter()
        .map(|e| Url::parse(&e).map_err(|err| format!("invalid endpoint {e}: {err}")))
        .collect()
}

/// Check the given endpoint(s) for an available update. Returns `None` when the
/// installed version is already up to date (or no manifest is published yet).
#[tauri::command]
pub async fn check_update(
    app: tauri::AppHandle,
    endpoints: Vec<String>,
) -> Result<Option<UpdateInfo>, String> {
    let urls = parse_endpoints(endpoints)?;
    let updater = app
        .updater_builder()
        .endpoints(urls)
        .map_err(|e| e.to_string())?
        .build()
        .map_err(|e| e.to_string())?;

    match updater.check().await.map_err(|e| e.to_string())? {
        Some(update) => Ok(Some(UpdateInfo {
            version: update.version.clone(),
            current_version: update.current_version.clone(),
            notes: update.body.clone(),
        })),
        None => Ok(None),
    }
}

/// Download and install the update available at the given endpoint(s),
/// streaming progress over `on_event`. Re-runs the check to obtain an
/// installable `Update`, then verifies its signature and applies it.
#[tauri::command]
pub async fn install_update(
    app: tauri::AppHandle,
    endpoints: Vec<String>,
    on_event: Channel<DownloadEvent>,
) -> Result<(), String> {
    let urls = parse_endpoints(endpoints)?;
    let updater = app
        .updater_builder()
        .endpoints(urls)
        .map_err(|e| e.to_string())?
        .build()
        .map_err(|e| e.to_string())?;

    let update = updater
        .check()
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "No update available".to_string())?;

    // `download_and_install` only exposes a per-chunk callback (with the total
    // content length on every call) and a finished callback. Emit `Started`
    // once on the first chunk so the frontend can size its progress bar.
    let mut started = false;
    let progress_channel = on_event.clone();
    update
        .download_and_install(
            move |chunk_length, content_length| {
                if !started {
                    started = true;
                    let _ = progress_channel.send(DownloadEvent::Started { content_length });
                }
                let _ = progress_channel.send(DownloadEvent::Progress { chunk_length });
            },
            move || {
                let _ = on_event.send(DownloadEvent::Finished);
            },
        )
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}
