# Plan 3 — Cryptographie cliente en Rust

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Donner au client Bunly les primitives cryptographiques qui rendent la synchronisation chiffrée de bout en bout possible — dérivation de clés, enveloppement, clé de récupération, identité X25519 et chiffrement d'enregistrement — exposées au front par des commandes Tauri, sans qu'aucune clé ne quitte la mémoire Rust.

**Architecture:** Un module `src-tauri/src/crypto/` en fichiers courts à responsabilité unique, testés par vecteurs Rust. Les clés déverrouillées vivent dans un `Mutex<CryptoState>` managé par Tauri et sont effacées par `zeroize` au verrouillage. Le front ne voit jamais une clé : il envoie un mot de passe et reçoit des blobs opaques.

**Tech Stack:** Rust (edition 2021), Tauri 2, `argon2` 0.5.3, `chacha20poly1305` 0.11, `x25519-dalek` 3.0 (feature `static_secrets`), `hkdf` 0.13 + `sha2` 0.11, `bip39` 2.2, `zeroize` 1.9, `getrandom` 0.4.

**Spec:** [docs/superpowers/specs/2026-08-20-sync-offline-first-design.md](../specs/2026-08-20-sync-offline-first-design.md) — §2 (modèle cryptographique) et §4 (contrat serveur).

## Global Constraints

- Gestionnaire de paquets : **pnpm**, jamais npm (CLAUDE.md).
- Commentaires en **anglais**, concis, expliquant le *pourquoi* et non le *quoi* (CLAUDE.md).
- TypeScript : tabulations, guillemets doubles (biome.json). Rust : `cargo fmt` par défaut.
- Types TypeScript dans leur propre fichier, sauf props de composant non partagées.
- **Paramètres Argon2id : `m = 65536 KiB (64 MiB), t = 3, p = 4`**, sortie 32 octets. Ces valeurs viennent du spec, pas du goût.
- **`authSalt` : exactement 32 caractères hexadécimaux minuscules.** Le serveur le valide (`/^[a-f0-9]{32}$/`) et refuse tout le reste — voir §2.1 du spec pour pourquoi.
- **Les champs envoyés au serveur sont en `camelCase`.** Le serveur applique `forbidNonWhitelisted` : un champ mal nommé provoque un 400 sur *chaque* requête, pas une dégradation silencieuse.
- **Contraintes serveur, relevées dans le code de `usagi-server` à `8ae5354`, pas de mémoire :**
  - `AUTH_SALT_FORMAT = /^[a-f0-9]{32}$/` ([hashing.service.ts:10](../../../usagi-server/src/crypto/hashing.service.ts))
  - `WRAPPED_SECRET_BYTE_LENGTH = { min: 40, max: 128 }` — bornes sur les octets **décodés**
  - `PUBLIC_KEY_BYTE_LENGTH = { min: 32, max: 64 }`
  - `authVerifier` : `@MinLength(16) @MaxLength(512)`
  - `KDF_PARAMS_ALLOWLIST` ne contient que `DEFAULT_KDF_PARAMS = { memoryCost: 65536, timeCost: 3, parallelism: 4 }`. Envoyer autre chose à `PUT /v1/keys` est un 400.
  - **`RegisterDto` niche `wrappedDek`, `wrappedDekRecovery`, `publicKey` et `wrappedPrivateKey` sous un objet `keys`**, et n'accepte **aucun** champ `kdfParams`. L'inscription utilise toujours les paramètres par défaut du serveur.
- **Aucune clé ne traverse la frontière IPC.** Les commandes acceptent un mot de passe ou des blobs, et rendent des blobs.
- **HORS PÉRIMÈTRE :** persistance locale des blobs, appels réseau, UI. Plans 4 et 5.

---

## Contexte : trois faits vérifiés avant rédaction

1. **La matrice de crates a été validée par compilation**, pas par mémoire. `argon2` n'a pas de version 0.6 stable — uniquement des release candidates ; on épingle 0.5.3. `x25519-dalek` 3.0 n'expose `StaticSecret` que derrière la feature **`static_secrets`** : sans elle, le code ne compile pas. `XNonce::from_slice` est déprécié en `chacha20poly1305` 0.11 — utiliser `nonce.into()`.

2. **Les commandes Tauri personnalisées ne nécessitent aucune entrée de capability.** La restriction est opt-in via `AppManifest::commands` dans `build.rs`, que ce projet n'utilise pas. Ne pas toucher à `capabilities/`.

3. **Aucune CI ne compile ni ne teste le Rust aujourd'hui.** `pr-checks.yml` n'a aucune étape Rust et `release.yml` ne fait que `pnpm tauri build`. Les 9 tests inline d'`updater.rs` ne s'exécutent nulle part. La Task 1 corrige cela avant que quoi que ce soit de cryptographique n'atterrisse.

## Séparation de domaine — table de référence

Chaque dérivation et chaque enveloppement porte une chaîne distincte. Sans cela, `authVerifier` et la KEK seraient identiques et le serveur détiendrait la clé d'enveloppement.

| Usage | Constante |
|---|---|
| HKDF → `authVerifier` | `b"usagi/auth-verifier/v1"` |
| HKDF → KEK | `b"usagi/kek/v1"` |
| HKDF → KEK de récupération | `b"usagi/recovery-kek/v1"` |
| AAD, DEK enveloppée par la KEK | `b"usagi/wrap/dek/v1"` |
| AAD, DEK enveloppée par la récupération | `b"usagi/wrap/dek-recovery/v1"` |
| AAD, clé privée X25519 | `b"usagi/wrap/private-key/v1"` |
| AAD, enregistrement | `userId ‖ 0x1F ‖ entityType ‖ 0x1F ‖ entityId` |

Le séparateur `0x1F` (unit separator) sur l'AAD d'enregistrement n'est pas cosmétique : sans lui, `("ab", "c")` et `("a", "bc")` produiraient la même AAD, et un serveur malveillant pourrait déplacer un blob d'une entité vers une autre.

## Format de fil des blobs

`nonce (24 octets) ‖ ciphertext ‖ tag (16 octets)`, encodé base64 standard pour le transport.

Pour un secret de 32 octets, cela fait **72 octets** décodés — au centre des bornes 40–128 que le serveur impose sur les blobs enveloppés.

## Structure des fichiers

| Fichier | Responsabilité |
|---|---|
| `src-tauri/src/crypto/mod.rs` | Racine du module, réexports, type d'erreur |
| `src-tauri/src/crypto/derive.rs` | Argon2id et HKDF |
| `src-tauri/src/crypto/wrap.rs` | XChaCha20-Poly1305, format de fil |
| `src-tauri/src/crypto/recovery.rs` | Clé de récupération BIP39 |
| `src-tauri/src/crypto/identity.rs` | Paire X25519 |
| `src-tauri/src/crypto/account.rs` | Inscription et changement de mot de passe |
| `src-tauri/src/crypto/records.rs` | Chiffrement d'enregistrement |
| `src-tauri/src/crypto/state.rs` | `CryptoState` et commandes Tauri |
| `src/crypto/types.ts` | Types TypeScript du contrat IPC |
| `src/crypto/index.ts` | Enveloppes `invoke` typées |
| `.github/workflows/pr-checks.yml` | Job Rust |

---

## Task 1 : CI Rust et squelette du module

Rien de cryptographique n'atterrit avant que la CI ne sache l'exécuter.

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Create: `src-tauri/src/crypto/mod.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `.github/workflows/pr-checks.yml`

**Interfaces:**
- Produces : le module `crypto`, et l'enum `CryptoError` que toutes les tâches suivantes renvoient.

- [ ] **Step 1 : Ajouter les dépendances**

Dans `src-tauri/Cargo.toml`, sous `[dependencies]`, après `serde_json = "1"` :

```toml
# Verified by compilation, not from memory: argon2 has no stable 0.6 (release
# candidates only), and x25519-dalek 3.0 gates StaticSecret behind a feature.
argon2 = "0.5.3"
chacha20poly1305 = "0.11.0"
x25519-dalek = { version = "3.0.0", features = ["static_secrets"] }
hkdf = "0.13.0"
sha2 = "0.11.0"
bip39 = "2.2.2"
zeroize = { version = "1.9.0", features = ["derive"] }
getrandom = "0.4.3"
base64 = "0.22"
```

- [ ] **Step 2 : Écrire le test qui échoue**

Créer `src-tauri/src/crypto/mod.rs` avec uniquement le test :

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn error_messages_are_human_readable() {
        assert_eq!(CryptoError::Locked.to_string(), "the vault is locked");
        assert_eq!(
            CryptoError::Decrypt.to_string(),
            "decryption failed: wrong key, altered data, or mismatched context"
        );
    }
}
```

- [ ] **Step 3 : Lancer le test et vérifier qu'il échoue**

Run: `cd src-tauri && cargo test crypto::`
Expected: FAIL — `cannot find type CryptoError in this scope`.

- [ ] **Step 4 : Implémenter le module**

En tête de `src-tauri/src/crypto/mod.rs`, avant le bloc de tests :

```rust
pub mod derive;

use std::fmt;

/// Every failure the crypto layer can surface to the frontend.
///
/// Deliberately coarse: a caller must not be able to tell a wrong password from
/// altered ciphertext from a mismatched entity id, because each of those
/// distinctions leaks something to an attacker holding the blobs.
#[derive(Debug, PartialEq, Eq)]
pub enum CryptoError {
    /// A command needing keys was called before `unlock`.
    Locked,
    /// Anything that went wrong opening a sealed blob.
    Decrypt,
    /// Input that is malformed on its face — bad base64, wrong length.
    Input(String),
}

impl fmt::Display for CryptoError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Locked => write!(f, "the vault is locked"),
            Self::Decrypt => write!(
                f,
                "decryption failed: wrong key, altered data, or mismatched context"
            ),
            Self::Input(what) => write!(f, "invalid input: {what}"),
        }
    }
}

// Tauri commands return Result<T, String>; this keeps that conversion in one place.
impl From<CryptoError> for String {
    fn from(e: CryptoError) -> Self {
        e.to_string()
    }
}
```

Créer `src-tauri/src/crypto/derive.rs` vide pour l'instant :

```rust
// Key derivation lands in the next task.
```

Déclarer le module dans `src-tauri/src/lib.rs`, juste avant `#[cfg(desktop)] mod updater;` :

```rust
mod crypto;
```

- [ ] **Step 5 : Lancer le test et vérifier qu'il passe**

Run: `cd src-tauri && cargo test crypto::`
Expected: PASS (1 test).

- [ ] **Step 6 : Ajouter le job Rust à la CI**

Dans `.github/workflows/pr-checks.yml`, ajouter un quatrième job après le job `build` existant :

