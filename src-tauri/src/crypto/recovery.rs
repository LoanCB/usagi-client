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
    let normalised = phrase
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .to_lowercase();
    let mnemonic = Mnemonic::parse_in(Language::English, &normalised)
        .map_err(|e| CryptoError::Input(e.to_string()))?;
    let (entropy, len) = mnemonic.to_entropy_array();
    let hk = Hkdf::<Sha256>::new(None, &entropy[..len]);
    let mut out = [0u8; 32];
    hk.expand(INFO_RECOVERY_KEK, &mut out)
        .expect("32 bytes is a valid HKDF length");
    Ok(out)
}

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
        let replaced = phrase.replacen(phrase.split_whitespace().next().unwrap(), "notaword", 1);
        assert!(recovery_kek_from_phrase(&replaced).is_err());
    }
}
