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
