import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
	invoke: (...a: unknown[]) => invoke(...a),
}));

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
		const calls = invoke.mock.calls;
		const payload = calls[calls.length - 1][1] as Record<string, unknown>;
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
		const keys = toRegisterKeys(material) as unknown as Record<string, unknown>;
		expect(keys.recoveryPhrase).toBeUndefined();
		expect(keys.kdfParams).toBeUndefined();
		expect(keys.authSalt).toBeUndefined();
	});
});