```yaml
  rust:
    name: Rust
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: dtolnay/rust-toolchain@stable
        with:
          components: rustfmt, clippy

      - uses: Swatinem/rust-cache@v2
        with:
          workspaces: src-tauri

      # Tauri links against the system webkit stack; without these the crate
      # graph fails to build on a bare runner.
      - name: Install Tauri system dependencies
        run: |
          sudo apt-get update
          sudo apt-get install -y libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf

      - run: cargo fmt --all --check
        working-directory: src-tauri

      - run: cargo clippy --all-targets -- -D warnings
        working-directory: src-tauri

      - run: cargo test
        working-directory: src-tauri
```

- [ ] **Step 7 : Vérifier localement ce que la CI exécutera**

```bash
cd src-tauri
cargo fmt --all --check
cargo clippy --all-targets -- -D warnings
cargo test
```

Expected : `cargo clippy` et `cargo test` sortent en 0. `cargo test` fait passer les **11** tests préexistants d'`updater.rs` **plus** le nouveau — c'est la première fois qu'ils s'exécutent en CI.

`cargo fmt --all --check` **échouera** : le dépôt n'a jamais été passé à rustfmt et `updater.rs` porte deux écarts préexistants (un `enum` à champs nommés aux lignes ~38 et un `assert!` multi-arguments à la ligne ~198). Lancer `cargo fmt --all`, inclure le reformatage dans le commit, et le signaler dans le rapport — c'est attendu, pas un défaut de cette tâche.

- [ ] **Step 8 : Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/crypto src-tauri/src/lib.rs .github/workflows/pr-checks.yml
git commit -m "ci: :green_heart: run cargo fmt, clippy and test on every pull request"
```

---

## Task 2 : Dérivation de clés

**Files:**
- Modify: `src-tauri/src/crypto/derive.rs`
- Modify: `src-tauri/src/crypto/mod.rs`

**Interfaces:**
- Produces :
  - `pub const ARGON2_MEMORY_KIB: u32 = 65536;`, `ARGON2_TIME_COST: u32 = 3;`, `ARGON2_PARALLELISM: u32 = 4;`
  - `pub fn derive_master_key(password: &str, auth_salt: &str) -> Result<[u8; 32], CryptoError>`
  - `pub fn derive_auth_verifier(master_key: &[u8; 32]) -> String` — 64 caractères hex
  - `pub fn derive_kek(master_key: &[u8; 32]) -> [u8; 32]`
  - `pub fn generate_auth_salt() -> String` — 32 caractères hex minuscules

- [ ] **Step 1 : Écrire les tests qui échouent**

Remplacer le contenu de `src-tauri/src/crypto/derive.rs` par :

```rust
#[cfg(test)]
mod tests {
    use super::*;

    const SALT: &str = "0123456789abcdef0123456789abcdef";

    #[test]
    fn master_key_is_deterministic() {
        assert_eq!(
            derive_master_key("correct horse", SALT).unwrap(),
            derive_master_key("correct horse", SALT).unwrap()
        );
    }

    #[test]
    fn master_key_changes_with_the_password() {
        assert_ne!(
            derive_master_key("correct horse", SALT).unwrap(),
            derive_master_key("correct horsf", SALT).unwrap()
        );
    }

    #[test]
    fn master_key_changes_with_the_salt() {
        let other = "fedcba9876543210fedcba9876543210";
        assert_ne!(
            derive_master_key("correct horse", SALT).unwrap(),
            derive_master_key("correct horse", other).unwrap()
        );
    }

    #[test]
    fn rejects_a_salt_that_is_not_32_lowercase_hex() {
        // The server enforces /^[a-f0-9]{32}$/ and refuses anything else, so a
        // client that produced another shape would fail at registration.
        for bad in [
            "0123456789ABCDEF0123456789ABCDEF", // uppercase
            "0123456789abcdef",                 // too short
            "0123456789abcdef0123456789abcdefff", // too long
            "0123456789abcdef0123456789abcdeg", // not hex
        ] {
            assert!(
                derive_master_key("pw", bad).is_err(),
                "should have rejected {bad}"
            );
        }
    }

    #[test]
    fn auth_verifier_and_kek_are_different() {
        // If these collided the server would hold the wrapping key.
        let mk = derive_master_key("correct horse", SALT).unwrap();
        let verifier = derive_auth_verifier(&mk);
        let kek = hex::encode(derive_kek(&mk));
        assert_ne!(verifier, kek);
    }

    #[test]
    fn auth_verifier_is_64_lowercase_hex() {
        let mk = derive_master_key("correct horse", SALT).unwrap();
        let v = derive_auth_verifier(&mk);
        assert_eq!(v.len(), 64);
        assert!(v.chars().all(|c| c.is_ascii_hexdigit() && !c.is_uppercase()));
    }

    #[test]
    fn generated_salts_match_the_server_format_and_differ() {
        let a = generate_auth_salt();
        let b = generate_auth_salt();
        assert_ne!(a, b);
        for s in [&a, &b] {
            assert_eq!(s.len(), 32);
            assert!(s.chars().all(|c| c.is_ascii_hexdigit() && !c.is_uppercase()));
        }
    }

    #[test]
    fn argon2_parameters_match_the_spec() {
        assert_eq!(ARGON2_MEMORY_KIB, 65536);
        assert_eq!(ARGON2_TIME_COST, 3);
        assert_eq!(ARGON2_PARALLELISM, 4);
    }
}
```

- [ ] **Step 2 : Lancer et vérifier l'échec**

Run: `cd src-tauri && cargo test crypto::derive`
Expected: FAIL — `cannot find function derive_master_key`.

- [ ] **Step 3 : Implémenter**

En tête de `src-tauri/src/crypto/derive.rs` :

```rust
use argon2::{Algorithm, Argon2, Params, Version};
use hkdf::Hkdf;
use sha2::Sha256;

use super::CryptoError;

/// Spec §2.1. Raising these later requires the lazy re-derivation described
/// there — the server keeps each account's parameters so old accounts stay
/// usable, which is also why prelogin returns them.
pub const ARGON2_MEMORY_KIB: u32 = 65536;
pub const ARGON2_TIME_COST: u32 = 3;
pub const ARGON2_PARALLELISM: u32 = 4;

const INFO_AUTH_VERIFIER: &[u8] = b"usagi/auth-verifier/v1";
const INFO_KEK: &[u8] = b"usagi/kek/v1";

fn is_auth_salt(s: &str) -> bool {
    s.len() == 32 && s.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}

/// Argon2id over the password, salted with the account's server-issued salt.
pub fn derive_master_key(password: &str, auth_salt: &str) -> Result<[u8; 32], CryptoError> {
    if !is_auth_salt(auth_salt) {
        return Err(CryptoError::Input(
            "auth salt must be 32 lowercase hex characters".into(),
        ));
    }
    let params = Params::new(
        ARGON2_MEMORY_KIB,
        ARGON2_TIME_COST,
        ARGON2_PARALLELISM,
        Some(32),
    )
    .map_err(|e| CryptoError::Input(e.to_string()))?;
    let argon = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);
    let mut out = [0u8; 32];
    argon
        .hash_password_into(password.as_bytes(), auth_salt.as_bytes(), &mut out)
        .map_err(|e| CryptoError::Input(e.to_string()))?;
    Ok(out)
}

fn expand(master_key: &[u8; 32], info: &[u8]) -> [u8; 32] {
    let hk = Hkdf::<Sha256>::new(None, master_key);
    let mut out = [0u8; 32];
    // Only fails when the output length exceeds 255 * HashLen; 32 never does.
    hk.expand(info, &mut out).expect("32 bytes is a valid HKDF length");
    out
}

/// What the server receives and hashes again. HKDF rather than a second Argon2id
/// pass: the master key already carries 256 bits, so re-stretching buys nothing,
/// and the property that matters — the server cannot walk back to the wrapping
/// key — is exactly what a one-way KDF gives.
pub fn derive_auth_verifier(master_key: &[u8; 32]) -> String {
    hex::encode(expand(master_key, INFO_AUTH_VERIFIER))
}

/// Wraps the DEK. Never leaves the device.
pub fn derive_kek(master_key: &[u8; 32]) -> [u8; 32] {
    expand(master_key, INFO_KEK)
}

pub fn generate_auth_salt() -> String {
    let mut raw = [0u8; 16];
    getrandom::fill(&mut raw).expect("OS RNG unavailable");
    hex::encode(raw)
}
```

Ajouter `hex = "0.4"` aux dépendances de `src-tauri/Cargo.toml`, et déclarer les modules dans `mod.rs` (remplacer la ligne `pub mod derive;` existante par la liste complète au fil des tâches).

- [ ] **Step 4 : Lancer et vérifier le succès**

Run: `cd src-tauri && cargo test crypto::derive`
Expected: PASS (8 tests). Les tests Argon2id prennent quelques secondes chacun — c'est normal, 64 Mio par dérivation.

- [ ] **Step 5 : Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/crypto
git commit -m "feat: :sparkles: derive the master key, auth verifier and KEK"
```

---

## Task 3 : Enveloppement et format de fil

**Files:**
- Create: `src-tauri/src/crypto/wrap.rs`
- Modify: `src-tauri/src/crypto/mod.rs`

**Interfaces:**
- Produces :
  - `pub fn seal(key: &[u8; 32], aad: &[u8], plaintext: &[u8]) -> String` — base64 de `nonce ‖ ct ‖ tag`
  - `pub fn open(key: &[u8; 32], aad: &[u8], blob: &str) -> Result<Vec<u8>, CryptoError>`
  - `pub const AAD_DEK: &[u8]`, `AAD_DEK_RECOVERY: &[u8]`, `AAD_PRIVATE_KEY: &[u8]`

- [ ] **Step 1 : Écrire les tests qui échouent**

Créer `src-tauri/src/crypto/wrap.rs` avec uniquement :

