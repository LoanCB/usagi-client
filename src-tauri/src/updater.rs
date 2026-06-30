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

/// Full version of the running binary, captured at compile time from the git
/// tag CI exposes as `VITE_APP_GIT_TAG` (e.g. `v2026.1.1-beta15`). `None` for
/// local/dev builds where the variable is unset.
const FULL_VERSION_TAG: Option<&str> = option_env!("VITE_APP_GIT_TAG");

/// Decide whether `release` is newer than what is installed.
///
/// The native updater compares `release.version` against the binary's
/// `package_info().version`, but CI mangles that version for WiX/MSI: the year
/// is truncated (`2026` → `26`) and any `-betaN` suffix is *stripped entirely*.
/// So every beta of `2026.1.1` compiles to the same `26.1.1`, while the beta
/// manifest advertises the full `2026.1.1-betaN`. The default comparison
/// (`2026.1.1-beta15 > 26.1.1`) is therefore always true — the app re-offers the
/// version it is already running, forever.
///
/// We must compare like with like. Stable manifests advertise the *mangled*
/// version (`26.3.0`) so they are compared against the mangled binary version,
/// exactly as the native updater does. Beta manifests advertise the full
/// `2026.1.1-betaN` (carrying a pre-release identifier), so they are compared
/// against the full installed git tag — the only value that distinguishes one
/// beta from another. Comparing a mangled stable release against the full tag
/// (`26.3.0 > 2026.2.0`) would wrongly suppress every stable update, so the
/// release version's shape decides the basis: pre-release ⇒ beta ⇒ full tag.
fn release_is_newer(
    binary_version: &semver::Version,
    full_tag: Option<&str>,
    release_version: &semver::Version,
) -> bool {
    let installed_full = full_tag
        .map(|t| t.trim_start_matches('v'))
        .and_then(|t| semver::Version::parse(t).ok());

    match installed_full {
        // Beta channel: the manifest version carries a pre-release suffix, so
        // compare full tag to full release version.
        Some(installed) if !release_version.pre.is_empty() => *release_version > installed,
        // Stable channel (or unparseable tag): compare against the mangled
        // binary version, matching the native comparator.
        _ => release_version > binary_version,
    }
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
    use super::{manifest_endpoint_for_bundle, release_is_newer};
    use semver::Version;

    fn v(s: &str) -> Version {
        Version::parse(s).unwrap()
    }

    #[test]
    fn beta_offers_strictly_newer_beta() {
        // Installed beta14, manifest advertises beta15 → update.
        assert!(release_is_newer(
            &v("26.1.1"),
            Some("2026.1.1-beta14"),
            &v("2026.1.1-beta15"),
        ));
    }

    #[test]
    fn beta_does_not_reoffer_the_installed_beta() {
        // The bug: installed beta15, manifest advertises beta15. The native
        // comparator saw 2026.1.1-beta15 > 26.1.1 (mangled binary) and looped
        // forever. With the full installed tag, equal versions → no update.
        assert!(!release_is_newer(
            &v("26.1.1"),
            Some("2026.1.1-beta15"),
            &v("2026.1.1-beta15"),
        ));
    }

    #[test]
    fn beta_does_not_offer_an_older_beta() {
        assert!(!release_is_newer(
            &v("26.1.1"),
            Some("2026.1.1-beta15"),
            &v("2026.1.1-beta14"),
        ));
    }

    #[test]
    fn beta_tag_with_v_prefix_is_parsed() {
        // VITE_APP_GIT_TAG carries the leading "v" (e.g. "v2026.1.1-beta15").
        assert!(!release_is_newer(
            &v("26.1.1"),
            Some("v2026.1.1-beta15"),
            &v("2026.1.1-beta15"),
        ));
    }

    #[test]
    fn falls_back_to_binary_version_when_no_tag() {
        // Dev builds / stable installs without a full tag: behave like the
        // native comparator (release.version > current binary version).
        assert!(release_is_newer(&v("26.1.1"), None, &v("26.2.0")));
        assert!(!release_is_newer(&v("26.2.0"), None, &v("26.2.0")));
    }

    #[test]
    fn falls_back_when_tag_is_unparseable() {
        assert!(release_is_newer(&v("26.1.1"), Some("not-a-version"), &v("26.2.0")));
    }

    #[test]
    fn stable_update_compares_against_binary_not_full_tag() {
        // Stable manifests advertise the *mangled* version (e.g. 26.3.0), while
        // the full tag is 2026.x. Comparing the mangled release against the full
        // tag (26.3.0 > 2026.2.0) would be false and stable updates would never
        // be offered. The release version's shape must dictate which installed
        // version it is compared against.
        assert!(release_is_newer(
            &v("26.2.0"),
            Some("v2026.2.0"),
            &v("26.3.0"),
        ));
        // Already on the latest stable → no update.
        assert!(!release_is_newer(
            &v("26.2.0"),
            Some("v2026.2.0"),
            &v("26.2.0"),
        ));
    }

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

/// Build an updater for the given endpoints, redirecting `.deb` installs to the
/// `-deb` manifest and installing the version comparator that handles the
/// mangled beta versioning (see `release_is_newer`).
fn build_updater(
    app: &tauri::AppHandle,
    endpoints: Vec<String>,
) -> Result<tauri_plugin_updater::Updater, String> {
    let urls = parse_endpoints(resolve_endpoints(endpoints))?;
    app.updater_builder()
        .endpoints(urls)
        .map_err(|e| e.to_string())?
        .version_comparator(|current, release| {
            release_is_newer(&current, FULL_VERSION_TAG, &release.version)
        })
        .build()
        .map_err(|e| e.to_string())
}

/// Check the given endpoint(s) for an available update. Returns `None` when the
/// installed version is already up to date (or no manifest is published yet).
#[tauri::command]
pub async fn check_update(
    app: tauri::AppHandle,
    endpoints: Vec<String>,
) -> Result<Option<UpdateInfo>, String> {
    let updater = build_updater(&app, endpoints)?;

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
    let updater = build_updater(&app, endpoints)?;

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
