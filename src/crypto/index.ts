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

// These calls take a password or a blob and return blobs. The unlocked vault
// lives in Rust memory and is zeroized on lock.
//
// One exception, and it is real key material: prepareRegistration returns
// `recoveryPhrase`, which derives the recovery KEK, which unwraps the DEK — so
// it does land in the JS heap. It has to, because the user must read it. It
// must be displayed once, never persisted (no store, no localStorage, no
// database), never logged, and dropped from JS state as soon as the user
// confirms they have written it down. Nothing else here is key material.

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
	return invoke<string>("crypto_decrypt_record", {
		entityType,
		entityId,
		blob,
	});
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