```rust
#[cfg(test)]
mod tests {
    use super::*;

    const KEY: [u8; 32] = [7u8; 32];
    const OTHER: [u8; 32] = [8u8; 32];

    #[test]
    fn round_trips() {
        let blob = seal(&KEY, AAD_DEK, b"a 32-byte secret goes here......");
        assert_eq!(
            open(&KEY, AAD_DEK, &blob).unwrap(),
            b"a 32-byte secret goes here......"
        );
    }

    #[test]
    fn a_wrapped_32_byte_secret_fits_the_server_bounds() {
        // The server rejects wrapped secrets outside 40..=128 decoded bytes.
        let blob = seal(&KEY, AAD_DEK, &[0u8; 32]);
        let decoded = base64_len(&blob);
        assert_eq!(decoded, 72, "24 nonce + 32 plaintext + 16 tag");
        assert!((40..=128).contains(&decoded));
    }

    #[test]
    fn every_seal_uses_a_fresh_nonce() {
        assert_ne!(seal(&KEY, AAD_DEK, b"same"), seal(&KEY, AAD_DEK, b"same"));
    }

    #[test]
    fn rejects_the_wrong_key() {
        let blob = seal(&KEY, AAD_DEK, b"secret");
        assert_eq!(open(&OTHER, AAD_DEK, &blob), Err(CryptoError::Decrypt));
    }

    #[test]
    fn rejects_a_different_aad() {
        // This is what stops a hostile server moving one account's wrapped DEK
        // into another slot.
        let blob = seal(&KEY, AAD_DEK, b"secret");
        assert_eq!(open(&KEY, AAD_DEK_RECOVERY, &blob), Err(CryptoError::Decrypt));
    }

    #[test]
    fn rejects_altered_ciphertext() {
        let blob = seal(&KEY, AAD_DEK, b"secret");
        let mut raw = base64_decode(&blob);
        let last = raw.len() - 1;
        raw[last] ^= 0x01;
        let tampered = base64_encode(&raw);
        assert_eq!(open(&KEY, AAD_DEK, &tampered), Err(CryptoError::Decrypt));
    }

    #[test]
    fn rejects_a_blob_too_short_to_hold_a_nonce() {
        assert!(matches!(
            open(&KEY, AAD_DEK, &base64_encode(&[0u8; 10])),
            Err(CryptoError::Input(_))
        ));
    }

    #[test]
    fn rejects_invalid_base64() {
        assert!(matches!(
            open(&KEY, AAD_DEK, "not base64!!"),
            Err(CryptoError::Input(_))
        ));
    }

    fn base64_decode(s: &str) -> Vec<u8> {
        use base64::Engine;
        base64::engine::general_purpose::STANDARD.decode(s).unwrap()
    }
    fn base64_encode(b: &[u8]) -> String {
        use base64::Engine;
        base64::engine::general_purpose::STANDARD.encode(b)
    }
    fn base64_len(s: &str) -> usize {
        base64_decode(s).len()
    }
}
```

- [ ] **Step 2 : Lancer et vérifier l'échec**

Run: `cd src-tauri && cargo test crypto::wrap`
Expected: FAIL — `cannot find function seal`.

- [ ] **Step 3 : Implémenter**

En tête de `src-tauri/src/crypto/wrap.rs` :

```rust
use base64::Engine;
use chacha20poly1305::aead::{Aead, KeyInit, Payload};
use chacha20poly1305::XChaCha20Poly1305;

use super::CryptoError;

pub const AAD_DEK: &[u8] = b"usagi/wrap/dek/v1";
pub const AAD_DEK_RECOVERY: &[u8] = b"usagi/wrap/dek-recovery/v1";
pub const AAD_PRIVATE_KEY: &[u8] = b"usagi/wrap/private-key/v1";

const NONCE_LEN: usize = 24;

fn b64() -> base64::engine::general_purpose::GeneralPurpose {
    base64::engine::general_purpose::STANDARD
}

/// Seals `plaintext` as `nonce ‖ ciphertext ‖ tag`, base64-encoded.
///
/// The nonce is prepended rather than stored separately so a blob is a single
/// opaque string end to end — the server never has to understand its parts.
pub fn seal(key: &[u8; 32], aad: &[u8], plaintext: &[u8]) -> String {
    let mut nonce = [0u8; NONCE_LEN];
    getrandom::fill(&mut nonce).expect("OS RNG unavailable");
    let cipher = XChaCha20Poly1305::new(key.into());
    let ciphertext = cipher
        .encrypt(&nonce.into(), Payload { msg: plaintext, aad })
        .expect("XChaCha20-Poly1305 encryption cannot fail on valid input");
    let mut out = Vec::with_capacity(NONCE_LEN + ciphertext.len());
    out.extend_from_slice(&nonce);
    out.extend_from_slice(&ciphertext);
    b64().encode(out)
}

pub fn open(key: &[u8; 32], aad: &[u8], blob: &str) -> Result<Vec<u8>, CryptoError> {
    let raw = b64()
        .decode(blob)
        .map_err(|_| CryptoError::Input("blob is not valid base64".into()))?;
    if raw.len() <= NONCE_LEN {
        return Err(CryptoError::Input("blob is shorter than its nonce".into()));
    }
    let (nonce, ciphertext) = raw.split_at(NONCE_LEN);
    let nonce: [u8; NONCE_LEN] = nonce.try_into().expect("checked length above");
    let cipher = XChaCha20Poly1305::new(key.into());
    cipher
        .decrypt(&nonce.into(), Payload { msg: ciphertext, aad })
        // Every failure mode collapses to one error on purpose: telling a wrong
        // key from altered data from a mismatched AAD would leak which it was.
        .map_err(|_| CryptoError::Decrypt)
}
```

Ajouter `pub mod wrap;` à `src-tauri/src/crypto/mod.rs`.

- [ ] **Step 4 : Lancer et vérifier le succès**

Run: `cd src-tauri && cargo test crypto::wrap`
Expected: PASS (8 tests).

- [ ] **Step 5 : Commit**

```bash
git add src-tauri/src/crypto
git commit -m "feat: :sparkles: seal and open blobs with XChaCha20-Poly1305"
```

---

## Task 4 : Clé de récupération

**Files:**
- Create: `src-tauri/src/crypto/recovery.rs`
- Modify: `src-tauri/src/crypto/mod.rs`

**Interfaces:**
- Produces :
  - `pub fn generate_recovery_phrase() -> String` — 24 mots séparés par une espace
  - `pub fn recovery_kek_from_phrase(phrase: &str) -> Result<[u8; 32], CryptoError>`

- [ ] **Step 1 : Écrire les tests qui échouent**

Créer `src-tauri/src/crypto/recovery.rs` avec uniquement :

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn phrase_is_24_words() {
        assert_eq!(generate_recovery_phrase().split_whitespace().count(), 24);
    }

    #[test]
    fn phrases_differ() {
        assert_ne!(generate_recovery_phrase(), generate_recovery_phrase());
    }

    #[test]
    fn the_same_phrase_yields_the_same_key() {
        let phrase = generate_recovery_phrase();
        assert_eq!(
            recovery_kek_from_phrase(&phrase).unwrap(),
            recovery_kek_from_phrase(&phrase).unwrap()
        );
    }

    #[test]
    fn different_phrases_yield_different_keys() {
        assert_ne!(
            recovery_kek_from_phrase(&generate_recovery_phrase()).unwrap(),
            recovery_kek_from_phrase(&generate_recovery_phrase()).unwrap()
        );
    }

    #[test]
    fn tolerates_extra_whitespace_and_casing() {
        // A user retyping 24 words from paper will not match our spacing exactly.
        let phrase = generate_recovery_phrase();
        let noisy = format!("  {}  ", phrase.to_uppercase().replace(' ', "   "));
        assert_eq!(
            recovery_kek_from_phrase(&noisy).unwrap(),
            recovery_kek_from_phrase(&phrase).unwrap()
        );
    }

    #[test]
    fn rejects_a_phrase_with_a_bad_checksum() {
        // Every word below is a real wordlist entry, so only the checksum can
        // reject this — which is the whole reason to use a wordlist rather than
        // raw hex: a phrase mistyped off paper fails loudly instead of silently
        // deriving the wrong key.
        //
        // A fixed phrase, not a mutated random one: 24 words carry 8 checksum
        // bits, so a random word swap would pass by luck roughly 1 run in 256.
        // This is the canonical all-zero-entropy phrase (verified, not assumed).
        let mut words: Vec<&str> = "abandon abandon abandon abandon abandon abandon \
             abandon abandon abandon abandon abandon abandon abandon abandon abandon \
             abandon abandon abandon abandon abandon abandon abandon abandon art"
            .split_whitespace()
            .collect();
        assert_eq!(words.len(), 24, "the fixed phrase must be 24 words");
        // Sanity: unmutated, it parses.
        assert!(recovery_kek_from_phrase(&words.join(" ")).is_ok());

        words[0] = "zoo";
        assert!(recovery_kek_from_phrase(&words.join(" ")).is_err());
    }

    #[test]
    fn rejects_a_phrase_of_the_wrong_length() {
        assert!(recovery_kek_from_phrase("abandon abandon abandon").is_err());
    }

    #[test]
    fn rejects_a_word_outside_the_wordlist() {
        let phrase = generate_recovery_phrase();
        let replaced = phrase.replacen(
            phrase.split_whitespace().next().unwrap(),
            "notaword",
            1,
        );
        assert!(recovery_kek_from_phrase(&replaced).is_err());
    }
}
```

- [ ] **Step 2 : Lancer et vérifier l'échec**

Run: `cd src-tauri && cargo test crypto::recovery`
Expected: FAIL — `cannot find function generate_recovery_phrase`.

- [ ] **Step 3 : Implémenter**

En tête de `src-tauri/src/crypto/recovery.rs` :

```rust
use bip39::{Language, Mnemonic};
use hkdf::Hkdf;
use sha2::Sha256;

use super::CryptoError;

const INFO_RECOVERY_KEK: &[u8] = b"usagi/recovery-kek/v1";

/// 32 bytes of entropy renders as 24 BIP39 words. A wordlist rather than raw
/// hex because the user copies this onto paper, and BIP39's checksum catches a
/// mistyped word instead of silently deriving the wrong key.
pub fn generate_recovery_phrase() -> String {
    let mut entropy = [0u8; 32];
    getrandom::fill(&mut entropy).expect("OS RNG unavailable");
    Mnemonic::from_entropy(&entropy)
        .expect("32 bytes is a valid BIP39 entropy length")
        .to_string()
}

