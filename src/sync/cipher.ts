import { decryptRecord, encryptRecord } from "@/crypto";
import { joinRecordBlob, splitRecordBlob } from "./blob";
import type { RecordCipher, SyncEntityType } from "./types";

/**
 * Adapts the Rust commands (one sealed blob) to the wire shape (nonce and
 * ciphertext apart). Not unit-testable under vitest — invoke() needs a Tauri
 * runtime — so it stays a two-line adapter over parts that are: the split is
 * covered by blob.test.ts, the sealing by the Rust tests of plan 3.
 */
export class TauriRecordCipher implements RecordCipher {
	async encrypt(
		entityType: SyncEntityType,
		entityId: string,
		plaintext: string,
	): Promise<{ ciphertext: string; nonce: string }> {
		return splitRecordBlob(
			await encryptRecord(entityType, entityId, plaintext),
		);
	}

	async decrypt(
		entityType: SyncEntityType,
		entityId: string,
		ciphertext: string,
		nonce: string,
	): Promise<string> {
		return decryptRecord(
			entityType,
			entityId,
			joinRecordBlob(nonce, ciphertext),
		);
	}
}
