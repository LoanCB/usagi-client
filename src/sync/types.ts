import type { FieldStamp, FieldStamps } from "@/db/field-timestamps";

export type SyncEntityType = "task" | "project" | "tag" | "project_group";

/**
 * A deferred FK reference parked in sync_extra (payload.ts PENDING_REF_KEY),
 * keyed by column name. `f` is the field's stamp at deferral time: a later
 * local edit replaces that stamp and thereby invalidates the parked value.
 */
export type PendingRefs = Record<string, { id: string; f: FieldStamp | null }>;
export const ENTITY_TABLE = {
	task: "tasks",
	project: "projects",
	tag: "tags",
	project_group: "project_groups",
} as const;

export interface PushChange {
	entityType: SyncEntityType;
	id: string;
	purged: boolean;
	ciphertext?: string;
	nonce?: string;
}
export interface AppliedChange {
	entityType: SyncEntityType;
	id: string;
	seq: number;
}
export interface PushResponse {
	applied: AppliedChange[];
	serverTime: string;
}
export interface PulledRecord {
	entityType: SyncEntityType;
	id: string;
	seq: number;
	ciphertext: string | null;
	nonce: string | null;
	purged: boolean;
}
export interface PullResponse {
	records: PulledRecord[];
	nextCursor: number;
	hasMore: boolean;
	serverTime: string;
}

export interface SyncTransport {
	push(changes: PushChange[]): Promise<PushResponse>;
	pull(cursor: number, limit: number): Promise<PullResponse>;
}
export interface RecordCipher {
	encrypt(
		entityType: SyncEntityType,
		entityId: string,
		plaintext: string,
	): Promise<{ ciphertext: string; nonce: string }>;
	decrypt(
		entityType: SyncEntityType,
		entityId: string,
		ciphertext: string,
		nonce: string,
	): Promise<string>;
}

export interface ServerInfo {
	name: string;
	version: string;
	protocolVersion: number;
	registrationEnabled: boolean;
	minClientVersion: string;
}
export const CLIENT_PROTOCOL_VERSION = 1;

export type SyncStatus =
	| "idle"
	| "syncing"
	| "locked"
	| "awaiting-first-sync"
	| "reauth-required"
	| "protocol-mismatch";

export class CursorOutOfRangeError extends Error {}
export class ReauthRequiredError extends Error {}
export class ProtocolMismatchError extends Error {
	constructor(public readonly server: ServerInfo) {
		super("protocol mismatch");
	}
}

/**
 * Thrown by the production `unlock` dep when the failure was transport-level
 * (SyncNetworkError, or any fetch that never reached the server) rather than a
 * rejected password. UnlockDialog branches on this to avoid telling an offline
 * user their password is wrong.
 */
export class SyncUnlockOfflineError extends Error {
	constructor() {
		super("offline: could not reach the server to unlock");
		this.name = "SyncUnlockOfflineError";
	}
}

/**
 * Thrown by the production `unlock` dep when the server rejected the session
 * itself (ReauthRequiredError: the refresh token was revoked or rotated away).
 * Distinct from both offline and a rejected password — the password is fine and
 * retyping it can never help, so UnlockDialog must say so and point at
 * signing in again.
 */
export class SyncUnlockReauthError extends Error {
	constructor() {
		super("reauth required: the stored session was rejected");
		this.name = "SyncUnlockReauthError";
	}
}

export interface SyncPayload {
	_v: 1;
	created_at: string;
	_fields: FieldStamps;
	[field: string]: unknown;
}

export const SYNC_PULL_LIMIT = 500;
export const PUSH_MAX_CHANGES = 100;
export const MAX_PLAINTEXT_BYTES = 65_520; // 65 536 (borne serveur du ciphertext décodé) − 16 (tag Poly1305)