pub fn recovery_kek_from_phrase(phrase: &str) -> Result<[u8; 32], CryptoError> {
    // Normalise before parsing: a phrase retyped from paper carries stray
    // spacing and casing that are not the user's mistake.
    let normalised = phrase.split_whitespace().collect::<Vec<_>>().join(" ").to_lowercase();
    let mnemonic = Mnemonic::parse_in(Language::English, &normalised)
        .map_err(|e| CryptoError::Input(e.to_string()))?;
    let (entropy, len) = mnemonic.to_entropy_array();
    let hk = Hkdf::<Sha256>::new(None, &entropy[..len]);
    let mut out = [0u8; 32];
    hk.expand(INFO_RECOVERY_KEK, &mut out)
        .expect("32 bytes is a valid HKDF length");
    Ok(out)
}
```

Ajouter `pub mod recovery;` à `mod.rs`.

- [ ] **Step 4 : Lancer et vérifier le succès**

Run: `cd src-tauri && cargo test crypto::recovery`
Expected: PASS (8 tests).

- [ ] **Step 5 : Commit**

```bash
git add src-tauri/src/crypto
git commit -m "feat: :sparkles: add the 24-word recovery phrase and its key"
```

---

## Task 5 : Identité X25519

**Files:**
- Create: `src-tauri/src/crypto/identity.rs`
- Modify: `src-tauri/src/crypto/mod.rs`

**Interfaces:**
- Produces :
  - `pub struct Identity { pub public_key: [u8; 32], pub private_key: [u8; 32] }`
  - `pub fn generate_identity() -> Identity`

- [ ] **Step 1 : Écrire les tests qui échouent**

Créer `src-tauri/src/crypto/identity.rs` avec uniquement :

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn both_halves_are_32_bytes() {
        let id = generate_identity();
        assert_eq!(id.public_key.len(), 32);
        assert_eq!(id.private_key.len(), 32);
    }

    #[test]
    fn identities_differ() {
        assert_ne!(generate_identity().private_key, generate_identity().private_key);
    }

    #[test]
    fn the_public_half_is_not_the_private_half() {
        let id = generate_identity();
        assert_ne!(id.public_key, id.private_key);
    }

    #[test]
    fn two_parties_agree_on_a_shared_secret() {
        // Not used until sharing ships, but it is the property that makes the
        // keypair worth storing now rather than migrating accounts later.
        use x25519_dalek::{PublicKey, StaticSecret};
        let a = generate_identity();
        let b = generate_identity();
        let a_shared = StaticSecret::from(a.private_key)
            .diffie_hellman(&PublicKey::from(b.public_key));
        let b_shared = StaticSecret::from(b.private_key)
            .diffie_hellman(&PublicKey::from(a.public_key));
        assert_eq!(a_shared.as_bytes(), b_shared.as_bytes());
    }
}
```

- [ ] **Step 2 : Lancer et vérifier l'échec**

Run: `cd src-tauri && cargo test crypto::identity`
Expected: FAIL — `cannot find function generate_identity`.

- [ ] **Step 3 : Implémenter**

En tête de `src-tauri/src/crypto/identity.rs` :

```rust
use x25519_dalek::{PublicKey, StaticSecret};
use zeroize::Zeroize;

/// An account's asymmetric identity. Generated at registration even though
/// nothing uses it yet: retrofitting a keypair onto existing accounts would
/// require every user to re-enter their password, so the cost is paid once, now.
pub struct Identity {
    pub public_key: [u8; 32],
    pub private_key: [u8; 32],
}

impl Drop for Identity {
    fn drop(&mut self) {
        self.private_key.zeroize();
    }
}

pub fn generate_identity() -> Identity {
    let mut seed = [0u8; 32];
    getrandom::fill(&mut seed).expect("OS RNG unavailable");
    let secret = StaticSecret::from(seed);
    let public = PublicKey::from(&secret);
    seed.zeroize();
    Identity {
        public_key: public.to_bytes(),
        private_key: secret.to_bytes(),
    }
}
```

Ajouter `pub mod identity;` à `mod.rs`.

- [ ] **Step 4 : Lancer et vérifier le succès**

Run: `cd src-tauri && cargo test crypto::identity`
Expected: PASS (4 tests).

- [ ] **Step 5 : Commit**

```bash
git add src-tauri/src/crypto
git commit -m "feat: :sparkles: generate the account X25519 identity"
```

---

## Task 6 : Matériel d'inscription

**Files:**
- Create: `src-tauri/src/crypto/account.rs`
- Modify: `src-tauri/src/crypto/mod.rs`

**Interfaces:**
- Consumes : `derive::*`, `wrap::*`, `recovery::*`, `identity::*`.
- Produces :
  - `pub struct KdfParams { pub memory_cost: u32, pub time_cost: u32, pub parallelism: u32 }` — sérialisé en camelCase
  - `pub struct RegistrationMaterial { auth_salt, auth_verifier, wrapped_dek, wrapped_dek_recovery, public_key, wrapped_private_key, kdf_params, recovery_phrase }` — sérialisé en camelCase
  - `pub fn prepare_registration(password: &str) -> Result<RegistrationMaterial, CryptoError>`

- [ ] **Step 1 : Écrire les tests qui échouent**

Créer `src-tauri/src/crypto/account.rs` avec uniquement :

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::crypto::derive::{derive_kek, derive_master_key};
    use crate::crypto::recovery::recovery_kek_from_phrase;
    use crate::crypto::wrap::{open, AAD_DEK, AAD_DEK_RECOVERY, AAD_PRIVATE_KEY};
    use base64::Engine;

    fn decoded_len(b64: &str) -> usize {
        base64::engine::general_purpose::STANDARD
            .decode(b64)
            .unwrap()
            .len()
    }

    #[test]
    fn salt_matches_the_server_format() {
        let m = prepare_registration("correct horse").unwrap();
        assert_eq!(m.auth_salt.len(), 32);
        assert!(m
            .auth_salt
            .chars()
            .all(|c| c.is_ascii_hexdigit() && !c.is_uppercase()));
    }

    #[test]
    fn every_blob_fits_the_server_bounds() {
        // The server rejects wrapped secrets outside 40..=128 decoded bytes and
        // a public key outside 32..=64.
        let m = prepare_registration("correct horse").unwrap();
        for (name, blob) in [
            ("wrappedDek", &m.wrapped_dek),
            ("wrappedDekRecovery", &m.wrapped_dek_recovery),
            ("wrappedPrivateKey", &m.wrapped_private_key),
        ] {
            let n = decoded_len(blob);
            assert!((40..=128).contains(&n), "{name} decoded to {n} bytes");
        }
        let pk = decoded_len(&m.public_key);
        assert!((32..=64).contains(&pk), "publicKey decoded to {pk} bytes");
    }

    #[test]
    fn both_wrappings_hold_the_same_dek() {
        // If they diverged, the recovery phrase would open a different vault
        // than the password — silently, and only discovered in an emergency.
        let m = prepare_registration("correct horse").unwrap();
        let kek = derive_kek(&derive_master_key("correct horse", &m.auth_salt).unwrap());
        let rkek = recovery_kek_from_phrase(&m.recovery_phrase).unwrap();
        assert_eq!(
            open(&kek, AAD_DEK, &m.wrapped_dek).unwrap(),
            open(&rkek, AAD_DEK_RECOVERY, &m.wrapped_dek_recovery).unwrap()
        );
    }

    #[test]
    fn the_private_key_is_wrapped_by_the_dek_not_the_password() {
        // Spec §2.1: wrapping it under the DEK is what lets it survive a
        // password change untouched.
        let m = prepare_registration("correct horse").unwrap();
        let kek = derive_kek(&derive_master_key("correct horse", &m.auth_salt).unwrap());
        let dek: [u8; 32] = open(&kek, AAD_DEK, &m.wrapped_dek).unwrap().try_into().unwrap();
        let private = open(&dek, AAD_PRIVATE_KEY, &m.wrapped_private_key).unwrap();
        assert_eq!(private.len(), 32);
        // And the KEK must not open it.
        assert!(open(&kek, AAD_PRIVATE_KEY, &m.wrapped_private_key).is_err());
    }

    #[test]
    fn the_verifier_matches_a_fresh_derivation() {
        let m = prepare_registration("correct horse").unwrap();
        let mk = derive_master_key("correct horse", &m.auth_salt).unwrap();
        assert_eq!(m.auth_verifier, crate::crypto::derive::derive_auth_verifier(&mk));
    }

    #[test]
    fn kdf_params_are_the_spec_values() {
        let m = prepare_registration("correct horse").unwrap();
        assert_eq!(m.kdf_params.memory_cost, 65536);
        assert_eq!(m.kdf_params.time_cost, 3);
        assert_eq!(m.kdf_params.parallelism, 4);
    }

    #[test]
    fn two_registrations_share_nothing() {
        let a = prepare_registration("correct horse").unwrap();
        let b = prepare_registration("correct horse").unwrap();
        assert_ne!(a.auth_salt, b.auth_salt);
        assert_ne!(a.auth_verifier, b.auth_verifier);
        assert_ne!(a.recovery_phrase, b.recovery_phrase);
        assert_ne!(a.public_key, b.public_key);
    }

    #[test]
    fn serialises_to_camel_case() {
        // This struct is the material, not a request body. RegisterDto nests the
        // four blobs under `keys`, accepts no kdfParams at all, and must never
        // see recoveryPhrase. TypeScript assembles the body — toRegisterKeys,
        // Task 10.
        let m = prepare_registration("correct horse").unwrap();
        let json = serde_json::to_value(&m).unwrap();
        for key in [
            "authSalt",
            "authVerifier",
            "wrappedDek",
            "wrappedDekRecovery",
            "publicKey",
            "wrappedPrivateKey",
            "kdfParams",
            "recoveryPhrase",
        ] {
            assert!(json.get(key).is_some(), "missing {key}");
        }
        let params = json.get("kdfParams").unwrap();
        for key in ["memoryCost", "timeCost", "parallelism"] {
            assert!(params.get(key).is_some(), "missing kdfParams.{key}");
        }
    }

    #[test]
    fn kdf_params_are_on_the_server_allow_list() {
        // KDF_PARAMS_ALLOWLIST holds exactly DEFAULT_KDF_PARAMS today. Anything
        // else makes PUT /v1/keys a 400: the server refuses to let a client
        // weaken its own Argon2id cost, since it cannot invert the hash to notice.
        let m = prepare_registration("correct horse").unwrap();
        assert_eq!(
            (
                m.kdf_params.memory_cost,
                m.kdf_params.time_cost,
                m.kdf_params.parallelism
            ),
            (65536, 3, 4)
        );
    }
}
```

- [ ] **Step 2 : Lancer et vérifier l'échec**

Run: `cd src-tauri && cargo test crypto::account`
Expected: FAIL — `cannot find function prepare_registration`.

- [ ] **Step 3 : Implémenter**

En tête de `src-tauri/src/crypto/account.rs` :

```rust
use base64::Engine;
use serde::Serialize;
use zeroize::Zeroize;

use super::derive::{
    derive_auth_verifier, derive_kek, derive_master_key, generate_auth_salt, ARGON2_MEMORY_KIB,
    ARGON2_PARALLELISM, ARGON2_TIME_COST,
};
use super::identity::generate_identity;
use super::recovery::{generate_recovery_phrase, recovery_kek_from_phrase};
use super::wrap::{seal, AAD_DEK, AAD_DEK_RECOVERY, AAD_PRIVATE_KEY};
use super::CryptoError;

#[derive(Serialize, Clone, Copy)]
#[serde(rename_all = "camelCase")]
pub struct KdfParams {
    pub memory_cost: u32,
    pub time_cost: u32,
    pub parallelism: u32,
}

impl KdfParams {
    pub fn current() -> Self {
        Self {
            memory_cost: ARGON2_MEMORY_KIB,
            time_cost: ARGON2_TIME_COST,
            parallelism: ARGON2_PARALLELISM,
        }
    }
}

