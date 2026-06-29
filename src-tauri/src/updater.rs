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

/// Rewrite a manifest endpoint so it points at the variant matching how the app
/// was installed.
///
/// The Tauri updater manifest has a single `linux-x86_64` platform key, but a
/// Linux release ships incompatible install formats (AppImage vs `.deb`): the
/// running binary is patched at bundle time with its own type, so a `.deb`
/// install runs `install_deb`, which rejects anything that is not a real `.deb`
/// with `InvalidUpdaterFormat`. CI therefore publishes a parallel manifest whose
/// `linux-x86_64` entry points at the signed `.deb`; this maps the default
/// (AppImage) endpoint to that variant when — and only when — the current binary
/// is a `.deb` bundle.
///
/// The transform inserts `-deb` before the trailing `.json` (e.g.
/// `latest.json` → `latest-deb.json`, `latest-beta.json` → `latest-beta-deb.json`).
/// Any non-`.deb` bundle type (AppImage, rpm, unknown, or non-Linux) is left
/// untouched.
fn manifest_endpoint_for_bundle(endpoint: &str, is_deb: bool) -> String {
    if !is_deb {
        return endpoint.to_string();
    }
    match endpoint.strip_suffix(".json") {
        Some(stem) => format!("{stem}-deb.json"),
        None => endpoint.to_string(),
    }
}

/// Whether the running binary was installed from a Debian package.
fn current_bundle_is_deb() -> bool {
    matches!(
        tauri::utils::platform::bundle_type(),
        Some(tauri::utils::config::BundleType::Deb)
    )
}

/// Map the incoming endpoints to the variant matching the current install
/// format. The frontend always sends the default (AppImage/stable) manifest URL;
/// `.deb` installs are transparently redirected to the `-deb` manifest.
fn resolve_endpoints(endpoints: Vec<String>) -> Vec<String> {
    let is_deb = current_bundle_is_deb();
    endpoints
        .iter()
        .map(|e| manifest_endpoint_for_bundle(e, is_deb))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::manifest_endpoint_for_bundle;

    #[test]
    fn deb_install_redirects_stable_manifest() {
        assert_eq!(
            manifest_endpoint_for_bundle(
                "https://github.com/LoanCB/usagi-client/releases/latest/download/latest.json",
                true,
            ),
            "https://github.com/LoanCB/usagi-client/releases/latest/download/latest-deb.json"
        );
    }

    #[test]
    fn deb_install_redirects_beta_manifest() {
        assert_eq!(
            manifest_endpoint_for_bundle(
                "https://github.com/LoanCB/usagi-client/releases/download/latest-beta/latest-beta.json",
                true,
            ),
            "https://github.com/LoanCB/usagi-client/releases/download/latest-beta/latest-beta-deb.json"
        );
    }

    #[test]
    fn non_deb_install_keeps_endpoint_unchanged() {
        let url = "https://github.com/LoanCB/usagi-client/releases/latest/download/latest.json";
        assert_eq!(manifest_endpoint_for_bundle(url, false), url);
    }

    #[test]
    fn deb_install_leaves_non_json_endpoint_unchanged() {
        let url = "https://example.com/updates";
        assert_eq!(manifest_endpoint_for_bundle(url, true), url);
    }
}

/// Check the given endpoint(s) for an available update. Returns `None` when the
/// installed version is already up to date (or no manifest is published yet).
#[tauri::command]
pub async fn check_update(
    app: tauri::AppHandle,
    endpoints: Vec<String>,
) -> Result<Option<UpdateInfo>, String> {
    let urls = parse_endpoints(resolve_endpoints(endpoints))?;
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
    let urls = parse_endpoints(resolve_endpoints(endpoints))?;
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
