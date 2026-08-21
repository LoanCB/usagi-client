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
        assert_ne!(
            generate_identity().private_key,
            generate_identity().private_key
        );
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
        let a_shared =
            StaticSecret::from(a.private_key).diffie_hellman(&PublicKey::from(b.public_key));
        let b_shared =
            StaticSecret::from(b.private_key).diffie_hellman(&PublicKey::from(a.public_key));
        assert_eq!(a_shared.as_bytes(), b_shared.as_bytes());
    }
}