/// Everything POST /v1/auth/register needs, plus the recovery phrase — which is
/// shown to the user once and never sent anywhere.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RegistrationMaterial {
    pub auth_salt: String,
    pub auth_verifier: String,
    pub wrapped_dek: String,
    pub wrapped_dek_recovery: String,
    pub public_key: String,
    pub wrapped_private_key: String,
    pub kdf_params: KdfParams,
    pub recovery_phrase: String,
}

pub fn prepare_registration(password: &str) -> Result<RegistrationMaterial, CryptoError> {
    let auth_salt = generate_auth_salt();
    let mut master_key = derive_master_key(password, &auth_salt)?;
    let auth_verifier = derive_auth_verifier(&master_key);
    let mut kek = derive_kek(&master_key);
    master_key.zeroize();

    // One DEK, wrapped twice. The recovery phrase must open the same vault the
    // password does, or it is not a recovery path.
    let mut dek = [0u8; 32];
    getrandom::fill(&mut dek).expect("OS RNG unavailable");

    let wrapped_dek = seal(&kek, AAD_DEK, &dek);
    kek.zeroize();

    let recovery_phrase = generate_recovery_phrase();
    let mut recovery_kek = recovery_kek_from_phrase(&recovery_phrase)?;
    let wrapped_dek_recovery = seal(&recovery_kek, AAD_DEK_RECOVERY, &dek);
    recovery_kek.zeroize();

    let identity = generate_identity();
    let wrapped_private_key = seal(&dek, AAD_PRIVATE_KEY, &identity.private_key);
    let public_key = base64::engine::general_purpose::STANDARD.encode(identity.public_key);
    dek.zeroize();

    Ok(RegistrationMaterial {
        auth_salt,
        auth_verifier,
        wrapped_dek,
        wrapped_dek_recovery,
        public_key,
        wrapped_private_key,
        kdf_params: KdfParams::current(),
        recovery_phrase,
    })
}
```

Ajouter `pub mod account;` à `mod.rs`, et `serde_json` aux `[dev-dependencies]` de `Cargo.toml` s'il n'y est pas déjà en dépendance normale (il l'est : `serde_json = "1"`).

- [ ] **Step 4 : Lancer et vérifier le succès**

Run: `cd src-tauri && cargo test crypto::account`
Expected: PASS (8 tests). Comptez une trentaine de secondes : chaque test dérive une ou deux fois avec Argon2id.

- [ ] **Step 5 : Commit**

```bash
git add src-tauri/src/crypto
git commit -m "feat: :sparkles: assemble the registration key material"
```

---

## Task 7 : État verrouillé et commandes de déverrouillage

**Files:**
- Create: `src-tauri/src/crypto/state.rs`
- Modify: `src-tauri/src/crypto/mod.rs`, `src-tauri/src/lib.rs`

**Interfaces:**
- Produces :
  - `pub struct CryptoState` avec `Default`
  - Commandes : `begin_unlock`, `complete_unlock`, `unlock_with_recovery`, `lock`, `is_unlocked`
  - `pub(crate) fn dek_and_user(state: &CryptoState) -> Result<([u8; 32], String), CryptoError>` — utilisé par la Task 8

**Pourquoi le déverrouillage est en deux temps :** pour se connecter, le front enchaîne `prelogin` (qui rend le sel) → calcul du vérificateur → `login` → `GET /v1/keys` (qui rend la DEK enveloppée) → déverrouillage. Le vérificateur est donc nécessaire **avant** que la DEK enveloppée ne soit disponible. Une commande unique obligerait à dériver la master key deux fois, soit 128 Mio et environ deux secondes de plus par connexion. `begin_unlock` la garde en mémoire le temps de l'aller-retour réseau ; `complete_unlock` la consomme et l'efface.

- [ ] **Step 1 : Écrire les tests qui échouent**

Créer `src-tauri/src/crypto/state.rs` avec uniquement :

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::crypto::account::prepare_registration;

    #[test]
    fn starts_locked() {
        let state = CryptoState::default();
        assert!(!state.is_unlocked());
        assert_eq!(dek_and_user(&state).unwrap_err(), CryptoError::Locked);
    }

    #[test]
    fn the_password_path_unlocks() {
        let m = prepare_registration("correct horse").unwrap();
        let mut state = CryptoState::default();
        let verifier = state.begin_unlock("correct horse", &m.auth_salt).unwrap();
        assert_eq!(verifier, m.auth_verifier);
        state.complete_unlock(&m.wrapped_dek, "user-1").unwrap();
        assert!(state.is_unlocked());
        assert_eq!(dek_and_user(&state).unwrap().1, "user-1");
    }

    #[test]
    fn complete_unlock_without_begin_is_refused() {
        let m = prepare_registration("correct horse").unwrap();
        let mut state = CryptoState::default();
        assert_eq!(
            state.complete_unlock(&m.wrapped_dek, "user-1").unwrap_err(),
            CryptoError::Locked
        );
    }

    #[test]
    fn a_wrong_password_fails_at_complete_not_begin() {
        // begin_unlock cannot tell: it only derives. The mismatch surfaces when
        // the derived KEK fails to open the wrapped DEK.
        let m = prepare_registration("correct horse").unwrap();
        let mut state = CryptoState::default();
        state.begin_unlock("wrong horse", &m.auth_salt).unwrap();
        assert_eq!(
            state.complete_unlock(&m.wrapped_dek, "user-1").unwrap_err(),
            CryptoError::Decrypt
        );
        assert!(!state.is_unlocked());
    }

    #[test]
    fn the_recovery_path_unlocks_the_same_vault() {
        let m = prepare_registration("correct horse").unwrap();

        let mut by_password = CryptoState::default();
        by_password.begin_unlock("correct horse", &m.auth_salt).unwrap();
        by_password.complete_unlock(&m.wrapped_dek, "user-1").unwrap();

        let mut by_recovery = CryptoState::default();
        by_recovery
            .unlock_with_recovery(&m.recovery_phrase, &m.wrapped_dek_recovery, "user-1")
            .unwrap();

        assert_eq!(
            dek_and_user(&by_password).unwrap().0,
            dek_and_user(&by_recovery).unwrap().0
        );
    }

    #[test]
    fn a_wrong_recovery_phrase_is_refused() {
        let m = prepare_registration("correct horse").unwrap();
        let other = prepare_registration("other").unwrap();
        let mut state = CryptoState::default();
        assert_eq!(
            state
                .unlock_with_recovery(&other.recovery_phrase, &m.wrapped_dek_recovery, "user-1")
                .unwrap_err(),
            CryptoError::Decrypt
        );
        assert!(!state.is_unlocked());
    }

    #[test]
    fn locking_clears_everything() {
        let m = prepare_registration("correct horse").unwrap();
        let mut state = CryptoState::default();
        state.begin_unlock("correct horse", &m.auth_salt).unwrap();
        state.complete_unlock(&m.wrapped_dek, "user-1").unwrap();

        state.lock();

        assert!(!state.is_unlocked());
        assert_eq!(dek_and_user(&state).unwrap_err(), CryptoError::Locked);
    }

    #[test]
    fn beginning_a_second_unlock_discards_the_first() {
        // Otherwise a stale pending master key would linger after an abandoned
        // sign-in attempt.
        let a = prepare_registration("password a").unwrap();
        let b = prepare_registration("password b").unwrap();
        let mut state = CryptoState::default();
        state.begin_unlock("password a", &a.auth_salt).unwrap();
        state.begin_unlock("password b", &b.auth_salt).unwrap();
        assert_eq!(
            state.complete_unlock(&a.wrapped_dek, "user-1").unwrap_err(),
            CryptoError::Decrypt
        );
    }
}
```

- [ ] **Step 2 : Lancer et vérifier l'échec**

Run: `cd src-tauri && cargo test crypto::state`
Expected: FAIL — `cannot find type CryptoState`.

- [ ] **Step 3 : Implémenter l'état**

En tête de `src-tauri/src/crypto/state.rs` :

```rust
use std::sync::Mutex;

use zeroize::Zeroize;

use super::derive::{derive_auth_verifier, derive_kek, derive_master_key};
use super::recovery::recovery_kek_from_phrase;
use super::wrap::{open, AAD_DEK, AAD_DEK_RECOVERY};
use super::CryptoError;

/// Holds the unlocked vault. Nothing here is ever serialised or crosses IPC —
/// the frontend sends a password and receives blobs, never a key.
#[derive(Default)]
pub struct CryptoState {
    /// Held only between begin_unlock and complete_unlock, so a sign-in pays
    /// for Argon2id once rather than on both sides of the network round trip.
    pending_master_key: Option<[u8; 32]>,
    dek: Option<[u8; 32]>,
    user_id: Option<String>,
}

impl CryptoState {
    pub fn is_unlocked(&self) -> bool {
        self.dek.is_some()
    }

    /// Derives the master key and returns the verifier the server expects.
    pub fn begin_unlock(&mut self, password: &str, auth_salt: &str) -> Result<String, CryptoError> {
        // Drop any half-finished attempt before starting another.
        self.clear_pending();
        let master_key = derive_master_key(password, auth_salt)?;
        let verifier = derive_auth_verifier(&master_key);
        self.pending_master_key = Some(master_key);
        Ok(verifier)
    }

    pub fn complete_unlock(&mut self, wrapped_dek: &str, user_id: &str) -> Result<(), CryptoError> {
        // `[u8; 32]` is Copy, so this must zeroize the binding itself — zeroizing
        // a copy would leave the master key sitting in memory.
        let mut master_key = self.pending_master_key.take().ok_or(CryptoError::Locked)?;
        let mut kek = derive_kek(&master_key);
        master_key.zeroize();

        let opened = open(&kek, AAD_DEK, wrapped_dek);
        kek.zeroize();
        self.store_dek(opened?, user_id)
    }

    pub fn unlock_with_recovery(
        &mut self,
        phrase: &str,
        wrapped_dek_recovery: &str,
        user_id: &str,
    ) -> Result<(), CryptoError> {
        let mut recovery_kek = recovery_kek_from_phrase(phrase)?;
        let opened = open(&recovery_kek, AAD_DEK_RECOVERY, wrapped_dek_recovery);
        recovery_kek.zeroize();
        self.store_dek(opened?, user_id)
    }

    pub fn lock(&mut self) {
        self.clear_pending();
        if let Some(mut dek) = self.dek.take() {
            dek.zeroize();
        }
        self.user_id = None;
    }

    fn clear_pending(&mut self) {
        if let Some(mut mk) = self.pending_master_key.take() {
            mk.zeroize();
        }
    }

    fn store_dek(&mut self, opened: Vec<u8>, user_id: &str) -> Result<(), CryptoError> {
        let dek: [u8; 32] = opened
            .try_into()
            .map_err(|_| CryptoError::Input("wrapped DEK did not hold 32 bytes".into()))?;
        self.dek = Some(dek);
        self.user_id = Some(user_id.to_owned());
        Ok(())
    }
}

impl Drop for CryptoState {
    fn drop(&mut self) {
        self.lock();
    }
}

pub(crate) fn dek_and_user(state: &CryptoState) -> Result<([u8; 32], String), CryptoError> {
    match (&state.dek, &state.user_id) {
        (Some(dek), Some(user)) => Ok((*dek, user.clone())),
        _ => Err(CryptoError::Locked),
    }
}
```

