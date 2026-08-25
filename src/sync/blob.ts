/**
 * The Rust side seals records as base64(nonce ‖ ciphertext ‖ tag) — one opaque
 * string (see src-tauri/src/crypto/wrap.rs). The sync protocol carries the
 * 24-byte nonce in its own field and bounds the ciphertext separately, so the
 * engine splits the blob on push and joins it back before decrypt_record on
 * pull. Pure byte plumbing: no key material ever transits here.
 */
export const RECORD_NONCE_BYTES = 24;

export function bytesToBase64(bytes: Uint8Array): string {
	let binary = "";
	for (const b of bytes) binary += String.fromCharCode(b);
	return btoa(binary);
}

export function base64ToBytes(b64: string): Uint8Array {
	const binary = atob(b64);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return bytes;
}

export function splitRecordBlob(blob: string): {
	nonce: string;
	ciphertext: string;
} {
	const raw = base64ToBytes(blob);
	if (raw.length <= RECORD_NONCE_BYTES) {
		throw new Error("record blob is shorter than its nonce");
	}
	return {
		nonce: bytesToBase64(raw.slice(0, RECORD_NONCE_BYTES)),
		ciphertext: bytesToBase64(raw.slice(RECORD_NONCE_BYTES)),
	};
}

export function joinRecordBlob(nonce: string, ciphertext: string): string {
	const nonceBytes = base64ToBytes(nonce);
	const cipherBytes = base64ToBytes(ciphertext);
	const raw = new Uint8Array(nonceBytes.length + cipherBytes.length);
	raw.set(nonceBytes, 0);
	raw.set(cipherBytes, nonceBytes.length);
	return bytesToBase64(raw);
}
