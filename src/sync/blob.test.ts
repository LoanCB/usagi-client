import { describe, expect, it } from "vitest";
import {
	base64ToBytes,
	bytesToBase64,
	joinRecordBlob,
	RECORD_NONCE_BYTES,
	splitRecordBlob,
} from "./blob";

function blobOf(nonceFill: number, cipherBytes: number[]): string {
	const raw = new Uint8Array(RECORD_NONCE_BYTES + cipherBytes.length);
	raw.fill(nonceFill, 0, RECORD_NONCE_BYTES);
	raw.set(cipherBytes, RECORD_NONCE_BYTES);
	return bytesToBase64(raw);
}

describe("record blob split/join", () => {
	it("splits a sealed blob into its 24-byte nonce and the ciphertext", () => {
		const blob = blobOf(0x0e, [1, 2, 3, 4, 5]);
		const { nonce, ciphertext } = splitRecordBlob(blob);
		expect(base64ToBytes(nonce)).toEqual(
			new Uint8Array(RECORD_NONCE_BYTES).fill(0x0e),
		);
		expect(base64ToBytes(ciphertext)).toEqual(new Uint8Array([1, 2, 3, 4, 5]));
	});

	it("round-trips: join(split(blob)) is byte-identical", () => {
		const blob = blobOf(
			0x42,
			Array.from({ length: 33 }, (_, i) => i),
		);
		const { nonce, ciphertext } = splitRecordBlob(blob);
		expect(joinRecordBlob(nonce, ciphertext)).toBe(blob);
	});

	it("rejects a blob shorter than its nonce", () => {
		const raw = new Uint8Array(RECORD_NONCE_BYTES); // nonce alone, no ciphertext
		expect(() => splitRecordBlob(bytesToBase64(raw))).toThrow(/shorter/);
	});

	it("rejects invalid base64", () => {
		expect(() => splitRecordBlob("not@base64!")).toThrow();
	});

	it("base64 helpers round-trip arbitrary bytes", () => {
		const bytes = new Uint8Array(256).map((_, i) => i);
		expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes);
	});
});
