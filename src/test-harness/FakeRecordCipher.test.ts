import { describe, expect, it } from "vitest";
import { base64ToBytes } from "@/sync/blob";
import { FakeRecordCipher } from "./FakeRecordCipher";

describe("FakeRecordCipher", () => {
	it("round-trips plaintext through encrypt then decrypt", async () => {
		const cipher = new FakeRecordCipher();
		const plaintext = '{"title":"Buy milk","done":false}';
		const { ciphertext, nonce } = await cipher.encrypt("task", "a", plaintext);
		expect(await cipher.decrypt("task", "a", ciphertext, nonce)).toBe(
			plaintext,
		);
	});

	it("round-trips non-ASCII plaintext without loss", async () => {
		const cipher = new FakeRecordCipher();
		const plaintext = '{"title":"Café Noël — 東京 🐇"}';
		const { ciphertext, nonce } = await cipher.encrypt("task", "a", plaintext);
		expect(await cipher.decrypt("task", "a", ciphertext, nonce)).toBe(
			plaintext,
		);
	});

	it("emits a nonce that decodes to 24 bytes", async () => {
		const cipher = new FakeRecordCipher();
		const { nonce } = await cipher.encrypt("task", "a", "payload");
		expect(base64ToBytes(nonce)).toHaveLength(24);
	});

	it("throws on decrypt only for the corrupted entity", async () => {
		const cipher = new FakeRecordCipher();
		const a = await cipher.encrypt("task", "a", "alpha");
		const b = await cipher.encrypt("task", "b", "beta");
		cipher.corrupt("task", "a");
		await expect(
			cipher.decrypt("task", "a", a.ciphertext, a.nonce),
		).rejects.toThrow(/corruption/);
		expect(await cipher.decrypt("task", "b", b.ciphertext, b.nonce)).toBe(
			"beta",
		);
	});

	it("decrypts again after heal() lifts the corruption", async () => {
		const cipher = new FakeRecordCipher();
		const { ciphertext, nonce } = await cipher.encrypt("task", "a", "alpha");
		cipher.corrupt("task", "a");
		await expect(
			cipher.decrypt("task", "a", ciphertext, nonce),
		).rejects.toThrow();
		cipher.heal("task", "a");
		expect(await cipher.decrypt("task", "a", ciphertext, nonce)).toBe("alpha");
	});
});