- [ ] **Step 4 : Lancer et vérifier le succès**

Run: `cd src-tauri && cargo test crypto::state`
Expected: PASS (8 tests).

- [ ] **Step 5 : Exposer les commandes Tauri**

À la fin de `src-tauri/src/crypto/state.rs`, avant le module de tests :

```rust
type Managed<'a> = tauri::State<'a, Mutex<CryptoState>>;

fn with_state<T>(
    state: &Managed<'_>,
    f: impl FnOnce(&mut CryptoState) -> Result<T, CryptoError>,
) -> Result<T, String> {
    let mut guard = state.lock().map_err(|_| "crypto state poisoned".to_string())?;
    f(&mut guard).map_err(Into::into)
}

#[tauri::command]
pub fn crypto_prepare_registration(
    password: String,
) -> Result<super::account::RegistrationMaterial, String> {
    super::account::prepare_registration(&password).map_err(Into::into)
}

#[tauri::command]
pub fn crypto_begin_unlock(
    password: String,
    auth_salt: String,
    state: Managed<'_>,
) -> Result<String, String> {
    with_state(&state, |s| s.begin_unlock(&password, &auth_salt))
}

#[tauri::command]
pub fn crypto_complete_unlock(
    wrapped_dek: String,
    user_id: String,
    state: Managed<'_>,
) -> Result<(), String> {
    with_state(&state, |s| s.complete_unlock(&wrapped_dek, &user_id))
}

#[tauri::command]
pub fn crypto_unlock_with_recovery(
    recovery_phrase: String,
    wrapped_dek_recovery: String,
    user_id: String,
    state: Managed<'_>,
) -> Result<(), String> {
    with_state(&state, |s| {
        s.unlock_with_recovery(&recovery_phrase, &wrapped_dek_recovery, &user_id)
    })
}

#[tauri::command]
pub fn crypto_lock(state: Managed<'_>) -> Result<(), String> {
    with_state(&state, |s| {
        s.lock();
        Ok(())
    })
}

#[tauri::command]
pub fn crypto_is_unlocked(state: Managed<'_>) -> Result<bool, String> {
    with_state(&state, |s| Ok(s.is_unlocked()))
}
```

Dans `src-tauri/src/lib.rs`, enregistrer l'état et les commandes. Ajouter avant les `#[cfg(desktop)]`, dans `run()` :

```rust
    let builder = builder.manage(std::sync::Mutex::new(crypto::state::CryptoState::default()));
```

Puis ajouter les six commandes aux **deux** listes `generate_handler!` (desktop et mobile) :

```rust
            crypto::state::crypto_prepare_registration,
            crypto::state::crypto_begin_unlock,
            crypto::state::crypto_complete_unlock,
            crypto::state::crypto_unlock_with_recovery,
            crypto::state::crypto_lock,
            crypto::state::crypto_is_unlocked,
```

Ajouter `pub mod state;` à `mod.rs`.

Note : les commandes personnalisées ne demandent **aucune** entrée dans `capabilities/`. Ne pas y toucher.

- [ ] **Step 6 : Vérifier que l'application compile et démarre**

Run: `cd src-tauri && cargo build`
Expected: succès.

Run: `pnpm tauri dev` puis, dans la console du navigateur :

```js
await window.__TAURI__.core.invoke('crypto_is_unlocked')
```

Expected: `false`. Fermer l'application.

- [ ] **Step 7 : Commit**

```bash
git add src-tauri/src/crypto src-tauri/src/lib.rs
git commit -m "feat: :sparkles: hold the unlocked vault in zeroized Rust state"
```

---

## Task 8 : Chiffrement d'enregistrement

**Files:**
- Create: `src-tauri/src/crypto/records.rs`
- Modify: `src-tauri/src/crypto/mod.rs`, `src-tauri/src/crypto/state.rs`, `src-tauri/src/lib.rs`

**Interfaces:**
- Consumes : `dek_and_user`.
- Produces :
  - `pub fn record_aad(user_id: &str, entity_type: &str, entity_id: &str) -> Vec<u8>`
  - Commandes `crypto_encrypt_record`, `crypto_decrypt_record`

- [ ] **Step 1 : Écrire les tests qui échouent**

Créer `src-tauri/src/crypto/records.rs` avec uniquement :

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::crypto::wrap::{open, seal};

    const KEY: [u8; 32] = [9u8; 32];

    #[test]
    fn a_record_round_trips() {
        let aad = record_aad("user-1", "task", "abc");
        let blob = seal(&KEY, &aad, br#"{"title":"pain"}"#);
        assert_eq!(open(&KEY, &aad, &blob).unwrap(), br#"{"title":"pain"}"#);
    }

    #[test]
    fn a_blob_cannot_be_moved_to_another_entity() {
        // The attack this stops: a hostile server swapping one task's ciphertext
        // into another task's row.
        let blob = seal(&KEY, &record_aad("user-1", "task", "abc"), b"secret");
        assert!(open(&KEY, &record_aad("user-1", "task", "xyz"), &blob).is_err());
    }

    #[test]
    fn a_blob_cannot_be_moved_to_another_entity_type() {
        let blob = seal(&KEY, &record_aad("user-1", "task", "abc"), b"secret");
        assert!(open(&KEY, &record_aad("user-1", "project", "abc"), &blob).is_err());
    }

    #[test]
    fn a_blob_cannot_be_moved_to_another_account() {
        let blob = seal(&KEY, &record_aad("user-1", "task", "abc"), b"secret");
        assert!(open(&KEY, &record_aad("user-2", "task", "abc"), &blob).is_err());
    }

    #[test]
    fn the_separator_prevents_field_boundary_confusion() {
        // Without a separator, ("ab","c") and ("a","bc") would build the same
        // AAD, and a blob could slide between them.
        assert_ne!(
            record_aad("u", "ab", "c"),
            record_aad("u", "a", "bc")
        );
    }

    #[test]
    fn the_aad_contains_all_three_parts() {
        let aad = record_aad("user-1", "task", "abc");
        let text = String::from_utf8_lossy(&aad);
        assert!(text.contains("user-1"));
        assert!(text.contains("task"));
        assert!(text.contains("abc"));
    }
}
```

- [ ] **Step 2 : Lancer et vérifier l'échec**

Run: `cd src-tauri && cargo test crypto::records`
Expected: FAIL — `cannot find function record_aad`.

- [ ] **Step 3 : Implémenter**

En tête de `src-tauri/src/crypto/records.rs` :

```rust
use super::state::{dek_and_user, CryptoState};
use super::wrap::{open, seal};
use super::CryptoError;
use zeroize::Zeroize;

/// ASCII unit separator. Without it, ("ab","c") and ("a","bc") would produce the
/// same AAD and a blob could be slid from one entity to the other.
const SEP: u8 = 0x1F;

pub fn record_aad(user_id: &str, entity_type: &str, entity_id: &str) -> Vec<u8> {
    let mut aad = Vec::with_capacity(user_id.len() + entity_type.len() + entity_id.len() + 2);
    aad.extend_from_slice(user_id.as_bytes());
    aad.push(SEP);
    aad.extend_from_slice(entity_type.as_bytes());
    aad.push(SEP);
    aad.extend_from_slice(entity_id.as_bytes());
    aad
}

pub fn encrypt_record(
    state: &CryptoState,
    entity_type: &str,
    entity_id: &str,
    plaintext: &str,
) -> Result<String, CryptoError> {
    let (mut dek, user_id) = dek_and_user(state)?;
    let aad = record_aad(&user_id, entity_type, entity_id);
    let blob = seal(&dek, &aad, plaintext.as_bytes());
    dek.zeroize();
    Ok(blob)
}

pub fn decrypt_record(
    state: &CryptoState,
    entity_type: &str,
    entity_id: &str,
    blob: &str,
) -> Result<String, CryptoError> {
    let (mut dek, user_id) = dek_and_user(state)?;
    let aad = record_aad(&user_id, entity_type, entity_id);
    let opened = open(&dek, &aad, blob);
    dek.zeroize();
    String::from_utf8(opened?).map_err(|_| CryptoError::Input("record is not valid UTF-8".into()))
}
```

Ajouter `pub mod records;` à `mod.rs`.

Ajouter les deux commandes à la fin de `state.rs`, avant son module de tests :

```rust
#[tauri::command]
pub fn crypto_encrypt_record(
    entity_type: String,
    entity_id: String,
    plaintext: String,
    state: Managed<'_>,
) -> Result<String, String> {
    with_state(&state, |s| {
        super::records::encrypt_record(s, &entity_type, &entity_id, &plaintext)
    })
}

#[tauri::command]
pub fn crypto_decrypt_record(
    entity_type: String,
    entity_id: String,
    blob: String,
    state: Managed<'_>,
) -> Result<String, String> {
    with_state(&state, |s| {
        super::records::decrypt_record(s, &entity_type, &entity_id, &blob)
    })
}
```

Et les ajouter aux deux listes `generate_handler!` de `lib.rs`.

- [ ] **Step 4 : Ajouter un test d'état verrouillé**

Dans le module de tests de `src-tauri/src/crypto/state.rs` :

```rust
    #[test]
    fn record_commands_refuse_while_locked() {
        let state = CryptoState::default();
        assert_eq!(
            crate::crypto::records::encrypt_record(&state, "task", "abc", "{}").unwrap_err(),
            CryptoError::Locked
        );
        assert_eq!(
            crate::crypto::records::decrypt_record(&state, "task", "abc", "AAAA").unwrap_err(),
            CryptoError::Locked
        );
    }
```

- [ ] **Step 5 : Lancer et vérifier le succès**

Run: `cd src-tauri && cargo test crypto::`
Expected: PASS — les tests de `records` (6) plus celui d'état verrouillé.

- [ ] **Step 6 : Commit**

```bash
git add src-tauri/src/crypto src-tauri/src/lib.rs
git commit -m "feat: :sparkles: bind record ciphertext to its account and entity"
```

---

## Task 9 : Changement de mot de passe

**Files:**
- Modify: `src-tauri/src/crypto/account.rs`, `src-tauri/src/crypto/state.rs`, `src-tauri/src/lib.rs`

**Interfaces:**
- Produces :
  - `pub struct RotationMaterial { current_auth_verifier, auth_verifier, auth_salt, kdf_params, wrapped_dek }` — camelCase
  - `pub fn prepare_key_rotation(current_password, current_auth_salt, new_password, wrapped_dek) -> Result<RotationMaterial, CryptoError>`
  - Commande `crypto_prepare_key_rotation`

**La propriété centrale :** la DEK ne change pas. Seule son enveloppe est refaite. C'est ce qui fait survivre la phrase de récupération et la clé privée X25519 à un changement de mot de passe — et c'est pourquoi `PUT /v1/keys` n'accepte plus que `wrappedDek`, et non les quatre blobs.

- [ ] **Step 1 : Écrire les tests qui échouent**

Ajouter au module de tests de `src-tauri/src/crypto/account.rs` :

```rust
    #[test]
    fn rotation_keeps_the_same_dek() {
        let m = prepare_registration("old password").unwrap();
        let r = prepare_key_rotation("old password", &m.auth_salt, "new password", &m.wrapped_dek)
            .unwrap();

        let old_kek = derive_kek(&derive_master_key("old password", &m.auth_salt).unwrap());
        let new_kek = derive_kek(&derive_master_key("new password", &r.auth_salt).unwrap());

        assert_eq!(
            open(&old_kek, AAD_DEK, &m.wrapped_dek).unwrap(),
            open(&new_kek, AAD_DEK, &r.wrapped_dek).unwrap()
        );
    }

    #[test]
    fn rotation_leaves_the_recovery_path_working() {
        // The recovery wrap is untouched, so it still opens the same DEK.
        let m = prepare_registration("old password").unwrap();
        let r = prepare_key_rotation("old password", &m.auth_salt, "new password", &m.wrapped_dek)
            .unwrap();

        let rkek = recovery_kek_from_phrase(&m.recovery_phrase).unwrap();
        let new_kek = derive_kek(&derive_master_key("new password", &r.auth_salt).unwrap());

        assert_eq!(
            open(&rkek, AAD_DEK_RECOVERY, &m.wrapped_dek_recovery).unwrap(),
            open(&new_kek, AAD_DEK, &r.wrapped_dek).unwrap()
        );
    }

    #[test]
    fn rotation_issues_a_fresh_salt_and_verifier() {
        let m = prepare_registration("old password").unwrap();
        let r = prepare_key_rotation("old password", &m.auth_salt, "new password", &m.wrapped_dek)
            .unwrap();
        assert_ne!(r.auth_salt, m.auth_salt);
        assert_ne!(r.auth_verifier, m.auth_verifier);
        assert_eq!(r.current_auth_verifier, m.auth_verifier);
    }

    #[test]
    fn rotation_refuses_a_wrong_current_password() {
        let m = prepare_registration("old password").unwrap();
        assert_eq!(
            prepare_key_rotation("wrong", &m.auth_salt, "new password", &m.wrapped_dek)
                .unwrap_err(),
            CryptoError::Decrypt
        );
    }

    #[test]
    fn rotation_serialises_to_the_field_names_put_keys_expects() {
        let m = prepare_registration("old password").unwrap();
        let r = prepare_key_rotation("old password", &m.auth_salt, "new password", &m.wrapped_dek)
            .unwrap();
        let json = serde_json::to_value(&r).unwrap();
        for key in [
            "currentAuthVerifier",
            "authVerifier",
            "authSalt",
            "kdfParams",
            "wrappedDek",
        ] {
            assert!(json.get(key).is_some(), "missing {key}");
        }
        // The endpoint no longer accepts the other three blobs, and sending them
        // would trip forbidNonWhitelisted.
        for key in ["wrappedDekRecovery", "publicKey", "wrappedPrivateKey"] {
            assert!(json.get(key).is_none(), "must not send {key}");
        }
    }
```

- [ ] **Step 2 : Lancer et vérifier l'échec**

Run: `cd src-tauri && cargo test crypto::account`
Expected: FAIL — `cannot find function prepare_key_rotation`.

- [ ] **Step 3 : Implémenter**

Ajouter à `src-tauri/src/crypto/account.rs`, après `prepare_registration` :

```rust
/// Exactly what PUT /v1/keys accepts, and nothing more.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RotationMaterial {
    pub current_auth_verifier: String,
    pub auth_verifier: String,
    pub auth_salt: String,
    pub kdf_params: KdfParams,
    pub wrapped_dek: String,
}

