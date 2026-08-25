import { base64ToBytes, bytesToBase64 } from "@/sync/blob";
import type { RecordCipher, SyncEntityType } from "@/sync/types";

/**
 * Stands in for the Rust cipher under vitest: "encryption" is base64 of the
 * UTF-8 plaintext with a fixed fake nonce, which keeps the engine's split
 * wire shape (ciphertext and nonce apart) without any key material. corrupt()
 * makes decrypt throw for one entity — the quarantine path's trigger.
 */
export class FakeRecordCipher implements RecordCipher {
	private readonly corrupted = new Set<string>();

	corrupt(entityType: SyncEntityType, id: string): void {
		this.corrupted.add(`${entityType} ${id}`);
	}

	heal(entityType: SyncEntityType, id: string): void {
		this.corrupted.delete(`${entityType} ${id}`);
	}

	async encrypt(
		_entityType: SyncEntityType,
		_entityId: string,
		plaintext: string,
	): Promise<{ ciphertext: string; nonce: string }> {
		return {
			ciphertext: bytesToBase64(new TextEncoder().encode(plaintext)),
			nonce: bytesToBase64(new Uint8Array(24).fill(0x0e)),
		};
	}

	async decrypt(
		entityType: SyncEntityType,
		entityId: string,
		ciphertext: string,
		_nonce: string,
	): Promise<string> {
		if (this.corrupted.has(`${entityType} ${entityId}`)) {
			throw new Error("decrypt failed (simulated corruption)");
		}
		return new TextDecoder().decode(base64ToBytes(ciphertext));
	}
}
