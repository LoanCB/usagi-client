fn main() {
    // `updater.rs` bakes the full version tag in at compile time via
    // `option_env!("VITE_APP_GIT_TAG")`. Without this, a cached build (e.g.
    // swatinem/rust-cache in CI) could reuse an object file compiled with a
    // stale tag, breaking the beta version comparison. Force a rebuild whenever
    // the tag changes.
    println!("cargo:rerun-if-env-changed=VITE_APP_GIT_TAG");
    tauri_build::build()
}