/// Re-wraps the existing DEK under a new password. The DEK itself is unchanged,
/// which is what leaves the recovery phrase and the X25519 private key working.
pub fn prepare_key_rotation(
    current_password: &str,
    current_auth_salt: &str,
    new_password: &str,
    wrapped_dek: &str,
) -> Result<RotationMaterial, CryptoError> {
    let mut current_master = derive_master_key(current_password, current_auth_salt)?;
    let current_auth_verifier = derive_auth_verifier(&current_master);
    let mut current_kek = derive_kek(&current_master);
    current_master.zeroize();

    let opened = open(&current_kek, AAD_DEK, wrapped_dek);
    current_kek.zeroize();
    let mut dek: [u8; 32] = opened?
        .try_into()
        .map_err(|_| CryptoError::Input("wrapped DEK did not hold 32 bytes".into()))?;

    let auth_salt = generate_auth_salt();
    let mut new_master = derive_master_key(new_password, &auth_salt)?;
    let auth_verifier = derive_auth_verifier(&new_master);
    let mut new_kek = derive_kek(&new_master);
    new_master.zeroize();

    let rewrapped = seal(&new_kek, AAD_DEK, &dek);
    new_kek.zeroize();
    dek.zeroize();

    Ok(RotationMaterial {
        current_auth_verifier,
        auth_verifier,
        auth_salt,
        kdf_params: KdfParams::current(),
        wrapped_dek: rewrapped,
    })
}
```

Ajouter `open` à l'import de `wrap` en tête du fichier :

```rust
use super::wrap::{open, seal, AAD_DEK, AAD_DEK_RECOVERY, AAD_PRIVATE_KEY};
```

Ajouter la commande à la fin de `state.rs`, avant son module de tests :

```rust
#[tauri::command]
pub fn crypto_prepare_key_rotation(
    current_password: String,
    current_auth_salt: String,
    new_password: String,
    wrapped_dek: String,
) -> Result<super::account::RotationMaterial, String> {
    super::account::prepare_key_rotation(
        &current_password,
        &current_auth_salt,
        &new_password,
        &wrapped_dek,
    )
    .map_err(Into::into)
}
```

Et l'ajouter aux deux listes `generate_handler!` de `lib.rs`.

- [ ] **Step 4 : Lancer et vérifier le succès**

Run: `cd src-tauri && cargo test crypto::account`
Expected: PASS (13 tests). Comptez une minute : la rotation fait quatre dérivations Argon2id.

- [ ] **Step 5 : Commit**

```bash
git add src-tauri/src/crypto src-tauri/src/lib.rs
git commit -m "feat: :sparkles: re-wrap the DEK on a password change"
```

---

## Task 10 : Liaison TypeScript et scénario complet

**Files:**
- Create: `src/crypto/types.ts`, `src/crypto/index.ts`, `src/crypto/index.test.ts`
- Create: `src-tauri/src/crypto/scenario.rs`
- Modify: `src-tauri/src/crypto/mod.rs`

**Interfaces:**
- Produces : les fonctions TypeScript `prepareRegistration`, `beginUnlock`, `completeUnlock`, `unlockWithRecovery`, `lock`, `isUnlocked`, `encryptRecord`, `decryptRecord`, `prepareKeyRotation`.

- [ ] **Step 1 : Écrire le scénario Rust de bout en bout**

Créer `src-tauri/src/crypto/scenario.rs` :

```rust
//! One scenario walking the whole lifecycle. The per-module tests each prove a
//! property in isolation; this proves they compose — which is where a mismatched
//! AAD or a rotated DEK would actually surface.

#[cfg(test)]
mod tests {
    use crate::crypto::account::{prepare_key_rotation, prepare_registration};
    use crate::crypto::records::{decrypt_record, encrypt_record};
    use crate::crypto::state::CryptoState;

    #[test]
    fn register_lock_unlock_rotate_and_recover() {
        // 1. Register.
        let m = prepare_registration("first password").unwrap();

        // 2. Unlock with the password and write a record.
        let mut vault = CryptoState::default();
        let verifier = vault.begin_unlock("first password", &m.auth_salt).unwrap();
        assert_eq!(verifier, m.auth_verifier, "the server would reject a mismatch");
        vault.complete_unlock(&m.wrapped_dek, "user-1").unwrap();
        let blob = encrypt_record(&vault, "task", "t-1", r#"{"title":"pain"}"#).unwrap();

        // 3. Lock. The record must be unreadable.
        vault.lock();
        assert!(decrypt_record(&vault, "task", "t-1", &blob).is_err());

        // 4. Unlock again with the password: the record reads back.
        vault.begin_unlock("first password", &m.auth_salt).unwrap();
        vault.complete_unlock(&m.wrapped_dek, "user-1").unwrap();
        assert_eq!(
            decrypt_record(&vault, "task", "t-1", &blob).unwrap(),
            r#"{"title":"pain"}"#
        );

        // 5. Unlock a fresh vault with the recovery phrase instead.
        let mut recovered = CryptoState::default();
        recovered
            .unlock_with_recovery(&m.recovery_phrase, &m.wrapped_dek_recovery, "user-1")
            .unwrap();
        assert_eq!(
            decrypt_record(&recovered, "task", "t-1", &blob).unwrap(),
            r#"{"title":"pain"}"#
        );

        // 6. Change the password.
        let r = prepare_key_rotation(
            "first password",
            &m.auth_salt,
            "second password",
            &m.wrapped_dek,
        )
        .unwrap();

        // 7. The new password reads the record written under the old one.
        let mut rotated = CryptoState::default();
        rotated.begin_unlock("second password", &r.auth_salt).unwrap();
        rotated.complete_unlock(&r.wrapped_dek, "user-1").unwrap();
        assert_eq!(
            decrypt_record(&rotated, "task", "t-1", &blob).unwrap(),
            r#"{"title":"pain"}"#
        );

        // 8. And the original recovery phrase still works — the whole point of
        //    re-wrapping rather than regenerating the DEK.
        let mut recovered_again = CryptoState::default();
        recovered_again
            .unlock_with_recovery(&m.recovery_phrase, &m.wrapped_dek_recovery, "user-1")
            .unwrap();
        assert_eq!(
            decrypt_record(&recovered_again, "task", "t-1", &blob).unwrap(),
            r#"{"title":"pain"}"#
        );

        // 9. The old password no longer opens the new wrap.
        let mut stale = CryptoState::default();
        stale.begin_unlock("first password", &r.auth_salt).unwrap();
        assert!(stale.complete_unlock(&r.wrapped_dek, "user-1").is_err());
    }
}
```

Ajouter `mod scenario;` à `mod.rs`.

- [ ] **Step 2 : Lancer le scénario**

Run: `cd src-tauri && cargo test crypto::scenario -- --nocapture`
Expected: PASS (1 test). Comptez une à deux minutes — six dérivations Argon2id.

- [ ] **Step 3 : Écrire les types TypeScript**

Créer `src/crypto/types.ts` :

```ts
export interface KdfParams {
	memoryCost: number;
	timeCost: number;
	parallelism: number;
}

/** Everything POST /v1/auth/register needs, plus the phrase shown once. */
export interface RegistrationMaterial {
	authSalt: string;
	authVerifier: string;
	wrappedDek: string;
	wrappedDekRecovery: string;
	publicKey: string;
	wrappedPrivateKey: string;
	kdfParams: KdfParams;
	/** Shown to the user once, never sent anywhere. */
	recoveryPhrase: string;
}

/**
 * The `keys` object POST /v1/auth/register nests the four blobs under. The
 * endpoint accepts no kdfParams and must never see the recovery phrase, so the
 * material cannot be spread into the body as-is.
 */
export interface RegisterKeys {
	wrappedDek: string;
	wrappedDekRecovery: string;
	publicKey: string;
	wrappedPrivateKey: string;
}

/** Exactly the body PUT /v1/keys accepts. */
export interface RotationMaterial {
	currentAuthVerifier: string;
	authVerifier: string;
	authSalt: string;
	kdfParams: KdfParams;
	wrappedDek: string;
}
```

- [ ] **Step 4 : Écrire les enveloppes**

Créer `src/crypto/index.ts` :

```ts
import { invoke } from "@tauri-apps/api/core";
import type {
	RegisterKeys,
	RegistrationMaterial,
	RotationMaterial,
} from "./types";

export type {
	KdfParams,
	RegisterKeys,
	RegistrationMaterial,
	RotationMaterial,
} from "./types";

/**
 * Narrows the material down to what POST /v1/auth/register nests under `keys`.
 *
 * Spreading the material into the body instead would send kdfParams and the
 * recovery phrase — the first is not a field register accepts, the second must
 * never leave the device, and forbidNonWhitelisted turns either into a 400.
 */
export function toRegisterKeys(material: RegistrationMaterial): RegisterKeys {
	return {
		wrappedDek: material.wrappedDek,
		wrappedDekRecovery: material.wrappedDekRecovery,
		publicKey: material.publicKey,
		wrappedPrivateKey: material.wrappedPrivateKey,
	};
}

// Keys never cross this boundary: these calls take a password or a blob and
// return blobs. The unlocked vault lives in Rust memory and is zeroized on lock.

export function prepareRegistration(
	password: string,
): Promise<RegistrationMaterial> {
	return invoke<RegistrationMaterial>("crypto_prepare_registration", {
		password,
	});
}

/**
 * Derives the verifier the server expects and keeps the master key in Rust
 * memory for completeUnlock, so signing in pays for Argon2id once rather than
 * on both sides of the network round trip.
 */
export function beginUnlock(
	password: string,
	authSalt: string,
): Promise<string> {
	return invoke<string>("crypto_begin_unlock", { password, authSalt });
}

export function completeUnlock(
	wrappedDek: string,
	userId: string,
): Promise<void> {
	return invoke("crypto_complete_unlock", { wrappedDek, userId });
}

export function unlockWithRecovery(
	recoveryPhrase: string,
	wrappedDekRecovery: string,
	userId: string,
): Promise<void> {
	return invoke("crypto_unlock_with_recovery", {
		recoveryPhrase,
		wrappedDekRecovery,
		userId,
	});
}

export function lock(): Promise<void> {
	return invoke("crypto_lock");
}

export function isUnlocked(): Promise<boolean> {
	return invoke<boolean>("crypto_is_unlocked");
}

export function encryptRecord(
	entityType: string,
	entityId: string,
	plaintext: string,
): Promise<string> {
	return invoke<string>("crypto_encrypt_record", {
		entityType,
		entityId,
		plaintext,
	});
}

export function decryptRecord(
	entityType: string,
	entityId: string,
	blob: string,
): Promise<string> {
	return invoke<string>("crypto_decrypt_record", { entityType, entityId, blob });
}

export function prepareKeyRotation(
	currentPassword: string,
	currentAuthSalt: string,
	newPassword: string,
	wrappedDek: string,
): Promise<RotationMaterial> {
	return invoke<RotationMaterial>("crypto_prepare_key_rotation", {
		currentPassword,
		currentAuthSalt,
		newPassword,
		wrappedDek,
	});
}
```

- [ ] **Step 5 : Écrire le test des enveloppes**

Créer `src/crypto/index.test.ts` :

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...a: unknown[]) => invoke(...a) }));

import {
	beginUnlock,
	completeUnlock,
	decryptRecord,
	encryptRecord,
	isUnlocked,
	lock,
	prepareKeyRotation,
	prepareRegistration,
	toRegisterKeys,
	unlockWithRecovery,
} from "./index";
import type { RegistrationMaterial } from "./types";

beforeEach(() => invoke.mockReset().mockResolvedValue(undefined));

describe("crypto bindings", () => {
	// Argument names are the contract with Rust: Tauri matches them by name, so
	// a typo fails at runtime with an unhelpful message rather than at compile time.
	it("passes camelCase argument names through to each command", async () => {
		await prepareRegistration("pw");
		expect(invoke).toHaveBeenLastCalledWith("crypto_prepare_registration", {
			password: "pw",
		});

		await beginUnlock("pw", "a".repeat(32));
		expect(invoke).toHaveBeenLastCalledWith("crypto_begin_unlock", {
			password: "pw",
			authSalt: "a".repeat(32),
		});

		await completeUnlock("blob", "user-1");
		expect(invoke).toHaveBeenLastCalledWith("crypto_complete_unlock", {
			wrappedDek: "blob",
			userId: "user-1",
		});

		await unlockWithRecovery("word ".repeat(24).trim(), "blob", "user-1");
		expect(invoke).toHaveBeenLastCalledWith("crypto_unlock_with_recovery", {
			recoveryPhrase: "word ".repeat(24).trim(),
			wrappedDekRecovery: "blob",
			userId: "user-1",
		});

		await encryptRecord("task", "t-1", "{}");
		expect(invoke).toHaveBeenLastCalledWith("crypto_encrypt_record", {
			entityType: "task",
			entityId: "t-1",
			plaintext: "{}",
		});

		await decryptRecord("task", "t-1", "blob");
		expect(invoke).toHaveBeenLastCalledWith("crypto_decrypt_record", {
			entityType: "task",
			entityId: "t-1",
			blob: "blob",
		});

		await prepareKeyRotation("old", "b".repeat(32), "new", "blob");
		expect(invoke).toHaveBeenLastCalledWith("crypto_prepare_key_rotation", {
			currentPassword: "old",
			currentAuthSalt: "b".repeat(32),
			newPassword: "new",
			wrappedDek: "blob",
		});
	});

	it("calls the no-argument commands without a payload", async () => {
		await lock();
		expect(invoke).toHaveBeenLastCalledWith("crypto_lock");
		await isUnlocked();
		expect(invoke).toHaveBeenLastCalledWith("crypto_is_unlocked");
	});

	it("never sends a key or a plaintext password field named like a secret", async () => {
		// A guard against someone later widening the surface: the only secret
		// these bindings may carry is a password the user just typed.
		await prepareRegistration("pw");
		const payload = invoke.mock.calls.at(-1)?.[1] as Record<string, unknown>;
		expect(Object.keys(payload)).toEqual(["password"]);
	});
});

describe("toRegisterKeys", () => {
	const material: RegistrationMaterial = {
		authSalt: "a".repeat(32),
		authVerifier: "b".repeat(64),
		wrappedDek: "dek",
		wrappedDekRecovery: "dek-recovery",
		publicKey: "pub",
		wrappedPrivateKey: "priv",
		kdfParams: { memoryCost: 65536, timeCost: 3, parallelism: 4 },
		recoveryPhrase: "word ".repeat(24).trim(),
	};

	it("keeps only the four blobs register nests under `keys`", () => {
		expect(toRegisterKeys(material)).toEqual({
			wrappedDek: "dek",
			wrappedDekRecovery: "dek-recovery",
			publicKey: "pub",
			wrappedPrivateKey: "priv",
		});
	});

	it("drops the recovery phrase and the kdf params", () => {
		// The phrase must never leave the device, and register accepts no
		// kdfParams field at all — forbidNonWhitelisted rejects the whole body.
		const keys = toRegisterKeys(material) as Record<string, unknown>;
		expect(keys.recoveryPhrase).toBeUndefined();
		expect(keys.kdfParams).toBeUndefined();
		expect(keys.authSalt).toBeUndefined();
	});
});
```

- [ ] **Step 6 : Lancer les tests TypeScript**

Run: `pnpm test:run src/crypto`
Expected: PASS (5 tests).

- [ ] **Step 7 : Vérifier l'ensemble**

```bash
cd src-tauri && cargo fmt --all --check && cargo clippy --all-targets -- -D warnings && cargo test
cd .. && pnpm test:run && pnpm lint && pnpm build
```

Expected : tout sort en 0.

- [ ] **Step 8 : Mettre à jour le changelog**

Ce lot n'est pas visible par l'utilisateur — aucune UI ne l'appelle encore. Ne rien ajouter à `src/assets/changelog.json` (CLAUDE.md : ne rien ajouter pour un changement purement interne).

- [ ] **Step 9 : Lancer react-doctor et le lint (obligatoire, CLAUDE.md)**

```bash
nvm use 22.22.2
rm -rf ~/.npm/_npx
pnpm run doctor
pnpm run lint:fix
```

Ne corriger que les diagnostics introduits par ce plan.

- [ ] **Step 10 : Commit**

```bash
git add src/crypto src-tauri/src/crypto
git commit -m "feat: :sparkles: expose the crypto commands to the frontend"
```

---

## Notes pour les plans suivants

- **`sync_state` reste vide.** Le plan 4 y écrira l'identifiant d'appareil, le curseur et l'URL du serveur. Ce plan ne persiste rien : verrouiller l'application efface les clés, et il n'existe aucun cache local des blobs enveloppés. Le déverrouillage hors ligne demandera donc un cache local, à décider au plan 4.
- **`LOCAL_DEVICE_ID = "local"`** dans `sqlite-repository.ts` reste un placeholder. Le plan 4 le remplacera par l'identifiant réel.
- **La CSP de `tauri.conf.json`** limite `connect-src` à `'self' https://github.com`. Le plan 5 devra l'élargir à l'URL de serveur choisie par l'utilisateur, faute de quoi aucune requête de synchronisation ne partira.
- **Le coût d'Argon2id est réel** : environ une seconde par dérivation sur un poste correct, davantage sur mobile. Le plan 5 doit prévoir un état d'attente sur les écrans de connexion, d'inscription et de changement de mot de passe.
