# Plan 4c — Moteur de synchronisation client

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Livrer le moteur de synchronisation headless du client usagi : pull → merge → push, LWW par champ avec départage « plus grand device_id gagne », vidange transactionnelle de l'outbox, quarantaine persistée des blobs indéchiffrables, correction de dérive d'horloge, backoff 429, et le test de convergence §8.1 comme livrable à part entière.

**Architecture:** Le moteur **observe** `SqliteRepository` sans le modifier (spec §1) : les triggers de la migration 009 alimentent `sync_outbox`, le moteur la draine. Tout le réseau passe par `tauri-plugin-http` (la CSP webview ne gouverne pas ce chemin). Le moteur est construit sur trois ports injectables — `DbDriver`, `SyncTransport`, `RecordCipher` — ce qui permet de le tester intégralement sous vitest avec `BetterSqliteDriver` (schéma, migrations et triggers réels), un `FakeSyncServer` en mémoire et un chiffreur factice. Aucune UI : les réglages §6.3, le dialogue de première sync §6.4 et le parcours d'inscription sont le plan 4d.

**Tech Stack:** TypeScript (React 19 / Tauri 2), vitest + better-sqlite3 pour les tests, `@tauri-apps/plugin-http` (Rust déjà présent dans Cargo.toml), commandes crypto Rust du plan 3 (`encrypt_record`/`decrypt_record`).

**Spec (autorité) :** [docs/superpowers/specs/2026-08-20-sync-offline-first-design.md](../specs/2026-08-20-sync-offline-first-design.md) — §1, §4, §5, §7, §8.
**Contraintes post-4b (contraignantes) :** `/home/loan/Projects/perso/usagi-server/docs/superpowers/plans/2026-08-24-sync-endpoints.md`, section « Notes post-revue finale, contraignantes pour le plan 4c ».

## Décisions tranchées (2026-08-25, avec Loan)

Ne pas les rouvrir pendant l'exécution.

1. **Découpage : 4c headless, 4d UI.** 4c livre transport HTTP, client d'auth (prelogin/login/refresh/logout, persistance des tokens), moteur complet et convergence §8.1. 4d livrera les réglages §6.3, le dialogue de première sync §6.4 (avec sauvegarde JSON automatique avant « Remplacer »), l'inscription avec clé de 24 mots, la déconnexion §6.5.
2. **Backoff 429 : pacing proactif + backoff exponentiel.** Token bucket client de **18 requêtes / 60 s** (marge sous les 20/min/IP du throttler `default`), et sur 429 : honorer `Retry-After` s'il est présent (non garanti), sinon exponentiel **5 s → 10 s → 20 s → 40 s, plafond 60 s**, réinitialisé au premier succès, reprise illimitée. Le curseur et l'outbox survivent par construction.
3. **Quarantaine : table SQLite persistée** `sync_quarantine` (migration 012). Le pull avance le curseur, donc un blob quarantiné ne sera jamais re-servi : le perdre en mémoire serait une divergence silencieuse définitive. Le blob est conservé pour un retry (au prochain démarrage de moteur) ; 4d affichera le compteur.
4. **Première sync : garde-fou dans le moteur.** Détection (local non vide ∧ premier pull non vide ∧ jamais résolu) → statut `awaiting-first-sync`, pull/merge/push suspendus. `resolveFirstSync("merge" | "replace")` est l'API que 4d branchera sur son dialogue ; `replace` vide les tables **et l'outbox** avant tout push (§6.4).
5. **Harnais de convergence : `BetterSqliteDriver`, pas `MemoryRepository`.** Le spec §8.1 cite `MemoryRepository`, écrit avant que 4a ne livre `BetterSqliteDriver`. La convergence dépend précisément des triggers d'outbox et des transactions réelles — `MemoryRepository` n'en a aucun. Deux appareils = deux `BetterSqliteDriver` migrés, mêmes migrations que la prod.
6. **Refresh token persisté dans `sync_state`.** Le SQLite local n'est pas chiffré ; le token y est au même niveau de protection que les données qu'il permet de lire. L'access token, lui, ne vit qu'en mémoire.

## Contrat serveur vérifié (develop `74e5f2c` — copié du code, pas de la doc)

```
POST /v1/sync/push            Bearer JWT, camelCase strict, forbidNonWhitelisted
  { changes: [{ entityType, id, purged, ciphertext?, nonce? }] }   1 ≤ n ≤ 100
  entityType ∈ { task, project, tag, project_group } ; id: string 1..64
  vivant : ciphertext base64 décodé ∈ [17, 65 536] octets, nonce base64 = 24 octets exacts
  tombstone : purged=true, ciphertext/nonce OMIS ou explicitement null (les deux acceptés)
  → 200 { applied: [{ entityType, id, seq }], serverTime: ISO 8601 }
  Écrasement inconditionnel + seq frais à chaque push (rejouer un batch consomme de nouveaux seq — prévu).
  Erreurs : 400 (validation, batch entier rejeté), 401, 413 (>10 Mo), 429.

GET /v1/sync/pull?cursor=<n>&limit=<1..500>          cursor obligatoire ≥ 0, limit défaut 500
  → 200 { records: [{ entityType, id, seq, ciphertext: string|null, nonce: string|null, purged }],
          nextCursor, hasMore, serverTime }
  Ordre seq croissant, curseur exclusif (seq > cursor). nextCursor = seq du dernier record, ou cursor si page vide.
  Erreurs : 400, 401, 429, 409 { statusCode: 409, code: "CURSOR_OUT_OF_RANGE", ... } si cursor > seqCounter
  ⇒ le client remet son curseur à 0 et re-pull tout.

429 : throttler « default » 20 req/min/IP sur TOUTES les routes (auth comprise, sauf budget « login »
plus strict sur POST /v1/auth/login seul). Corps Nest standard ; Retry-After NON garanti.

POST /v1/auth/prelogin { email } → 200 { salt, kdfParams: { memoryCost, timeCost, parallelism } }
POST /v1/auth/login    { email, authVerifier, deviceName, devicePlatform }
  → 200 { userId, workspaceId, deviceId, accessToken, refreshToken }
POST /v1/auth/refresh  { refreshToken } → 200 { accessToken, refreshToken }   ← rotation à CHAQUE refresh
POST /v1/auth/logout   { refreshToken } → 204
GET  /v1/keys          Bearer → 200 { wrappedDek, wrappedDekRecovery, publicKey, wrappedPrivateKey }
GET  /v1/server-info   → 200 { name, version, protocolVersion: 1, registrationEnabled, minClientVersion }
```

## Faits client vérifiés dont le plan dépend

- **`seal()` Rust produit UN blob** `base64(nonce(24) ‖ ciphertext ‖ tag(16))` ([wrap.rs](../../../src-tauri/src/crypto/wrap.rs)). Le serveur veut le nonce **dans son propre champ** : le moteur scinde au push et recompose au pull (tâche 3). Pas de nouvelle commande Rust.
- **`tags.name` est UNIQUE globalement** (migration 001, jamais levée). Deux appareils créant hors ligne un tag du même nom sous deux ids ⇒ collision à l'application du pull. Règle déterministe de fusion en tâche 11 (« plus petit id gagne »), sans quoi le moteur casse ou diverge.
- `deleteTag` n'est qu'un archivage (`deleted_at`) ; seuls `deleteTask`, `deleteProjectGroup`, `deleteProject` et `bulkImport` posent des `purged_at`. Les tombstones de tags existent donc (import `replace`) et transitent par la sync.
- `sync_state` est une table clé/valeur (migration 009) ; `getOrCreateDeviceId()` ([device-id.ts](../../../src/db/device-id.ts)) y stocke déjà `device_id`.
- Les triggers d'outbox se déclenchent **aussi** quand le moteur applique un changement distant — c'est le cœur du problème de vidange transactionnelle (§9.5) que la tâche 11 résout.
- Estampilles : `field_updated_at` JSON `{ champ: { t: ISO 8601 ms, d: uuid | "" } }` via [field-timestamps.ts](../../../src/db/field-timestamps.ts) (`stampFields`, `FieldStamp`, `FieldStamps` exportés). Les stamps hérités blanchis par la migration 010 portent `d: ""` et doivent **perdre** les égalités (§5, « plus grand gagne »).
- `tauri-plugin-http` v2 est déjà initialisé côté Rust ([lib.rs](../../../src-tauri/src/lib.rs), bloc desktop) ; le paquet JS `@tauri-apps/plugin-http` n'est **pas** dans package.json, et la capability `desktop.json` ne couvre que GitHub. La CSP `connect-src` de tauri.conf.json ne gouverne pas ce plugin (IPC, pas requête webview) : **ne pas la modifier**.
- Init de l'app : [App.tsx:115-118](../../../src/App.tsx) — `adaptDatabase` → `runMigrations` → `backfillSortKeys` → `setRepository`. Le branchement du moteur s'insère là (tâche 14).
- `BetterSqliteDriver` ([test-harness](../../../src/test-harness/BetterSqliteDriver.ts)) offre `failNextExecuteMatching(pattern)`, `countWrites()`, `reopen()`, `close()`.

## Global Constraints

- **Dépôt :** `/home/loan/Projects/perso/usagi`, base `develop` à jour d'`origin`. Branche de travail : `feat/sync-engine`.
- **pnpm**, jamais npm. Commandes : `pnpm test:run` (vitest), `pnpm test:run <fichier>` pour filtrer, `pnpm lint` / `pnpm lint:fix` (Biome — tabs, doubles quotes).
- **Commits :** `type: :gitmoji: message impératif en anglais`, **sans trailer Co-Authored-By**.
- **Commentaires en anglais**, seulement pour des *pourquoi* non évidents (CLAUDE.md). **Types dans leur propre fichier** sauf props locales.
- **Chemin alias `@/` = `src/`.** Tests colocalisés `*.test.ts`, en-tête `// @vitest-environment node` pour les tests better-sqlite3.
- **Valeurs protocole (ne pas dériver, copier) :** batch push ≤ **100** ; plaintext chiffrable ≤ **65 520** octets (65 536 − tag 16) ; nonce **24** octets ; pull limit **500** ; bucket **18 / 60 s** ; backoff **5/10/20/40 s cap 60 s** ; clamp horloge **24 h** ; `CLIENT_PROTOCOL_VERSION = 1` ; départage LWW : à `t` strictement égal, **`d` lexicographiquement le plus grand gagne**.
- **Migrations : ADD COLUMN et CREATE TABLE uniquement** — jamais de reconstruction de table synchronisée (piège §9.6 : une reconstruction droppe triggers et colonnes de sync).
- **Aucune entrée changelog** : le moteur est invisible tant que 4d n'existe pas (`server_url` n'est jamais posé). La règle CLAUDE.md « changement visible » ne s'applique pas ; 4d portera l'entrée.
- **Fin de tâche CLAUDE.md** (react-doctor sur `nvm use 22.22.2` + purge npx, puis `pnpm lint:fix`) : appliquée en clôture, pas à chaque tâche.
- **Les tests appellent l'API de production** (`createTask({ title, projectId })`, `updateTask(id, { tags })`, `moveTask(id, prev, next)`…). Si une signature réelle de [src/db/repository.ts](../../../src/db/repository.ts) diffère de l'appel écrit dans un test de ce plan, **adapter l'appel à l'API réelle** — jamais l'inverse, et jamais en contournant le repository pour écrire du SQL direct dans un scénario qui modélise un utilisateur.

### Protocole anti-test-creux (obligatoire)

Tout test marqué **[SABOTAGE]** passe par ce cycle, **après le commit de la tâche** (le sabotage se restaure par `git checkout --`, qui ne restaure que du committé — leçon du plan 4b) :

1. **Saboter** le code de production exactement comme décrit.
2. **Vérifier que le sabotage s'est appliqué** — toujours les deux :
   - `git diff --stat -- <fichier>` liste le fichier (diff vide = sabotage non appliqué → STOP) ;
   - le `grep` donné dans l'étape produit exactement la sortie attendue.
3. **Exécuter le test : il DOIT échouer.** S'il passe, le test est creux — corriger le test, pas le sabotage.
4. **Restaurer** : `git checkout -- <fichier>`.
5. **Ré-exécuter : il DOIT passer.**

Les tests écrits avant leur implémentation (TDD normal) constatent leur rouge à l'étape dédiée et n'ont pas besoin de sabotage, sauf mention contraire.

---

## Structure de fichiers

| Fichier | Rôle | Tâche |
|---|---|---|
| `src/lib/sync-clock.ts` (+ test) | horloge corrigée du décalage serveur (§5.1) | 1 |
| `src/db/sqlite-repository.ts` | bascule des `new Date().toISOString()` vers l'horloge | 1 |
| `src/db/migrations/012_sync_engine.sql`, `migrations/index.ts` | `sync_extra` ×4 tables + table `sync_quarantine` | 2 |
| `src/db/migrations/sync-engine-schema.test.ts` | garde-fou du schéma 012 | 2 |
| `src/sync/types.ts` | types protocole + ports (`SyncTransport`, `RecordCipher`…) | 3 |
| `src/sync/blob.ts` (+ test) | base64, scission/recomposition `nonce ‖ ciphertext` | 3 |
| `src/sync/state.ts` (+ test) | accès typé à `sync_state` | 3 |
| `src/sync/cipher.ts` | `TauriRecordCipher` (adaptateur des commandes Rust) | 3 |
| `package.json`, `src-tauri/capabilities/desktop.json` | dépendance JS plugin-http + scope d'URL | 4 |
| `src/sync/http.ts` (+ test) | `requestJson`, `SyncHttpError`, fetch injectable | 4 |
| `src/sync/auth.ts` (+ test) | `signIn`/`register`/`getServerInfo`, `AuthorizedHttp` (refresh + rotation) | 5 |
| `src/sync/backoff.ts` (+ test) | `RequestGate` : token bucket + backoff 429 | 6 |
| `src/sync/transport.ts` (+ test) | `HttpSyncTransport` : push/pull HTTP, 429 en boucle, 409 → erreur typée | 7 |
| `src/sync/payload.ts` (+ test) | ligne SQL ⇄ payload chiffrable, champs inconnus, `_unlinkedTags` | 8 |
| `src/sync/merge.ts` (+ test) | LWW pur par champ, départage, clamp 24 h | 9 |
| `src/test-harness/FakeSyncServer.ts` (+ test) | sémantique serveur en mémoire (seq, LWW, pagination, 409) | 10 |
| `src/test-harness/FakeRecordCipher.ts` | chiffreur factice, corruption injectable | 10 |
| `src/sync/apply.ts` | écritures locales du merge (upsert, tombstones, task_tags, quarantaine) | 11 |
| `src/sync/engine.ts` + `engine.pull.test.ts` | boucle pull/merge/apply, curseur, quarantaine, réparations | 11 |
| `engine.push.test.ts` | drain d'outbox, batching, tombstones, garde de taille | 12 |
| `engine.first-sync.test.ts` | garde-fou §6.4, `resolveFirstSync` | 13 |
| `src/sync/scheduler.ts`, `src/sync/notifying-repository.ts`, `src/sync/init.ts` (+ tests), `src/App.tsx` | déclencheurs §4.2, branchement inerte sans `server_url` (§6.1, §8.2) | 14 |
| `src/sync/convergence.test.ts` | **livrable §8.1** : deux appareils, opérations aléatoires, convergence stricte | 15 |

## Types partagés (référence pour toutes les tâches)

Définis en tâche 3 (`src/sync/types.ts`), consommés partout — les noms ci-dessous font foi :

```ts
export type SyncEntityType = "task" | "project" | "tag" | "project_group";
export const SYNC_ENTITY_TYPES: readonly SyncEntityType[];
export const ENTITY_TABLE: Record<SyncEntityType, string>; // task→tasks, …, project_group→project_groups

export interface PushChange { entityType: SyncEntityType; id: string; purged: boolean; ciphertext?: string; nonce?: string; }
export interface AppliedChange { entityType: SyncEntityType; id: string; seq: number; }
export interface PushResponse { applied: AppliedChange[]; serverTime: string; }
export interface PulledRecord { entityType: SyncEntityType; id: string; seq: number; ciphertext: string | null; nonce: string | null; purged: boolean; }
export interface PullResponse { records: PulledRecord[]; nextCursor: number; hasMore: boolean; serverTime: string; }

export interface SyncTransport {
	push(changes: PushChange[]): Promise<PushResponse>;
	pull(cursor: number, limit: number): Promise<PullResponse>;
}
export interface RecordCipher {
	encrypt(entityType: SyncEntityType, entityId: string, plaintext: string): Promise<{ ciphertext: string; nonce: string }>;
	decrypt(entityType: SyncEntityType, entityId: string, ciphertext: string, nonce: string): Promise<string>;
}

export interface ServerInfo { name: string; version: string; protocolVersion: number; registrationEnabled: boolean; minClientVersion: string; }
export const CLIENT_PROTOCOL_VERSION = 1;

export type SyncStatus = "idle" | "syncing" | "awaiting-first-sync" | "reauth-required" | "protocol-mismatch";

export class CursorOutOfRangeError extends Error {}
export class ReauthRequiredError extends Error {}
export class ProtocolMismatchError extends Error { constructor(public readonly server: ServerInfo) { super("protocol mismatch"); } }

export interface SyncPayload {
	_v: 1;
	created_at: string;
	_fields: FieldStamps; // import type { FieldStamps } from "@/db/field-timestamps"
	[field: string]: unknown;
}

export const SYNC_PULL_LIMIT = 500;
export const PUSH_MAX_CHANGES = 100;
export const MAX_PLAINTEXT_BYTES = 65_520; // 65 536 (borne serveur du ciphertext décodé) − 16 (tag Poly1305)
```

---

### Tâche 1 : Horloge corrigée du décalage serveur (§5.1)

Le LWW repose sur les timestamps que `SqliteRepository` écrit. Si le moteur corrige la dérive dans son coin, les estampilles du repository restent fausses : la correction doit s'appliquer **à la source**. Un module d'horloge à décalage réglable, et le repository bascule dessus. Décalage par défaut 0 ⇒ comportement strictement inchangé tant que la sync est inactive.

**Files:**
- Create: `src/lib/sync-clock.ts`
- Test: `src/lib/sync-clock.test.ts`
- Modify: `src/db/sqlite-repository.ts` (tous les `new Date().toISOString()`)

**Interfaces:**
- Produces: `nowIso(): string`, `nowMs(): number`, `setClockOffsetMs(ms: number): void`, `getClockOffsetMs(): number`. Le moteur (tâche 11) appelle `setClockOffsetMs` et persiste la valeur ; le repository et tout code d'apply utilisent `nowIso()`.

- [ ] **Step 1 : Écrire le test (échec attendu)**

Créer `src/lib/sync-clock.test.ts` :

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	getClockOffsetMs,
	nowIso,
	nowMs,
	setClockOffsetMs,
} from "./sync-clock";

describe("sync-clock", () => {
	afterEach(() => {
		setClockOffsetMs(0);
		vi.useRealTimers();
	});

	it("returns the real clock when no offset is set", () => {
		vi.useFakeTimers({ now: new Date("2026-08-25T10:00:00.000Z") });
		expect(nowIso()).toBe("2026-08-25T10:00:00.000Z");
		expect(getClockOffsetMs()).toBe(0);
	});

	it("applies the server offset to every reading", () => {
		vi.useFakeTimers({ now: new Date("2026-08-25T10:00:00.000Z") });
		setClockOffsetMs(90_000);
		expect(nowIso()).toBe("2026-08-25T10:01:30.000Z");
		expect(nowMs()).toBe(Date.parse("2026-08-25T10:01:30.000Z"));
	});

	it("accepts a negative offset (device clock ahead of the server)", () => {
		vi.useFakeTimers({ now: new Date("2026-08-25T10:00:00.000Z") });
		setClockOffsetMs(-3_600_000);
		expect(nowIso()).toBe("2026-08-25T09:00:00.000Z");
	});
});
```

- [ ] **Step 2 : Vérifier l'échec**

Run: `pnpm test:run src/lib/sync-clock.test.ts`
Attendu : ÉCHEC — module inexistant.

- [ ] **Step 3 : Implémenter**

Créer `src/lib/sync-clock.ts` :

```ts
/**
 * Spec §5.1: LWW rests on client timestamps, so a device set six months in the
 * future would win every conflict forever. The sync engine measures the offset
 * against serverTime and sets it here; every stamp the app produces (repository
 * writes included) reads through this module so the correction applies at the
 * source. Offset 0 — the default, and the permanent state while sync is off —
 * makes this an identity function.
 */
let offsetMs = 0;

export function setClockOffsetMs(ms: number): void {
	offsetMs = ms;
}

export function getClockOffsetMs(): number {
	return offsetMs;
}

export function nowMs(): number {
	return Date.now() + offsetMs;
}

export function nowIso(): string {
	return new Date(nowMs()).toISOString();
}
```

- [ ] **Step 4 : Vérifier le vert**

Run: `pnpm test:run src/lib/sync-clock.test.ts`
Attendu : PASS.

- [ ] **Step 5 : Basculer `SqliteRepository` sur l'horloge**

Dans `src/db/sqlite-repository.ts` : ajouter l'import

```ts
import { nowIso } from "@/lib/sync-clock";
```

puis remplacer **chaque** occurrence de `new Date().toISOString()` par `nowIso()`. Vérifier l'exhaustivité :

```bash
grep -c "new Date().toISOString()" src/db/sqlite-repository.ts   # doit afficher 0
grep -c "nowIso()" src/db/sqlite-repository.ts                    # ≥ 15 (une par méthode d'écriture)
```

Ne PAS toucher aux autres usages de `Date` (formatage d'affichage ailleurs dans l'app) : seul le repository produit des estampilles LWW.

- [ ] **Step 6 : Suite complète**

Run: `pnpm test:run`
Attendu : tout vert — avec offset 0, `nowIso()` est exactement l'ancien code.

- [ ] **Step 7 : Commit**

```bash
git add src/lib/sync-clock.ts src/lib/sync-clock.test.ts src/db/sqlite-repository.ts
git commit -m 'feat: :sparkles: route repository timestamps through an offset-aware clock'
```

---

### Tâche 2 : Migration 012 — `sync_extra` et `sync_quarantine`

Deux besoins du moteur que le schéma 4a ne couvre pas. `sync_extra` (une colonne TEXT par table synchronisée) porte les **champs inconnus préservés verbatim** (§5.4) : un champ ajouté par une version future du client doit survivre à un merge local et repartir au push — leurs stamps vivent déjà dans `field_updated_at`, qui accepte n'importe quelle clé, mais leurs *valeurs* n'ont aucune colonne. `sync_quarantine` persiste les blobs indéchiffrables (décision n° 3).

**Files:**
- Create: `src/db/migrations/012_sync_engine.sql`
- Modify: `src/db/migrations/index.ts`
- Test: `src/db/migrations/sync-engine-schema.test.ts`

**Interfaces:**
- Produces: colonnes `tasks.sync_extra`, `projects.sync_extra`, `tags.sync_extra`, `project_groups.sync_extra` (TEXT NULL, JSON `{ champ: valeur }`) ; table `sync_quarantine (entity_type, entity_id, seq, direction, ciphertext, nonce, reason, quarantined_at)` PK `(entity_type, entity_id)`.

- [ ] **Step 1 : Écrire le test (échec attendu)**

Créer `src/db/migrations/sync-engine-schema.test.ts` :

```ts
// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BetterSqliteDriver } from "@/test-harness/BetterSqliteDriver";
import { ALL_MIGRATIONS } from "./index";
import { runMigrations } from "./run-migrations";

let driver: BetterSqliteDriver;

beforeEach(async () => {
	driver = new BetterSqliteDriver();
	await runMigrations(driver, ALL_MIGRATIONS);
});
afterEach(() => driver?.close());

describe("migration 012 (sync engine schema)", () => {
	it.each(["tasks", "projects", "tags", "project_groups"])(
		"adds sync_extra to %s",
		async (table) => {
			const cols = await driver.select<{ name: string }>(
				`PRAGMA table_info(${table})`,
			);
			expect(cols.map((c) => c.name)).toContain("sync_extra");
		},
	);

	it("creates sync_quarantine keyed by entity", async () => {
		await driver.execute(
			`INSERT INTO sync_quarantine
			 (entity_type, entity_id, seq, direction, ciphertext, nonce, reason, quarantined_at)
			 VALUES ('task', 't1', 42, 'pull', 'YWJj', 'bm9uY2U=', 'decrypt-failed', '2026-08-25T10:00:00.000Z')`,
		);
		// Same entity again: the fresher failure replaces the stale one.
		await driver.execute(
			`INSERT OR REPLACE INTO sync_quarantine
			 (entity_type, entity_id, seq, direction, ciphertext, nonce, reason, quarantined_at)
			 VALUES ('task', 't1', 43, 'pull', 'ZGVm', 'bm9uY2U=', 'decrypt-failed', '2026-08-25T11:00:00.000Z')`,
		);
		const rows = await driver.select<{ seq: number; reason: string }>(
			"SELECT seq, reason FROM sync_quarantine",
		);
		expect(rows).toEqual([{ seq: 43, reason: "decrypt-failed" }]);
	});

	it("rejects a direction outside pull/push", async () => {
		await expect(
			driver.execute(
				`INSERT INTO sync_quarantine
				 (entity_type, entity_id, direction, reason, quarantined_at)
				 VALUES ('task', 't2', 'sideways', 'x', '2026-08-25T10:00:00.000Z')`,
			),
		).rejects.toThrow(/CHECK/);
	});

	it("does not drop the outbox triggers (rebuild trap, spec §9.6)", async () => {
		const triggers = await driver.select<{ name: string }>(
			"SELECT name FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'trg_%_outbox_%'",
		);
		expect(triggers.length).toBe(12);
	});
});
```

- [ ] **Step 2 : Vérifier l'échec**

Run: `pnpm test:run src/db/migrations/sync-engine-schema.test.ts`
Attendu : ÉCHEC — `sync_extra` absent, `sync_quarantine` inexistante. Le test des 12 triggers passe déjà (état 4a) : il est là pour hurler si la 012 était un jour réécrite en reconstruction de table.

- [ ] **Step 3 : Écrire la migration**

Créer `src/db/migrations/012_sync_engine.sql` :

```sql
-- Plan 4c. ADD COLUMN only: rebuilding a synced table would drop its outbox
-- triggers and every sync column added since (trap documented in 009).

-- Unknown-field preservation (spec §5.4). A newer client may sync fields this
-- version does not know; their values are carried here verbatim as a JSON
-- object and re-emitted on push. Their per-field stamps need no new home:
-- field_updated_at is a JSON map keyed by field name and accepts any key.
ALTER TABLE tasks          ADD COLUMN sync_extra TEXT;
ALTER TABLE projects       ADD COLUMN sync_extra TEXT;
ALTER TABLE tags           ADD COLUMN sync_extra TEXT;
ALTER TABLE project_groups ADD COLUMN sync_extra TEXT;

-- Quarantine (spec §7): an undecryptable blob must never block the loop, and
-- the pull cursor moves past it, so the server will not serve it again until
-- it changes. Dropping it would be a silent, permanent divergence between
-- devices — the blob is kept for a later retry instead. direction 'push'
-- parks a local record whose plaintext exceeds the server's ciphertext bound
-- (batch validation rejects the WHOLE batch, so one oversized record would
-- otherwise wedge the outbox forever).
CREATE TABLE IF NOT EXISTS sync_quarantine (
  entity_type    TEXT NOT NULL,
  entity_id      TEXT NOT NULL,
  seq            INTEGER,
  direction      TEXT NOT NULL CHECK (direction IN ('pull', 'push')),
  ciphertext     TEXT,
  nonce          TEXT,
  reason         TEXT NOT NULL,
  quarantined_at TEXT NOT NULL,
  PRIMARY KEY (entity_type, entity_id)
);
```

Dans `src/db/migrations/index.ts`, ajouter l'import et l'entrée (append only) :

```ts
import m012 from "./012_sync_engine.sql?raw";
```

et `m012,` en fin de `ALL_MIGRATIONS`.

- [ ] **Step 4 : Vérifier le vert, et le rejeu héritée**

Run: `pnpm test:run src/db/migrations/`
Attendu : tout vert, y compris les tests de migration existants (le rejeu depuis `user_version` antérieur passe : ADD COLUMN sur colonnes neuves, aucune collision `duplicate column name`).

- [ ] **Step 5 : Commit**

```bash
git add src/db/migrations/012_sync_engine.sql src/db/migrations/index.ts src/db/migrations/sync-engine-schema.test.ts
git commit -m 'feat: :card_file_box: add sync_extra columns and the sync_quarantine table'
```

---

### Tâche 3 : Types protocole, scission de blob, état de sync, chiffreur réel

Le socle sans réseau : les types partagés (voir « Types partagés » en tête de plan — les copier tels quels), la scission `nonce ‖ ciphertext` imposée par l'écart entre le format Rust (un blob) et le contrat serveur (deux champs), et l'accès typé à `sync_state`.

**Files:**
- Create: `src/sync/types.ts`, `src/sync/blob.ts`, `src/sync/state.ts`, `src/sync/cipher.ts`
- Test: `src/sync/blob.test.ts`, `src/sync/state.test.ts`

**Interfaces:**
- Consumes: `DbDriver` (`@/db/driver`), `FieldStamps` (`@/db/field-timestamps`), `encryptRecord`/`decryptRecord` (`@/crypto`).
- Produces:
  - tout le bloc « Types partagés » du plan, exporté par `src/sync/types.ts` ;
  - `bytesToBase64(bytes: Uint8Array): string`, `base64ToBytes(b64: string): Uint8Array`, `splitRecordBlob(blob: string): { nonce: string; ciphertext: string }`, `joinRecordBlob(nonce: string, ciphertext: string): string`, `RECORD_NONCE_BYTES = 24` ;
  - `type SyncStateKey`, `getSyncState(db, key): Promise<string | null>`, `setSyncState(db, key, value): Promise<void>`, `deleteSyncState(db, key): Promise<void>` — utilisables sur un `tx` puisque `DbDriver` est l'interface commune ;
  - `TauriRecordCipher implements RecordCipher`.

- [ ] **Step 1 : Écrire les tests (échec attendu)**

Créer `src/sync/blob.test.ts` :

```ts
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
		const blob = blobOf(0x42, Array.from({ length: 33 }, (_, i) => i));
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
```

Créer `src/sync/state.test.ts` :

```ts
// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ALL_MIGRATIONS } from "@/db/migrations";
import { runMigrations } from "@/db/migrations/run-migrations";
import { BetterSqliteDriver } from "@/test-harness/BetterSqliteDriver";
import { deleteSyncState, getSyncState, setSyncState } from "./state";

let driver: BetterSqliteDriver;

beforeEach(async () => {
	driver = new BetterSqliteDriver();
	await runMigrations(driver, ALL_MIGRATIONS);
});
afterEach(() => driver?.close());

describe("sync_state accessors", () => {
	it("reads null for an unset key", async () => {
		expect(await getSyncState(driver, "cursor")).toBeNull();
	});

	it("writes, overwrites and deletes a key", async () => {
		await setSyncState(driver, "cursor", "17");
		expect(await getSyncState(driver, "cursor")).toBe("17");
		await setSyncState(driver, "cursor", "42");
		expect(await getSyncState(driver, "cursor")).toBe("42");
		await deleteSyncState(driver, "cursor");
		expect(await getSyncState(driver, "cursor")).toBeNull();
	});

	it("works inside a DbDriver transaction (the outbox-drain requirement)", async () => {
		await driver.transaction(async (tx) => {
			await setSyncState(tx, "cursor", "7");
		});
		expect(await getSyncState(driver, "cursor")).toBe("7");
	});

	it("does not collide with the device_id key", async () => {
		await driver.execute(
			"INSERT INTO sync_state (key, value) VALUES ('device_id', 'dev-1')",
		);
		await setSyncState(driver, "cursor", "3");
		const rows = await driver.select<{ key: string }>(
			"SELECT key FROM sync_state ORDER BY key",
		);
		expect(rows.map((r) => r.key)).toEqual(["cursor", "device_id"]);
	});
});
```

- [ ] **Step 2 : Vérifier l'échec**

Run: `pnpm test:run src/sync/`
Attendu : ÉCHEC — modules inexistants.

- [ ] **Step 3 : Implémenter**

Créer `src/sync/types.ts` avec **exactement** le contenu du bloc « Types partagés » en tête de plan (imports : `import type { FieldStamps } from "@/db/field-timestamps";`). `SYNC_ENTITY_TYPES = ["task", "project", "tag", "project_group"] as const` et `ENTITY_TABLE = { task: "tasks", project: "projects", tag: "tags", project_group: "project_groups" } as const`.

Créer `src/sync/blob.ts` :

```ts
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
```

Créer `src/sync/state.ts` :

```ts
import type { DbDriver } from "@/db/driver";

/**
 * Key/value rows in sync_state (migration 009). device_id is owned by
 * db/device-id.ts and deliberately absent from this union: the engine reads it
 * through getOrCreateDeviceId, never raw.
 */
export type SyncStateKey =
	| "server_url"
	| "cursor"
	| "clock_offset_ms"
	| "refresh_token"
	| "user_id"
	| "account_email"
	| "first_sync_resolved"
	| "last_sync_at";

export async function getSyncState(
	db: DbDriver,
	key: SyncStateKey,
): Promise<string | null> {
	const rows = await db.select<{ value: string }>(
		"SELECT value FROM sync_state WHERE key = ?",
		[key],
	);
	return rows[0]?.value ?? null;
}

export async function setSyncState(
	db: DbDriver,
	key: SyncStateKey,
	value: string,
): Promise<void> {
	await db.execute(
		"INSERT OR REPLACE INTO sync_state (key, value) VALUES (?, ?)",
		[key, value],
	);
}

export async function deleteSyncState(
	db: DbDriver,
	key: SyncStateKey,
): Promise<void> {
	await db.execute("DELETE FROM sync_state WHERE key = ?", [key]);
}
```

Créer `src/sync/cipher.ts` :

```ts
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
		return splitRecordBlob(await encryptRecord(entityType, entityId, plaintext));
	}

	async decrypt(
		entityType: SyncEntityType,
		entityId: string,
		ciphertext: string,
		nonce: string,
	): Promise<string> {
		return decryptRecord(entityType, entityId, joinRecordBlob(nonce, ciphertext));
	}
}
```

- [ ] **Step 4 : Vérifier le vert**

Run: `pnpm test:run src/sync/`
Attendu : PASS.

- [ ] **Step 5 : Commit**

```bash
git add src/sync/types.ts src/sync/blob.ts src/sync/blob.test.ts src/sync/state.ts src/sync/state.test.ts src/sync/cipher.ts
git commit -m 'feat: :sparkles: add sync protocol types, blob split and sync_state accessors'
```

---

### Tâche 4 : Couche HTTP — plugin, capability, `requestJson`

Tout le réseau du moteur passe par une seule fonction, avec `fetch` injectable : le vrai vient de `@tauri-apps/plugin-http` (IPC vers Rust, non soumis à la CSP webview — **ne pas toucher** `tauri.conf.json`), les tests injectent un espion.

**Files:**
- Modify: `package.json` (dépendance `@tauri-apps/plugin-http`), `src-tauri/capabilities/desktop.json` (scope d'URL)
- Create: `src/sync/http.ts`
- Test: `src/sync/http.test.ts`

**Interfaces:**
- Produces: `type FetchLike = typeof fetch` ; `class SyncHttpError extends Error { status: number; code: string | null; retryAfterMs: number | null }` ; `requestJson<T>(fetchImpl: FetchLike, method: "GET" | "POST" | "PUT" | "DELETE", url: string, opts?: { body?: unknown; accessToken?: string }): Promise<T>`.

- [ ] **Step 1 : Dépendance et capability**

```bash
pnpm add @tauri-apps/plugin-http
```

Dans `src-tauri/capabilities/desktop.json`, remplacer le bloc `http:default` par :

```json
{
	"identifier": "http:default",
	"allow": [
		{ "url": "https://github.com/**" },
		{ "url": "https://objects.githubusercontent.com/**" },
		{ "url": "https://*.githubusercontent.com/**" },
		{ "url": "https://**" },
		{ "url": "http://localhost:*/**" },
		{ "url": "http://127.0.0.1:*/**" },
		{ "url": "http://*.local:*/**" }
	]
}
```

Pourquoi si large : le serveur de sync est **auto-hébergé à une URL choisie par l'utilisateur** (spec §6) — un scope statique ne peut pas l'énumérer. `https://**` couvre tout serveur TLS ; les trois formes `http://` sont les exceptions exactes que le spec §6.2 impose pour le développement et le réseau local. La validation d'URL côté saisie (https obligatoire hors localhost/.local) reste une responsabilité 4d.

- [ ] **Step 2 : Écrire le test (échec attendu)**

Créer `src/sync/http.test.ts` :

```ts
import { describe, expect, it, vi } from "vitest";
import { requestJson, SyncHttpError } from "./http";

function jsonResponse(status: number, body: unknown, headers?: Record<string, string>) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json", ...headers },
	});
}

describe("requestJson", () => {
	it("sends JSON with the bearer token and parses the response", async () => {
		const fetchSpy = vi.fn(async () => jsonResponse(200, { ok: 1 }));
		const out = await requestJson<{ ok: number }>(
			fetchSpy,
			"POST",
			"https://sync.example/v1/sync/push",
			{ body: { changes: [] }, accessToken: "tok" },
		);
		expect(out).toEqual({ ok: 1 });
		const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
		expect(url).toBe("https://sync.example/v1/sync/push");
		expect(init.method).toBe("POST");
		expect(new Headers(init.headers).get("authorization")).toBe("Bearer tok");
		expect(new Headers(init.headers).get("content-type")).toBe("application/json");
		expect(init.body).toBe(JSON.stringify({ changes: [] }));
	});

	it("returns undefined on 204", async () => {
		const fetchSpy = vi.fn(async () => new Response(null, { status: 204 }));
		await expect(
			requestJson(fetchSpy, "POST", "https://s/v1/auth/logout", { body: {} }),
		).resolves.toBeUndefined();
	});

	it("throws SyncHttpError carrying status and stable code", async () => {
		const fetchSpy = vi.fn(async () =>
			jsonResponse(409, { statusCode: 409, code: "CURSOR_OUT_OF_RANGE", message: "…" }),
		);
		const err = await requestJson(fetchSpy, "GET", "https://s/v1/sync/pull?cursor=9").catch(
			(e: unknown) => e,
		);
		expect(err).toBeInstanceOf(SyncHttpError);
		expect((err as SyncHttpError).status).toBe(409);
		expect((err as SyncHttpError).code).toBe("CURSOR_OUT_OF_RANGE");
	});

	it("parses Retry-After seconds when the server sends it", async () => {
		const fetchSpy = vi.fn(async () =>
			jsonResponse(429, { statusCode: 429 }, { "retry-after": "7" }),
		);
		const err = (await requestJson(fetchSpy, "GET", "https://s/x").catch(
			(e: unknown) => e,
		)) as SyncHttpError;
		expect(err.status).toBe(429);
		expect(err.retryAfterMs).toBe(7_000);
	});

	it("leaves retryAfterMs null when the header is absent or unparseable", async () => {
		const fetchSpy = vi.fn(async () => jsonResponse(429, { statusCode: 429 }));
		const err = (await requestJson(fetchSpy, "GET", "https://s/x").catch(
			(e: unknown) => e,
		)) as SyncHttpError;
		expect(err.retryAfterMs).toBeNull();
	});

	it("survives a non-JSON error body", async () => {
		const fetchSpy = vi.fn(
			async () => new Response("<html>bad gateway</html>", { status: 502 }),
		);
		const err = (await requestJson(fetchSpy, "GET", "https://s/x").catch(
			(e: unknown) => e,
		)) as SyncHttpError;
		expect(err.status).toBe(502);
		expect(err.code).toBeNull();
	});
});
```

- [ ] **Step 3 : Vérifier l'échec**

Run: `pnpm test:run src/sync/http.test.ts`
Attendu : ÉCHEC — module inexistant.

- [ ] **Step 4 : Implémenter**

Créer `src/sync/http.ts` :

```ts
export type FetchLike = typeof fetch;

export class SyncHttpError extends Error {
	constructor(
		public readonly status: number,
		public readonly code: string | null,
		public readonly retryAfterMs: number | null,
		message: string,
	) {
		super(message);
		this.name = "SyncHttpError";
	}
}

/**
 * The one door every engine request goes through. fetch is injected: the real
 * caller passes @tauri-apps/plugin-http's fetch (IPC to Rust, not governed by
 * the webview CSP), tests pass a stub. The server speaks camelCase JSON and
 * NestJS error envelopes; the stable machine-readable part of an error is its
 * `code` field (e.g. CURSOR_OUT_OF_RANGE), the message is for logs only.
 */
export async function requestJson<T>(
	fetchImpl: FetchLike,
	method: "GET" | "POST" | "PUT" | "DELETE",
	url: string,
	opts: { body?: unknown; accessToken?: string } = {},
): Promise<T> {
	const headers: Record<string, string> = {};
	if (opts.body !== undefined) headers["content-type"] = "application/json";
	if (opts.accessToken) headers.authorization = `Bearer ${opts.accessToken}`;

	const res = await fetchImpl(url, {
		method,
		headers,
		body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
	});

	if (!res.ok) {
		let code: string | null = null;
		let message = `HTTP ${res.status} on ${method} ${url}`;
		try {
			const payload = (await res.json()) as { code?: string; message?: unknown };
			if (typeof payload.code === "string") code = payload.code;
			if (payload.message) message += `: ${JSON.stringify(payload.message)}`;
		} catch {
			// Non-JSON error body (proxy page, empty body): status alone must do.
		}
		const retryAfter = res.headers.get("retry-after");
		const seconds = retryAfter ? Number(retryAfter) : Number.NaN;
		throw new SyncHttpError(
			res.status,
			code,
			Number.isFinite(seconds) ? seconds * 1_000 : null,
			message,
		);
	}

	if (res.status === 204) return undefined as T;
	return (await res.json()) as T;
}
```

- [ ] **Step 5 : Vérifier le vert**

Run: `pnpm test:run src/sync/http.test.ts` — Attendu : PASS.
Run: `pnpm lint` — Attendu : propre.

- [ ] **Step 6 : Commit**

```bash
git add package.json pnpm-lock.yaml src-tauri/capabilities/desktop.json src/sync/http.ts src/sync/http.test.ts
git commit -m 'feat: :sparkles: add the sync HTTP layer over tauri-plugin-http'
```

---

### Tâche 5 : Client d'auth — `signIn`, `register`, `AuthorizedHttp`

Le chemin complet du spec §2/§4 côté client : `prelogin` → Argon2id en Rust (`beginUnlock`) → `login` → `GET /v1/keys` → `completeUnlock`. Les appels Rust passent par un port `VaultPort` injectable (vitest n'a pas de runtime Tauri). `AuthorizedHttp` centralise le Bearer : access token en mémoire seulement, refresh sur 401 avec **rotation persistée avant réutilisation**, refresh simultanés fusionnés, échec du refresh → `ReauthRequiredError` (§7 : « reconnexion requise », données locales intactes).

**Files:**
- Create: `src/sync/auth.ts`
- Test: `src/sync/auth.test.ts`

**Interfaces:**
- Consumes: `requestJson`/`SyncHttpError`/`FetchLike` (T4), `getSyncState`/`setSyncState`/`deleteSyncState` (T3), types (T3), `beginUnlock`/`completeUnlock`/`prepareRegistration`/`toRegisterKeys` (`@/crypto`).
- Produces:
  - `interface VaultPort { beginUnlock(password: string, authSalt: string): Promise<string>; completeUnlock(wrappedDek: string, userId: string): Promise<void>; }` et `tauriVault: VaultPort` (implémentation réelle) ;
  - `getServerInfo(fetchImpl: FetchLike, baseUrl: string): Promise<ServerInfo>` ;
  - `signIn(deps: { db: DbDriver; fetchImpl: FetchLike; baseUrl: string; vault: VaultPort }, input: { email: string; password: string; deviceName: string; devicePlatform: string }): Promise<{ accessToken: string }>` — vérifie le protocole (§4.0, `ProtocolMismatchError`), persiste `refresh_token`, `user_id`, `account_email`, `server_url` ;
  - `register(deps, input)` — même forme, via `prepareRegistration` + `POST /v1/auth/register` (`inviteToken` optionnel) ; retourne aussi `recoveryPhrase` (jamais persistée — contrat affiché par 4d) ;
  - `signOut(deps: { db; fetchImpl; baseUrl }): Promise<void>` — `POST /v1/auth/logout` (best effort) puis efface `refresh_token` ;
  - `class AuthorizedHttp { constructor(deps: { db: DbDriver; fetchImpl: FetchLike; baseUrl: string; seedAccessToken?: string }); request<T>(method, path, body?): Promise<T>; }`.

- [ ] **Step 1 : Écrire les tests (échec attendu)**

Créer `src/sync/auth.test.ts` :

```ts
// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ALL_MIGRATIONS } from "@/db/migrations";
import { runMigrations } from "@/db/migrations/run-migrations";
import { BetterSqliteDriver } from "@/test-harness/BetterSqliteDriver";
import { AuthorizedHttp, signIn } from "./auth";
import { getSyncState, setSyncState } from "./state";
import { ProtocolMismatchError, ReauthRequiredError } from "./types";

let driver: BetterSqliteDriver;

beforeEach(async () => {
	driver = new BetterSqliteDriver();
	await runMigrations(driver, ALL_MIGRATIONS);
});
afterEach(() => driver?.close());

const SERVER_INFO = {
	name: "usagi-server",
	version: "1.0.0",
	protocolVersion: 1,
	registrationEnabled: false,
	minClientVersion: "0.1.0",
};

function json(status: number, body: unknown) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json" },
	});
}

/** Routes requests by path suffix; records every call for assertions. */
function fakeServer(routes: Record<string, (init: RequestInit) => Response>) {
	const calls: Array<{ url: string; init: RequestInit }> = [];
	const fetchImpl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
		const u = String(url);
		calls.push({ url: u, init: init ?? {} });
		for (const [suffix, handler] of Object.entries(routes)) {
			if (u.includes(suffix)) return handler(init ?? {});
		}
		return json(404, { statusCode: 404 });
	});
	return { fetchImpl: fetchImpl as unknown as typeof fetch, calls };
}

describe("signIn", () => {
	const vault = {
		beginUnlock: vi.fn(async () => "verifier-from-argon2"),
		completeUnlock: vi.fn(async () => undefined),
	};

	it("runs prelogin → login → keys → completeUnlock and persists the session", async () => {
		const { fetchImpl, calls } = fakeServer({
			"/v1/server-info": () => json(200, SERVER_INFO),
			"/v1/auth/prelogin": () =>
				json(200, { salt: "a".repeat(32), kdfParams: { memoryCost: 65536, timeCost: 3, parallelism: 4 } }),
			"/v1/auth/login": () =>
				json(200, {
					userId: "user-1",
					workspaceId: "ws-1",
					deviceId: "srv-dev-1",
					accessToken: "access-1",
					refreshToken: "refresh-1",
				}),
			"/v1/keys": () =>
				json(200, { wrappedDek: "d", wrappedDekRecovery: "r", publicKey: "p", wrappedPrivateKey: "k" }),
		});

		const out = await signIn(
			{ db: driver, fetchImpl, baseUrl: "https://sync.example", vault },
			{ email: "loan@example.com", password: "pw", deviceName: "Desktop", devicePlatform: "linux" },
		);

		expect(out.accessToken).toBe("access-1");
		expect(vault.beginUnlock).toHaveBeenCalledWith("pw", "a".repeat(32));
		expect(vault.completeUnlock).toHaveBeenCalledWith("d", "user-1");
		expect(await getSyncState(driver, "refresh_token")).toBe("refresh-1");
		expect(await getSyncState(driver, "user_id")).toBe("user-1");
		expect(await getSyncState(driver, "server_url")).toBe("https://sync.example");
		// The login body carries the derived verifier, never the password.
		const loginCall = calls.find((c) => c.url.includes("/v1/auth/login"));
		expect(loginCall?.init.body).not.toContain("pw");
		expect(loginCall?.init.body).toContain("verifier-from-argon2");
	});

	it("refuses to sign in against an incompatible protocol (§4.0)", async () => {
		const { fetchImpl, calls } = fakeServer({
			"/v1/server-info": () => json(200, { ...SERVER_INFO, protocolVersion: 2 }),
		});
		await expect(
			signIn(
				{ db: driver, fetchImpl, baseUrl: "https://sync.example", vault },
				{ email: "e@x.com", password: "pw", deviceName: "D", devicePlatform: "linux" },
			),
		).rejects.toThrow(ProtocolMismatchError);
		// Refusal happens before any credential-bearing request leaves.
		expect(calls.every((c) => c.url.includes("/v1/server-info"))).toBe(true);
	});
});

describe("AuthorizedHttp", () => {
	it("refreshes once on 401, persists the rotated token, retries the request", async () => {
		await setSyncState(driver, "refresh_token", "refresh-old");
		let tokenAccepted = "access-good";
		const { fetchImpl, calls } = fakeServer({
			"/v1/auth/refresh": (init) => {
				expect(init.body).toBe(JSON.stringify({ refreshToken: "refresh-old" }));
				return json(200, { accessToken: "access-good", refreshToken: "refresh-new" });
			},
			"/v1/sync/pull": (init) => {
				const auth = new Headers(init.headers).get("authorization");
				return auth === `Bearer ${tokenAccepted}`
					? json(200, { records: [], nextCursor: 0, hasMore: false, serverTime: "2026-08-25T10:00:00.000Z" })
					: json(401, { statusCode: 401 });
			},
		});

		const http = new AuthorizedHttp({
			db: driver,
			fetchImpl,
			baseUrl: "https://sync.example",
			seedAccessToken: "access-stale",
		});
		const res = await http.request<{ nextCursor: number }>("GET", "/v1/sync/pull?cursor=0");
		expect(res.nextCursor).toBe(0);
		expect(await getSyncState(driver, "refresh_token")).toBe("refresh-new");
		// stale attempt + refresh + retried attempt = 3 calls exactly
		expect(calls).toHaveLength(3);
	});

	it("acquires a token via refresh when it has none (app restart path)", async () => {
		await setSyncState(driver, "refresh_token", "refresh-old");
		const { fetchImpl } = fakeServer({
			"/v1/auth/refresh": () => json(200, { accessToken: "access-1", refreshToken: "refresh-2" }),
			"/v1/sync/pull": (init) =>
				new Headers(init.headers).get("authorization") === "Bearer access-1"
					? json(200, { records: [], nextCursor: 0, hasMore: false, serverTime: "2026-08-25T10:00:00.000Z" })
					: json(401, { statusCode: 401 }),
		});
		const http = new AuthorizedHttp({ db: driver, fetchImpl, baseUrl: "https://s" });
		await expect(http.request("GET", "/v1/sync/pull?cursor=0")).resolves.toBeDefined();
	});

	it("throws ReauthRequiredError when the refresh itself is rejected (§7 revoked device)", async () => {
		await setSyncState(driver, "refresh_token", "refresh-revoked");
		const { fetchImpl } = fakeServer({
			"/v1/auth/refresh": () => json(401, { statusCode: 401 }),
			"/v1/sync/pull": () => json(401, { statusCode: 401 }),
		});
		const http = new AuthorizedHttp({
			db: driver,
			fetchImpl,
			baseUrl: "https://s",
			seedAccessToken: "stale",
		});
		await expect(http.request("GET", "/v1/sync/pull?cursor=0")).rejects.toThrow(
			ReauthRequiredError,
		);
	});

	it("throws ReauthRequiredError when no refresh token is stored", async () => {
		const { fetchImpl } = fakeServer({});
		const http = new AuthorizedHttp({ db: driver, fetchImpl, baseUrl: "https://s" });
		await expect(http.request("GET", "/v1/sync/pull?cursor=0")).rejects.toThrow(
			ReauthRequiredError,
		);
	});

	it("coalesces concurrent refreshes into one (rotation would burn the token)", async () => {
		await setSyncState(driver, "refresh_token", "refresh-old");
		let refreshCalls = 0;
		const { fetchImpl } = fakeServer({
			"/v1/auth/refresh": () => {
				refreshCalls++;
				return json(200, { accessToken: "access-1", refreshToken: "refresh-2" });
			},
			"/v1/sync/": (init) =>
				new Headers(init.headers).get("authorization") === "Bearer access-1"
					? json(200, { ok: 1 })
					: json(401, { statusCode: 401 }),
		});
		const http = new AuthorizedHttp({ db: driver, fetchImpl, baseUrl: "https://s" });
		await Promise.all([
			http.request("GET", "/v1/sync/pull?cursor=0"),
			http.request("GET", "/v1/sync/pull?cursor=0"),
		]);
		// The server rotates the token on every refresh: a second concurrent
		// refresh presenting the same old token would be a 401 and a lockout.
		expect(refreshCalls).toBe(1);
	});
});
```

- [ ] **Step 2 : Vérifier l'échec**

Run: `pnpm test:run src/sync/auth.test.ts`
Attendu : ÉCHEC — module inexistant.

- [ ] **Step 3 : Implémenter**

Créer `src/sync/auth.ts` :

```ts
import {
	beginUnlock,
	completeUnlock,
	prepareRegistration,
	toRegisterKeys,
} from "@/crypto";
import type { DbDriver } from "@/db/driver";
import { requestJson, SyncHttpError, type FetchLike } from "./http";
import { getSyncState, setSyncState, deleteSyncState } from "./state";
import {
	CLIENT_PROTOCOL_VERSION,
	ProtocolMismatchError,
	ReauthRequiredError,
	type ServerInfo,
} from "./types";

/**
 * The Argon2id work happens in Rust and vitest has no Tauri runtime, so the
 * two vault calls the sign-in path needs are injected as a port.
 */
export interface VaultPort {
	beginUnlock(password: string, authSalt: string): Promise<string>;
	completeUnlock(wrappedDek: string, userId: string): Promise<void>;
}

export const tauriVault: VaultPort = { beginUnlock, completeUnlock };

interface AuthDeps {
	db: DbDriver;
	fetchImpl: FetchLike;
	baseUrl: string;
	vault: VaultPort;
}

interface LoginResponse {
	userId: string;
	workspaceId: string;
	deviceId: string;
	accessToken: string;
	refreshToken: string;
}

interface KeysResponse {
	wrappedDek: string;
	wrappedDekRecovery: string;
	publicKey: string;
	wrappedPrivateKey: string;
}

export function getServerInfo(
	fetchImpl: FetchLike,
	baseUrl: string,
): Promise<ServerInfo> {
	return requestJson<ServerInfo>(fetchImpl, "GET", `${baseUrl}/v1/server-info`);
}

async function assertProtocol(fetchImpl: FetchLike, baseUrl: string): Promise<void> {
	const info = await getServerInfo(fetchImpl, baseUrl);
	// Spec §4.0: refuse outright on any mismatch — a half-sync against an
	// outdated self-hosted server is worse than a loud error.
	if (info.protocolVersion !== CLIENT_PROTOCOL_VERSION) {
		throw new ProtocolMismatchError(info);
	}
}

async function persistSession(
	db: DbDriver,
	baseUrl: string,
	email: string,
	login: LoginResponse,
): Promise<void> {
	await setSyncState(db, "refresh_token", login.refreshToken);
	await setSyncState(db, "user_id", login.userId);
	await setSyncState(db, "account_email", email);
	await setSyncState(db, "server_url", baseUrl);
}

export async function signIn(
	deps: AuthDeps,
	input: { email: string; password: string; deviceName: string; devicePlatform: string },
): Promise<{ accessToken: string }> {
	await assertProtocol(deps.fetchImpl, deps.baseUrl);
	const pre = await requestJson<{ salt: string; kdfParams: unknown }>(
		deps.fetchImpl,
		"POST",
		`${deps.baseUrl}/v1/auth/prelogin`,
		{ body: { email: input.email } },
	);
	// kdfParams are returned for forward compatibility; the Rust side pins the
	// current defaults itself. Revisit when the server ever raises them.
	const authVerifier = await deps.vault.beginUnlock(input.password, pre.salt);
	const login = await requestJson<LoginResponse>(
		deps.fetchImpl,
		"POST",
		`${deps.baseUrl}/v1/auth/login`,
		{
			body: {
				email: input.email,
				authVerifier,
				deviceName: input.deviceName,
				devicePlatform: input.devicePlatform,
			},
		},
	);
	const keys = await requestJson<KeysResponse>(
		deps.fetchImpl,
		"GET",
		`${deps.baseUrl}/v1/keys`,
		{ accessToken: login.accessToken },
	);
	await deps.vault.completeUnlock(keys.wrappedDek, login.userId);
	await persistSession(deps.db, deps.baseUrl, input.email, login);
	return { accessToken: login.accessToken };
}

export async function register(
	deps: Omit<AuthDeps, "vault">,
	input: {
		email: string;
		password: string;
		deviceName: string;
		devicePlatform: string;
		inviteToken?: string;
	},
): Promise<{ accessToken: string; recoveryPhrase: string }> {
	await assertProtocol(deps.fetchImpl, deps.baseUrl);
	const material = await prepareRegistration(input.password);
	const login = await requestJson<LoginResponse>(
		deps.fetchImpl,
		"POST",
		`${deps.baseUrl}/v1/auth/register`,
		{
			body: {
				email: input.email,
				authVerifier: material.authVerifier,
				authSalt: material.authSalt,
				keys: toRegisterKeys(material),
				deviceName: input.deviceName,
				devicePlatform: input.devicePlatform,
				...(input.inviteToken ? { inviteToken: input.inviteToken } : {}),
			},
		},
	);
	await persistSession(deps.db, deps.baseUrl, input.email, login);
	// recoveryPhrase is real key material: shown once by the caller (plan 4d),
	// never persisted, never logged.
	return { accessToken: login.accessToken, recoveryPhrase: material.recoveryPhrase };
}

export async function signOut(deps: {
	db: DbDriver;
	fetchImpl: FetchLike;
	baseUrl: string;
}): Promise<void> {
	const refreshToken = await getSyncState(deps.db, "refresh_token");
	if (refreshToken) {
		try {
			await requestJson(deps.fetchImpl, "POST", `${deps.baseUrl}/v1/auth/logout`, {
				body: { refreshToken },
			});
		} catch {
			// Best effort: the local wipe is what signs this device out; the
			// server-side revocation just also closes the session remotely.
		}
	}
	await deleteSyncState(deps.db, "refresh_token");
}

/**
 * Bearer plumbing for every authenticated call. The access token lives only in
 * memory; the refresh token is the persisted credential and the server rotates
 * it on every refresh, so the fresh one is persisted before anything reuses it
 * and concurrent refreshes are coalesced (a second refresh presenting the
 * already-burnt token would 401 and needlessly force a re-login).
 */
export class AuthorizedHttp {
	private accessToken: string | null;
	private refreshing: Promise<string> | null = null;

	constructor(
		private readonly deps: {
			db: DbDriver;
			fetchImpl: FetchLike;
			baseUrl: string;
			seedAccessToken?: string;
		},
	) {
		this.accessToken = deps.seedAccessToken ?? null;
	}

	async request<T>(
		method: "GET" | "POST" | "PUT" | "DELETE",
		path: string,
		body?: unknown,
	): Promise<T> {
		const token = this.accessToken ?? (await this.refresh());
		try {
			return await requestJson<T>(
				this.deps.fetchImpl,
				method,
				this.deps.baseUrl + path,
				{ body, accessToken: token },
			);
		} catch (err) {
			if (err instanceof SyncHttpError && err.status === 401) {
				const fresh = await this.refresh();
				return requestJson<T>(this.deps.fetchImpl, method, this.deps.baseUrl + path, {
					body,
					accessToken: fresh,
				});
			}
			throw err;
		}
	}

	private refresh(): Promise<string> {
		this.refreshing ??= this.doRefresh().finally(() => {
			this.refreshing = null;
		});
		return this.refreshing;
	}

	private async doRefresh(): Promise<string> {
		const stored = await getSyncState(this.deps.db, "refresh_token");
		if (!stored) throw new ReauthRequiredError("no refresh token stored");
		let res: { accessToken: string; refreshToken: string };
		try {
			res = await requestJson(
				this.deps.fetchImpl,
				"POST",
				`${this.deps.baseUrl}/v1/auth/refresh`,
				{ body: { refreshToken: stored } },
			);
		} catch (err) {
			if (err instanceof SyncHttpError && err.status === 401) {
				throw new ReauthRequiredError("refresh token rejected");
			}
			throw err;
		}
		await setSyncState(this.deps.db, "refresh_token", res.refreshToken);
		this.accessToken = res.accessToken;
		return res.accessToken;
	}
}
```

- [ ] **Step 4 : Vérifier le vert**

Run: `pnpm test:run src/sync/auth.test.ts` — Attendu : PASS.

- [ ] **Step 5 : Commit**

```bash
git add src/sync/auth.ts src/sync/auth.test.ts
git commit -m 'feat: :sparkles: add the headless auth client with rotating refresh tokens'
```

- [ ] **Step 6 : [SABOTAGE] Prouver la persistance de la rotation**

Dans `src/sync/auth.ts`, méthode `doRefresh`, supprimer la ligne `await setSyncState(this.deps.db, "refresh_token", res.refreshToken);`.

```bash
git diff --stat -- src/sync/auth.ts                                # doit lister le fichier
grep -c 'setSyncState(this.deps.db, "refresh_token"' src/sync/auth.ts   # doit afficher 0 (avant sabotage : 1)
pnpm test:run src/sync/auth.test.ts   # 'refreshes once on 401, persists the rotated token…' DOIT échouer (refresh-old encore stocké)
git checkout -- src/sync/auth.ts
pnpm test:run src/sync/auth.test.ts   # tout DOIT repasser
```

---

### Tâche 6 : `RequestGate` — pacing proactif et backoff 429

Décision n° 2. Un token bucket **18 / 60 s** espace les rafales (une première sync de 30 pages ne percute jamais le throttler serveur à 20/min), et le backoff exponentiel absorbe les 429 restants (autre client sur la même IP, fenêtre déjà entamée). Horloge et sommeil injectés : tout se teste en fake timers.

**Files:**
- Create: `src/sync/backoff.ts`
- Test: `src/sync/backoff.test.ts`

**Interfaces:**
- Produces: `class RequestGate { constructor(opts?: { capacity?: number; windowMs?: number; now?: () => number; sleep?: (ms: number) => Promise<void> }); beforeRequest(): Promise<void>; on429(retryAfterMs: number | null): Promise<void>; onSuccess(): void; }` ; constantes `GATE_CAPACITY = 18`, `GATE_WINDOW_MS = 60_000`, `BACKOFF_BASE_MS = 5_000`, `BACKOFF_CAP_MS = 60_000`.

- [ ] **Step 1 : Écrire le test (échec attendu)**

Créer `src/sync/backoff.test.ts` :

```ts
import { describe, expect, it } from "vitest";
import {
	BACKOFF_BASE_MS,
	BACKOFF_CAP_MS,
	GATE_CAPACITY,
	RequestGate,
} from "./backoff";

/** Deterministic clock + sleep log: no real timers anywhere. */
function harness() {
	let now = 0;
	const sleeps: number[] = [];
	const gate = new RequestGate({
		now: () => now,
		sleep: async (ms) => {
			sleeps.push(ms);
			now += ms;
		},
	});
	return { gate, sleeps, advance: (ms: number) => (now += ms) };
}

describe("RequestGate pacing (token bucket 18/min)", () => {
	it("lets a burst of 18 through without waiting", async () => {
		const { gate, sleeps } = harness();
		for (let i = 0; i < GATE_CAPACITY; i++) await gate.beforeRequest();
		expect(sleeps).toEqual([]);
	});

	it("makes the 19th request wait for a refill", async () => {
		const { gate, sleeps } = harness();
		for (let i = 0; i < GATE_CAPACITY; i++) await gate.beforeRequest();
		await gate.beforeRequest();
		expect(sleeps.length).toBeGreaterThan(0);
		expect(sleeps.reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
	});

	it("refills with time: after a full window the burst is available again", async () => {
		const { gate, sleeps, advance } = harness();
		for (let i = 0; i < GATE_CAPACITY; i++) await gate.beforeRequest();
		advance(60_000);
		for (let i = 0; i < GATE_CAPACITY; i++) await gate.beforeRequest();
		expect(sleeps).toEqual([]);
	});
});

describe("RequestGate backoff on 429", () => {
	it("sleeps 5, 10, 20, 40 then caps at 60 seconds", async () => {
		const { gate, sleeps } = harness();
		await gate.on429(null);
		await gate.on429(null);
		await gate.on429(null);
		await gate.on429(null);
		await gate.on429(null);
		await gate.on429(null);
		expect(sleeps).toEqual([5_000, 10_000, 20_000, 40_000, 60_000, 60_000]);
		expect(BACKOFF_BASE_MS).toBe(5_000);
		expect(BACKOFF_CAP_MS).toBe(60_000);
	});

	it("honors Retry-After when the server provides it", async () => {
		const { gate, sleeps } = harness();
		await gate.on429(7_000);
		expect(sleeps).toEqual([7_000]);
	});

	it("resets the ladder after a success", async () => {
		const { gate, sleeps } = harness();
		await gate.on429(null);
		gate.onSuccess();
		await gate.on429(null);
		expect(sleeps).toEqual([5_000, 5_000]);
	});
});
```

- [ ] **Step 2 : Vérifier l'échec**

Run: `pnpm test:run src/sync/backoff.test.ts`
Attendu : ÉCHEC — module inexistant.

- [ ] **Step 3 : Implémenter**

Créer `src/sync/backoff.ts` :

```ts
/**
 * Décision plan 4c n°2. The server throttles every /v1 route at 20 req/min/IP
 * (Retry-After not guaranteed). Proactive pacing: a client-side token bucket
 * of 18/min — under the server budget, so a long first sync pages through
 * without ever drawing a 429. Reactive backoff: 5→10→20→40s capped at 60s for
 * the 429s pacing cannot prevent (another client on the same IP, a window
 * already spent). The cursor and outbox survive any wait by construction.
 */
export const GATE_CAPACITY = 18;
export const GATE_WINDOW_MS = 60_000;
export const BACKOFF_BASE_MS = 5_000;
export const BACKOFF_CAP_MS = 60_000;

const REFILL_INTERVAL_MS = GATE_WINDOW_MS / GATE_CAPACITY;

function defaultSleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

export class RequestGate {
	private readonly capacity: number;
	private readonly refillMs: number;
	private readonly now: () => number;
	private readonly sleep: (ms: number) => Promise<void>;
	private tokens: number;
	private lastRefill: number;
	private consecutive429 = 0;

	constructor(opts?: {
		capacity?: number;
		windowMs?: number;
		now?: () => number;
		sleep?: (ms: number) => Promise<void>;
	}) {
		this.capacity = opts?.capacity ?? GATE_CAPACITY;
		this.refillMs = (opts?.windowMs ?? GATE_WINDOW_MS) / this.capacity;
		this.now = opts?.now ?? Date.now;
		this.sleep = opts?.sleep ?? defaultSleep;
		this.tokens = this.capacity;
		this.lastRefill = this.now();
	}

	private refill(): void {
		const elapsed = this.now() - this.lastRefill;
		const refilled = Math.floor(elapsed / this.refillMs);
		if (refilled > 0) {
			this.tokens = Math.min(this.capacity, this.tokens + refilled);
			this.lastRefill += refilled * this.refillMs;
		}
	}

	async beforeRequest(): Promise<void> {
		this.refill();
		while (this.tokens < 1) {
			const wait = this.refillMs - (this.now() - this.lastRefill);
			await this.sleep(Math.max(1, wait));
			this.refill();
		}
		this.tokens -= 1;
	}

	async on429(retryAfterMs: number | null): Promise<void> {
		this.consecutive429 += 1;
		const ladder = Math.min(
			BACKOFF_CAP_MS,
			BACKOFF_BASE_MS * 2 ** (this.consecutive429 - 1),
		);
		await this.sleep(retryAfterMs ?? ladder);
	}

	onSuccess(): void {
		this.consecutive429 = 0;
	}
}
```

- [ ] **Step 4 : Vérifier le vert**

Run: `pnpm test:run src/sync/backoff.test.ts` — Attendu : PASS.

- [ ] **Step 5 : Commit**

```bash
git add src/sync/backoff.ts src/sync/backoff.test.ts
git commit -m 'feat: :sparkles: add request pacing and 429 backoff for the sync routes'
```

---

### Tâche 7 : `HttpSyncTransport` — push/pull HTTP avec 429 et 409

L'implémentation réelle du port `SyncTransport` : chaque appel passe par le gate, boucle sur 429 (sans limite de tentatives — note 4b : « le curseur survit ; le client reprend après backoff »), et traduit le 409 `CURSOR_OUT_OF_RANGE` en erreur typée que le moteur convertira en reset de curseur.

**Files:**
- Create: `src/sync/transport.ts`
- Test: `src/sync/transport.test.ts`

**Interfaces:**
- Consumes: `AuthorizedHttp` (T5), `RequestGate` (T6), `SyncHttpError` (T4), types (T3).
- Produces: `class HttpSyncTransport implements SyncTransport { constructor(http: AuthorizedHttp, gate: RequestGate); push(changes): Promise<PushResponse>; pull(cursor, limit): Promise<PullResponse>; }`.

- [ ] **Step 1 : Écrire le test (échec attendu)**

Créer `src/sync/transport.test.ts` :

```ts
import { describe, expect, it, vi } from "vitest";
import type { AuthorizedHttp } from "./auth";
import { RequestGate } from "./backoff";
import { SyncHttpError } from "./http";
import { HttpSyncTransport } from "./transport";
import { CursorOutOfRangeError, type PullResponse } from "./types";

const PULL_OK: PullResponse = {
	records: [],
	nextCursor: 3,
	hasMore: false,
	serverTime: "2026-08-25T10:00:00.000Z",
};

function instantGate(sleeps: number[] = []) {
	let now = 0;
	return new RequestGate({
		now: () => now,
		sleep: async (ms) => {
			sleeps.push(ms);
			now += ms;
		},
	});
}

function httpStub(fn: (method: string, path: string, body?: unknown) => Promise<unknown>) {
	return { request: vi.fn(fn) } as unknown as AuthorizedHttp & { request: ReturnType<typeof vi.fn> };
}

describe("HttpSyncTransport", () => {
	it("pulls through GET /v1/sync/pull with cursor and limit", async () => {
		const http = httpStub(async () => PULL_OK);
		const transport = new HttpSyncTransport(http, instantGate());
		const res = await transport.pull(7, 500);
		expect(res).toEqual(PULL_OK);
		expect(http.request).toHaveBeenCalledWith("GET", "/v1/sync/pull?cursor=7&limit=500");
	});

	it("pushes through POST /v1/sync/push", async () => {
		const http = httpStub(async () => ({ applied: [], serverTime: "2026-08-25T10:00:00.000Z" }));
		const transport = new HttpSyncTransport(http, instantGate());
		const changes = [{ entityType: "task" as const, id: "t1", purged: true }];
		await transport.push(changes);
		expect(http.request).toHaveBeenCalledWith("POST", "/v1/sync/push", { changes });
	});

	it("retries after 429 with backoff and eventually succeeds", async () => {
		const sleeps: number[] = [];
		let calls = 0;
		const http = httpStub(async () => {
			calls++;
			if (calls <= 2) throw new SyncHttpError(429, null, null, "throttled");
			return PULL_OK;
		});
		const transport = new HttpSyncTransport(http, instantGate(sleeps));
		const res = await transport.pull(0, 500);
		expect(res.nextCursor).toBe(3);
		expect(calls).toBe(3);
		expect(sleeps).toEqual([5_000, 10_000]); // exponential ladder, then success resets it
	});

	it("honors Retry-After over the ladder", async () => {
		const sleeps: number[] = [];
		let calls = 0;
		const http = httpStub(async () => {
			calls++;
			if (calls === 1) throw new SyncHttpError(429, null, 12_000, "throttled");
			return PULL_OK;
		});
		const transport = new HttpSyncTransport(http, instantGate(sleeps));
		await transport.pull(0, 500);
		expect(sleeps).toEqual([12_000]);
	});

	it("maps 409 CURSOR_OUT_OF_RANGE to its typed error", async () => {
		const http = httpStub(async () => {
			throw new SyncHttpError(409, "CURSOR_OUT_OF_RANGE", null, "cursor is beyond");
		});
		const transport = new HttpSyncTransport(http, instantGate());
		await expect(transport.pull(99, 500)).rejects.toThrow(CursorOutOfRangeError);
	});

	it("lets any other error escape untouched (offline, 500, reauth)", async () => {
		const boom = new SyncHttpError(500, null, null, "server exploded");
		const http = httpStub(async () => {
			throw boom;
		});
		const transport = new HttpSyncTransport(http, instantGate());
		await expect(transport.pull(0, 500)).rejects.toBe(boom);
	});
});
```

- [ ] **Step 2 : Vérifier l'échec**

Run: `pnpm test:run src/sync/transport.test.ts`
Attendu : ÉCHEC — module inexistant.

- [ ] **Step 3 : Implémenter**

Créer `src/sync/transport.ts` :

```ts
import type { AuthorizedHttp } from "./auth";
import type { RequestGate } from "./backoff";
import { SyncHttpError } from "./http";
import {
	CursorOutOfRangeError,
	type PullResponse,
	type PushChange,
	type PushResponse,
	type SyncTransport,
} from "./types";

export class HttpSyncTransport implements SyncTransport {
	constructor(
		private readonly http: AuthorizedHttp,
		private readonly gate: RequestGate,
	) {}

	/**
	 * 429 loops forever on purpose (note 4b): the server throttles by the
	 * minute and both cursor and outbox survive any wait, so giving up would
	 * only trade a pause for a resync later. Everything else escapes to the
	 * engine, which knows what each error means for the sync cycle.
	 */
	private async withGate<T>(run: () => Promise<T>): Promise<T> {
		for (;;) {
			await this.gate.beforeRequest();
			try {
				const out = await run();
				this.gate.onSuccess();
				return out;
			} catch (err) {
				if (err instanceof SyncHttpError && err.status === 429) {
					await this.gate.on429(err.retryAfterMs);
					continue;
				}
				throw err;
			}
		}
	}

	push(changes: PushChange[]): Promise<PushResponse> {
		return this.withGate(() =>
			this.http.request<PushResponse>("POST", "/v1/sync/push", { changes }),
		);
	}

	pull(cursor: number, limit: number): Promise<PullResponse> {
		return this.withGate(async () => {
			try {
				return await this.http.request<PullResponse>(
					"GET",
					`/v1/sync/pull?cursor=${cursor}&limit=${limit}`,
				);
			} catch (err) {
				if (
					err instanceof SyncHttpError &&
					err.status === 409 &&
					err.code === "CURSOR_OUT_OF_RANGE"
				) {
					// Stable contract from plan 4b: this cursor cannot have come
					// from this workspace. The engine resets to 0 and re-pulls.
					throw new CursorOutOfRangeError(err.message);
				}
				throw err;
			}
		});
	}
}
```

- [ ] **Step 4 : Vérifier le vert**

Run: `pnpm test:run src/sync/transport.test.ts` — Attendu : PASS.

- [ ] **Step 5 : Commit**

```bash
git add src/sync/transport.ts src/sync/transport.test.ts
git commit -m 'feat: :sparkles: add the HTTP sync transport with 429 backoff and 409 mapping'
```

- [ ] **Step 6 : [SABOTAGE] Prouver le test du backoff 429**

Dans `src/sync/transport.ts`, dans `withGate`, remplacer le bloc `if (err instanceof SyncHttpError && err.status === 429) { … continue; }` par `throw err;` (supprimer la branche 429 entière).

```bash
git diff --stat -- src/sync/transport.ts        # doit lister le fichier
grep -c 'on429' src/sync/transport.ts           # doit afficher 0 (avant sabotage : 1)
pnpm test:run src/sync/transport.test.ts        # 'retries after 429…' et 'honors Retry-After…' DOIVENT échouer
git checkout -- src/sync/transport.ts
pnpm test:run src/sync/transport.test.ts        # tout DOIT repasser
```

---

### Tâche 8 : `payload.ts` — ligne SQL ⇄ payload chiffrable

Conversion pure entre l'état local (colonnes + `task_tags` + `field_updated_at` + `sync_extra`) et le payload clair du spec §2.2 (`_v`, champs, `_fields`). Deux règles non évidentes :

- **Champs inconnus préservés verbatim (§5.4)** : toute clé du payload distant absente de `SYNC_FIELDS` (et non réservée) va dans `sync_extra` et **repart au push**. Ses stamps vivent déjà dans `_fields`/`field_updated_at`.
- **`_unlinkedTags`** : le champ `tags` d'une tâche se matérialise dans `task_tags`, mais un id de tag non présent localement (tag quarantiné, ou pas encore arrivé dans le cycle) ne peut pas s'y matérialiser. Il est stocké sous la clé réservée `_unlinkedTags` de `sync_extra`, réintégré dans le champ `tags` au push (aucune perte), et re-tenté à chaque fin de cycle de pull (tâche 11). Les clés préfixées `_` ne sont jamais émises comme champs de payload.

**Files:**
- Create: `src/sync/payload.ts`
- Test: `src/sync/payload.test.ts`

**Interfaces:**
- Consumes: types (T3), `FieldStamps` (`@/db/field-timestamps`), `DbDriver`.
- Produces:
  - `SYNC_FIELDS: Record<SyncEntityType, readonly string[]>` — **exactement** : task `["title","description","project_id","priority","due_date","tags","sort_key","completed_at","deleted_at"]` ; project `["name","color","icon","group_id","sort_key","deleted_at"]` ; tag `["name","color","project_id","deleted_at"]` ; project_group `["name","color","sort_key"]` (mêmes listes que `IMPORT_STAMPED_FIELDS` de 4a, moins `purged_at` qui transite en tombstone, plus `tags` embarqué §1.5) ;
  - `UNLINKED_TAGS_KEY = "_unlinkedTags"` ;
  - `interface EntitySnapshot { columns: Record<string, unknown>; tagIds: string[] }` ;
  - `interface EntityWrite { columns: Record<string, unknown>; tagIds: string[]; stamps: string; extra: string | null }` ;
  - `loadSnapshot(db: DbDriver, entityType: SyncEntityType, id: string): Promise<EntitySnapshot | null>` ;
  - `snapshotToPayload(entityType: SyncEntityType, snapshot: EntitySnapshot): SyncPayload` ;
  - `payloadToWrite(entityType: SyncEntityType, payload: SyncPayload, linkableTagIds: ReadonlySet<string>): EntityWrite` ;
  - `serializePayload(payload: SyncPayload): string` et `plaintextByteLength(plaintext: string): number` (TextEncoder).

- [ ] **Step 1 : Écrire le test (échec attendu)**

Créer `src/sync/payload.test.ts` :

```ts
import { describe, expect, it } from "vitest";
import {
	payloadToWrite,
	snapshotToPayload,
	SYNC_FIELDS,
	UNLINKED_TAGS_KEY,
} from "./payload";
import type { SyncPayload } from "./types";

const STAMP = { t: "2026-08-25T10:00:00.000Z", d: "device-a" };

function taskSnapshot(over: Partial<{ columns: Record<string, unknown>; tagIds: string[] }> = {}) {
	return {
		columns: {
			id: "t1",
			title: "Buy bread",
			description: null,
			project_id: "p1",
			priority: "high",
			due_date: null,
			sort_key: "a0",
			completed_at: null,
			deleted_at: null,
			purged_at: null,
			created_at: "2026-08-20T08:00:00.000Z",
			updated_at: "2026-08-25T10:00:00.000Z",
			sort_order: 0,
			field_updated_at: JSON.stringify({ title: STAMP }),
			sync_extra: null,
			...over.columns,
		},
		tagIds: over.tagIds ?? ["tag-1", "tag-2"],
	};
}

describe("snapshotToPayload", () => {
	it("builds the spec §2.2 payload from a task row", () => {
		const payload = snapshotToPayload("task", taskSnapshot());
		expect(payload._v).toBe(1);
		expect(payload.created_at).toBe("2026-08-20T08:00:00.000Z");
		expect(payload.title).toBe("Buy bread");
		expect(payload.tags).toEqual(["tag-1", "tag-2"]);
		expect(payload._fields).toEqual({ title: STAMP });
		// Operational columns never enter the encrypted payload.
		expect(payload).not.toHaveProperty("updated_at");
		expect(payload).not.toHaveProperty("sort_order");
		expect(payload).not.toHaveProperty("purged_at");
		expect(payload).not.toHaveProperty("id");
	});

	it("re-emits unknown fields and folds _unlinkedTags back into tags (§5.4)", () => {
		const payload = snapshotToPayload(
			"task",
			taskSnapshot({
				columns: {
					sync_extra: JSON.stringify({
						recurrence: { every: "week" },
						[UNLINKED_TAGS_KEY]: ["tag-ghost"],
					}),
				},
			}),
		);
		expect(payload.recurrence).toEqual({ every: "week" });
		expect(payload.tags).toEqual(["tag-1", "tag-2", "tag-ghost"]);
		expect(payload).not.toHaveProperty(UNLINKED_TAGS_KEY);
	});

	it("tolerates corrupt stamp and extra JSON instead of crashing the loop", () => {
		const payload = snapshotToPayload(
			"task",
			taskSnapshot({ columns: { field_updated_at: "{oops", sync_extra: "{oops" } }),
		);
		expect(payload._fields).toEqual({});
	});
});

describe("payloadToWrite", () => {
	function remotePayload(): SyncPayload {
		return {
			_v: 1,
			created_at: "2026-08-20T08:00:00.000Z",
			_fields: { title: STAMP, tags: STAMP, recurrence: STAMP },
			title: "Buy bread",
			description: null,
			project_id: null,
			priority: "none",
			due_date: null,
			sort_key: "a1",
			completed_at: null,
			deleted_at: null,
			tags: ["tag-1", "tag-ghost"],
			recurrence: { every: "week" },
		};
	}

	it("splits known columns, linkable tags and unknown extras", () => {
		const write = payloadToWrite("task", remotePayload(), new Set(["tag-1"]));
		expect(write.columns.title).toBe("Buy bread");
		expect(write.columns.created_at).toBe("2026-08-20T08:00:00.000Z");
		expect(write.columns).not.toHaveProperty("tags");
		expect(write.tagIds).toEqual(["tag-1"]);
		expect(JSON.parse(write.extra ?? "{}")).toEqual({
			recurrence: { every: "week" },
			[UNLINKED_TAGS_KEY]: ["tag-ghost"],
		});
		expect(JSON.parse(write.stamps)).toEqual(remotePayload()._fields);
	});

	it("emits null extra when there is nothing extra", () => {
		const payload = remotePayload();
		payload.tags = ["tag-1"];
		// biome-ignore lint/performance/noDelete: shaping a test fixture
		delete payload.recurrence;
		const write = payloadToWrite("task", payload, new Set(["tag-1"]));
		expect(write.extra).toBeNull();
	});

	it("round-trips: write → snapshot → payload preserves values, stamps and extras", () => {
		const write = payloadToWrite("task", remotePayload(), new Set(["tag-1"]));
		const back = snapshotToPayload("task", {
			columns: {
				...write.columns,
				id: "t1",
				purged_at: null,
				updated_at: "x",
				sort_order: 0,
				field_updated_at: write.stamps,
				sync_extra: write.extra,
			},
			tagIds: write.tagIds,
		});
		const original = remotePayload();
		for (const f of SYNC_FIELDS.task) {
			if (f === "tags") expect(back.tags).toEqual(["tag-1", "tag-ghost"]);
			else expect(back[f]).toEqual(original[f]);
		}
		expect(back.recurrence).toEqual(original.recurrence);
		expect(back._fields).toEqual(original._fields);
	});
});
```

- [ ] **Step 2 : Vérifier l'échec**

Run: `pnpm test:run src/sync/payload.test.ts`
Attendu : ÉCHEC — module inexistant.

- [ ] **Step 3 : Implémenter**

Créer `src/sync/payload.ts` :

```ts
import type { FieldStamps } from "@/db/field-timestamps";
import type { DbDriver } from "@/db/driver";
import {
	ENTITY_TABLE,
	type SyncEntityType,
	type SyncPayload,
} from "./types";

/**
 * The synced fields per entity, spec §2.2. Same lists as 4a's
 * IMPORT_STAMPED_FIELDS minus purged_at (a purge travels as a tombstone, never
 * as a payload field) plus tags, embedded in the task payload per §1.5 because
 * task_tags has no timestamps of its own.
 */
export const SYNC_FIELDS = {
	task: [
		"title",
		"description",
		"project_id",
		"priority",
		"due_date",
		"tags",
		"sort_key",
		"completed_at",
		"deleted_at",
	],
	project: ["name", "color", "icon", "group_id", "sort_key", "deleted_at"],
	tag: ["name", "color", "project_id", "deleted_at"],
	project_group: ["name", "color", "sort_key"],
} as const satisfies Record<SyncEntityType, readonly string[]>;

/**
 * A tag id the task payload references but no local live tag carries — either
 * quarantined or simply later in the same pull cycle. Parked in sync_extra
 * under this reserved key so the id is never lost, folded back into the tags
 * field on push, re-linked at the end of every pull cycle. Keys starting with
 * "_" never leave sync_extra as payload fields.
 */
export const UNLINKED_TAGS_KEY = "_unlinkedTags";

const META_KEYS = new Set(["_v", "_fields", "created_at"]);

export interface EntitySnapshot {
	columns: Record<string, unknown>;
	tagIds: string[];
}

export interface EntityWrite {
	columns: Record<string, unknown>;
	tagIds: string[];
	stamps: string;
	extra: string | null;
}

function parseJsonObject(raw: unknown): Record<string, unknown> {
	if (typeof raw !== "string" || raw === "") return {};
	try {
		const parsed: unknown = JSON.parse(raw);
		return parsed && typeof parsed === "object"
			? (parsed as Record<string, unknown>)
			: {};
	} catch {
		return {};
	}
}

export async function loadSnapshot(
	db: DbDriver,
	entityType: SyncEntityType,
	id: string,
): Promise<EntitySnapshot | null> {
	const table = ENTITY_TABLE[entityType];
	const rows = await db.select<Record<string, unknown>>(
		`SELECT * FROM ${table} WHERE id = ?`,
		[id],
	);
	if (!rows[0]) return null;
	let tagIds: string[] = [];
	if (entityType === "task") {
		const links = await db.select<{ tag_id: string }>(
			"SELECT tag_id FROM task_tags WHERE task_id = ? ORDER BY tag_id",
			[id],
		);
		tagIds = links.map((l) => l.tag_id);
	}
	return { columns: rows[0], tagIds };
}

export function snapshotToPayload(
	entityType: SyncEntityType,
	snapshot: EntitySnapshot,
): SyncPayload {
	const stamps = parseJsonObject(snapshot.columns.field_updated_at) as FieldStamps;
	const extra = parseJsonObject(snapshot.columns.sync_extra);
	const payload: SyncPayload = {
		_v: 1,
		created_at: String(snapshot.columns.created_at),
		_fields: stamps,
	};
	for (const field of SYNC_FIELDS[entityType]) {
		if (field === "tags") {
			const unlinked = Array.isArray(extra[UNLINKED_TAGS_KEY])
				? (extra[UNLINKED_TAGS_KEY] as string[])
				: [];
			payload.tags = [...new Set([...snapshot.tagIds, ...unlinked])].sort();
		} else {
			payload[field] = snapshot.columns[field] ?? null;
		}
	}
	for (const [key, value] of Object.entries(extra)) {
		if (!key.startsWith("_")) payload[key] = value;
	}
	return payload;
}

export function payloadToWrite(
	entityType: SyncEntityType,
	payload: SyncPayload,
	linkableTagIds: ReadonlySet<string>,
): EntityWrite {
	const known = new Set<string>(SYNC_FIELDS[entityType]);
	const columns: Record<string, unknown> = { created_at: payload.created_at };
	for (const field of SYNC_FIELDS[entityType]) {
		if (field !== "tags") columns[field] = payload[field] ?? null;
	}
	const extra: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(payload)) {
		if (!known.has(key) && !META_KEYS.has(key) && !key.startsWith("_")) {
			extra[key] = value;
		}
	}
	let tagIds: string[] = [];
	if (entityType === "task") {
		const wanted = Array.isArray(payload.tags) ? (payload.tags as string[]) : [];
		tagIds = wanted.filter((t) => linkableTagIds.has(t));
		const unlinked = wanted.filter((t) => !linkableTagIds.has(t));
		if (unlinked.length > 0) extra[UNLINKED_TAGS_KEY] = unlinked;
	}
	return {
		columns,
		tagIds,
		stamps: JSON.stringify(payload._fields),
		extra: Object.keys(extra).length > 0 ? JSON.stringify(extra) : null,
	};
}

export function serializePayload(payload: SyncPayload): string {
	return JSON.stringify(payload);
}

export function plaintextByteLength(plaintext: string): number {
	return new TextEncoder().encode(plaintext).length;
}
```

- [ ] **Step 4 : Vérifier le vert**

Run: `pnpm test:run src/sync/payload.test.ts` — Attendu : PASS.

- [ ] **Step 5 : Commit**

```bash
git add src/sync/payload.ts src/sync/payload.test.ts
git commit -m 'feat: :sparkles: convert rows to encrypted-payload shape and back'
```

- [ ] **Step 6 : [SABOTAGE] Prouver la préservation des champs inconnus (§5.4)**

Dans `src/sync/payload.ts`, dans `payloadToWrite`, supprimer entièrement la boucle `for (const [key, value] of Object.entries(payload)) { … }` (le bloc de collecte des extras).

```bash
git diff --stat -- src/sync/payload.ts     # doit lister le fichier
grep -c 'META_KEYS.has(key)' src/sync/payload.ts   # doit afficher 0 (avant sabotage : 1)
pnpm test:run src/sync/payload.test.ts     # 'splits known columns…' et le round-trip DOIVENT échouer (recurrence perdu)
git checkout -- src/sync/payload.ts
pnpm test:run src/sync/payload.test.ts     # tout DOIT repasser
```

---

### Tâche 9 : `merge.ts` — LWW par champ, pur

Le cœur du §5, sans aucune I/O. Trois règles : le timestamp le plus récent gagne ; à égalité stricte de `t`, **le `device_id` lexicographiquement le plus grand gagne** (contraignant — les stamps hérités `d: ""` doivent perdre, voir la correction du 2026-08-23 dans le spec) ; tout stamp entrant à plus de 24 h dans le futur du serveur est ramené à l'heure serveur (§5.1). La purge (règle 2) et les orphelins (règle 3) ne passent pas ici : les tombstones n'ont pas de payload (tâche 11).

**Files:**
- Create: `src/sync/merge.ts`
- Test: `src/sync/merge.test.ts`

**Interfaces:**
- Consumes: `FieldStamp`/`FieldStamps` (`@/db/field-timestamps`), `SyncPayload` (T3).
- Produces: `stampWins(candidate: FieldStamp, incumbent: FieldStamp): boolean` ; `clampStamps(stamps: FieldStamps, serverTimeMs: number): FieldStamps` ; `CLOCK_CLAMP_MS = 86_400_000` ; `interface MergeResult { payload: SyncPayload; locallyDirty: boolean }` ; `mergePayloads(local: SyncPayload | null, remote: SyncPayload, serverTimeMs: number): MergeResult`. `locallyDirty` = au moins un champ local a strictement gagné (ou n'existe que localement) ⇒ la ligne doit repartir au push ; `false` ⇒ l'entrée d'outbox créée par l'application peut être purgée.

- [ ] **Step 1 : Écrire le test (échec attendu)**

Créer `src/sync/merge.test.ts` :

```ts
import { describe, expect, it } from "vitest";
import { clampStamps, mergePayloads, stampWins } from "./merge";
import type { SyncPayload } from "./types";

const SERVER_MS = Date.parse("2026-08-25T12:00:00.000Z");

function payload(
	fields: Record<string, unknown>,
	stamps: Record<string, { t: string; d: string }>,
): SyncPayload {
	return { _v: 1, created_at: "2026-08-20T08:00:00.000Z", _fields: stamps, ...fields };
}

describe("stampWins (tie-break: LARGER device id wins, spec §5)", () => {
	it("prefers the newer timestamp regardless of device", () => {
		expect(
			stampWins(
				{ t: "2026-08-25T11:00:00.000Z", d: "aaa" },
				{ t: "2026-08-25T10:00:00.000Z", d: "zzz" },
			),
		).toBe(true);
	});

	it("breaks a strict tie by the larger device id", () => {
		const t = "2026-08-25T10:00:00.000Z";
		expect(stampWins({ t, d: "bbb" }, { t, d: "aaa" })).toBe(true);
		expect(stampWins({ t, d: "aaa" }, { t, d: "bbb" })).toBe(false);
	});

	it('makes legacy authorless stamps (d: "") lose every tie', () => {
		const t = "2026-08-25T10:00:00.000Z";
		expect(stampWins({ t, d: "any-uuid" }, { t, d: "" })).toBe(true);
		expect(stampWins({ t, d: "" }, { t, d: "any-uuid" })).toBe(false);
	});
});

describe("clampStamps (§5.1)", () => {
	it("pulls a stamp more than 24h in the server future back to server time", () => {
		const out = clampStamps(
			{ title: { t: "2027-01-01T00:00:00.000Z", d: "dev" } },
			SERVER_MS,
		);
		expect(out.title).toEqual({ t: "2026-08-25T12:00:00.000Z", d: "dev" });
	});

	it("leaves a stamp inside the 24h window untouched", () => {
		const near = { t: "2026-08-26T11:00:00.000Z", d: "dev" };
		expect(clampStamps({ title: near }, SERVER_MS).title).toEqual(near);
	});
});

describe("mergePayloads", () => {
	it("adopts the remote wholesale when there is no local row", () => {
		const remote = payload({ title: "from B" }, { title: { t: "2026-08-25T10:00:00.000Z", d: "b" } });
		const out = mergePayloads(null, remote, SERVER_MS);
		expect(out.payload.title).toBe("from B");
		expect(out.locallyDirty).toBe(false);
	});

	it("merges field by field: each side keeps its newer fields", () => {
		const local = payload(
			{ title: "local title", priority: "low" },
			{
				title: { t: "2026-08-25T11:00:00.000Z", d: "a" },
				priority: { t: "2026-08-25T09:00:00.000Z", d: "a" },
			},
		);
		const remote = payload(
			{ title: "remote title", priority: "high" },
			{
				title: { t: "2026-08-25T10:00:00.000Z", d: "b" },
				priority: { t: "2026-08-25T10:00:00.000Z", d: "b" },
			},
		);
		const out = mergePayloads(local, remote, SERVER_MS);
		expect(out.payload.title).toBe("local title");
		expect(out.payload.priority).toBe("high");
		expect(out.payload._fields.title.d).toBe("a");
		expect(out.payload._fields.priority.d).toBe("b");
		expect(out.locallyDirty).toBe(true); // title won locally → must push back
	});

	it("is clean (not dirty) when the remote wins everything", () => {
		const t0 = { t: "2026-08-25T09:00:00.000Z", d: "a" };
		const t1 = { t: "2026-08-25T10:00:00.000Z", d: "b" };
		const out = mergePayloads(
			payload({ title: "old" }, { title: t0 }),
			payload({ title: "new" }, { title: t1 }),
			SERVER_MS,
		);
		expect(out.payload.title).toBe("new");
		expect(out.locallyDirty).toBe(false);
	});

	it("is clean when both sides carry the identical write (idempotent re-pull)", () => {
		const stamp = { t: "2026-08-25T10:00:00.000Z", d: "a" };
		const out = mergePayloads(
			payload({ title: "same" }, { title: stamp }),
			payload({ title: "same" }, { title: stamp }),
			SERVER_MS,
		);
		expect(out.locallyDirty).toBe(false);
	});

	it("keeps a local-only field and stays dirty (remote never saw it)", () => {
		const out = mergePayloads(
			payload({ title: "x", description: "local note" }, {
				title: { t: "2026-08-25T09:00:00.000Z", d: "a" },
				description: { t: "2026-08-25T09:00:00.000Z", d: "a" },
			}),
			payload({ title: "x" }, { title: { t: "2026-08-25T09:00:00.000Z", d: "a" } }),
			SERVER_MS,
		);
		expect(out.payload.description).toBe("local note");
		expect(out.locallyDirty).toBe(true);
	});

	it("preserves an unknown remote field verbatim (§5.4)", () => {
		const out = mergePayloads(
			payload({ title: "x" }, { title: { t: "2026-08-25T09:00:00.000Z", d: "a" } }),
			payload(
				{ title: "x", recurrence: { every: "week" } },
				{
					title: { t: "2026-08-25T09:00:00.000Z", d: "a" },
					recurrence: { t: "2026-08-25T10:00:00.000Z", d: "b" },
				},
			),
			SERVER_MS,
		);
		expect(out.payload.recurrence).toEqual({ every: "week" });
		expect(out.locallyDirty).toBe(false);
	});

	it("clamps a runaway remote clock so it cannot win forever (§5.1)", () => {
		const out = mergePayloads(
			payload({ title: "sane local" }, { title: { t: "2026-08-25T11:59:00.000Z", d: "a" } }),
			payload({ title: "from the future" }, { title: { t: "2027-06-01T00:00:00.000Z", d: "b" } }),
			SERVER_MS,
		);
		// Clamped to server time (12:00), which still beats 11:59 — the write is
		// recent and legitimate; what the clamp kills is the *permanent* head start.
		expect(out.payload.title).toBe("from the future");
		expect(out.payload._fields.title.t).toBe("2026-08-25T12:00:00.000Z");
	});

	it("resolves a strict tie identically whichever side is local (convergence)", () => {
		const t = "2026-08-25T10:00:00.000Z";
		const asSeenByA = mergePayloads(
			payload({ title: "A wrote" }, { title: { t, d: "device-aaa" } }),
			payload({ title: "B wrote" }, { title: { t, d: "device-bbb" } }),
			SERVER_MS,
		);
		const asSeenByB = mergePayloads(
			payload({ title: "B wrote" }, { title: { t, d: "device-bbb" } }),
			payload({ title: "A wrote" }, { title: { t, d: "device-aaa" } }),
			SERVER_MS,
		);
		expect(asSeenByA.payload.title).toBe("B wrote");
		expect(asSeenByB.payload.title).toBe("B wrote");
		expect(asSeenByA.locallyDirty).toBe(false); // A lost: nothing to push
		expect(asSeenByB.locallyDirty).toBe(true); // B won against A's pushed value
	});
});
```

- [ ] **Step 2 : Vérifier l'échec**

Run: `pnpm test:run src/sync/merge.test.ts`
Attendu : ÉCHEC — module inexistant.

- [ ] **Step 3 : Implémenter**

Créer `src/sync/merge.ts` :

```ts
import type { FieldStamp, FieldStamps } from "@/db/field-timestamps";
import type { SyncPayload } from "./types";

export const CLOCK_CLAMP_MS = 24 * 60 * 60 * 1000;

/**
 * Spec §5 rule 1. ISO 8601 UTC strings with fixed millisecond precision
 * compare correctly as strings, so no Date parsing. On a strict tie the
 * LARGER device id wins — the direction is binding (spec correction of
 * 2026-08-23): migration 010 blanked legacy stamps to d: "", and "" sorting
 * below every uuid means an attributed write beats an authorless one.
 */
export function stampWins(candidate: FieldStamp, incumbent: FieldStamp): boolean {
	if (candidate.t !== incumbent.t) return candidate.t > incumbent.t;
	return candidate.d > incumbent.d;
}

/** Spec §5.1: a stamp more than 24h past server time is pulled back to it. */
export function clampStamps(
	stamps: FieldStamps,
	serverTimeMs: number,
): FieldStamps {
	const horizon = new Date(serverTimeMs + CLOCK_CLAMP_MS).toISOString();
	const serverIso = new Date(serverTimeMs).toISOString();
	const out: FieldStamps = {};
	for (const [field, stamp] of Object.entries(stamps)) {
		out[field] = stamp.t > horizon ? { t: serverIso, d: stamp.d } : stamp;
	}
	return out;
}

export interface MergeResult {
	payload: SyncPayload;
	/**
	 * True when at least one local field strictly won (or exists only
	 * locally): the merged row differs from what the server holds and must be
	 * pushed back. False means the outbox entry the apply just caused can be
	 * deleted in the same transaction — the §9.5 requirement.
	 */
	locallyDirty: boolean;
}

const META_KEYS = new Set(["_v", "_fields", "created_at"]);
const EMPTY_STAMP: FieldStamp = { t: "", d: "" };

function fieldNames(local: SyncPayload | null, remote: SyncPayload): Set<string> {
	const names = new Set<string>();
	for (const source of [local, remote]) {
		if (!source) continue;
		for (const key of Object.keys(source)) {
			if (!META_KEYS.has(key) && !key.startsWith("_")) names.add(key);
		}
		for (const key of Object.keys(source._fields)) names.add(key);
	}
	return names;
}

export function mergePayloads(
	local: SyncPayload | null,
	remote: SyncPayload,
	serverTimeMs: number,
): MergeResult {
	const remoteStamps = clampStamps(remote._fields, serverTimeMs);
	if (local === null) {
		return {
			payload: { ...remote, _fields: remoteStamps },
			locallyDirty: false,
		};
	}

	const merged: SyncPayload = {
		_v: 1,
		// created_at is identity metadata, not an LWW field: the local row was
		// born once; adopting a remote value would just churn bytes.
		created_at: local.created_at,
		_fields: {},
	};
	let locallyDirty = false;

	for (const name of fieldNames(local, remote)) {
		const localStamp = local._fields[name];
		const remoteStamp = remoteStamps[name];
		const localHas = localStamp !== undefined || name in local;
		const remoteHas = remoteStamp !== undefined || name in remote;

		let takeLocal: boolean;
		if (!remoteHas) takeLocal = true;
		else if (!localHas) takeLocal = false;
		else {
			// A value with no stamp at all (pre-4a legacy) carries the empty
			// stamp, which loses to any attributed or dated write.
			takeLocal = !stampWins(remoteStamp ?? EMPTY_STAMP, localStamp ?? EMPTY_STAMP);
		}

		if (takeLocal) {
			if (name in local) merged[name] = local[name];
			merged._fields[name] = localStamp ?? EMPTY_STAMP;
			const rs = remoteStamp ?? (remoteHas ? EMPTY_STAMP : undefined);
			const ls = localStamp ?? EMPTY_STAMP;
			if (!rs || rs.t !== ls.t || rs.d !== ls.d) locallyDirty = true;
		} else {
			if (name in remote) merged[name] = remote[name];
			merged._fields[name] = remoteStamp ?? EMPTY_STAMP;
		}
	}

	return { payload: merged, locallyDirty };
}
```

- [ ] **Step 4 : Vérifier le vert**

Run: `pnpm test:run src/sync/merge.test.ts` — Attendu : PASS.

- [ ] **Step 5 : Commit**

```bash
git add src/sync/merge.ts src/sync/merge.test.ts
git commit -m 'feat: :sparkles: add the pure per-field LWW merge with deterministic tie-break'
```

- [ ] **Step 6 : [SABOTAGE] Prouver le sens du départage — le point contraignant du spec**

Dans `src/sync/merge.ts`, dans `stampWins`, remplacer `return candidate.d > incumbent.d;` par `return candidate.d < incumbent.d;`.

```bash
git diff --stat -- src/sync/merge.ts             # doit lister le fichier
grep -c 'candidate.d > incumbent.d' src/sync/merge.ts   # doit afficher 0 (avant sabotage : 1)
pnpm test:run src/sync/merge.test.ts   # 'breaks a strict tie…', 'makes legacy authorless stamps…' et 'resolves a strict tie identically…' DOIVENT échouer
git checkout -- src/sync/merge.ts
pnpm test:run src/sync/merge.test.ts   # tout DOIT repasser
```

---

### Tâche 10 : Harnais — `FakeSyncServer` et `FakeRecordCipher`

Le serveur en mémoire reproduit la sémantique **vérifiée** de usagi-server (pas la doc) : seq dense par écriture, écrasement inconditionnel, curseur exclusif, pagination `hasMore`, 409 au-delà du compteur, rejet bruyant d'un tombstone porteur de payload (le CHECK `records_tombstone_shape` du serveur). Ses propres tests rejouent les comportements épinglés par les e2e serveur — c'est ce qui autorise les tâches 11-15 à se fier au faux.

**Files:**
- Create: `src/test-harness/FakeSyncServer.ts`, `src/test-harness/FakeRecordCipher.ts`
- Test: `src/test-harness/FakeSyncServer.test.ts`

**Interfaces:**
- Consumes: types (T3).
- Produces:
  - `class FakeSyncServer { push(changes: PushChange[]): PushResponse; pull(cursor: number, limit: number): PullResponse; transport(): SyncTransport; dump(): StoredRecord[]; get seqCounter(): number; requestCount: number; }` avec `StoredRecord = { entityType; id; seq; ciphertext: string | null; nonce: string | null; purged: boolean }` ;
  - `class FakeRecordCipher implements RecordCipher { corrupt(entityType: SyncEntityType, id: string): void; heal(entityType: SyncEntityType, id: string): void }` — chiffre = base64(utf8), nonce factice de 24 octets ; `decrypt` jette sur une entité marquée corrompue ; `heal` lève la corruption (test du retry de quarantaine, tâche 11).

- [ ] **Step 1 : Écrire le test (échec attendu)**

Créer `src/test-harness/FakeSyncServer.test.ts` :

```ts
import { describe, expect, it } from "vitest";
import { CursorOutOfRangeError, type PushChange } from "@/sync/types";
import { FakeSyncServer } from "./FakeSyncServer";

function alive(id: string, over: Partial<PushChange> = {}): PushChange {
	return {
		entityType: "task",
		id,
		purged: false,
		ciphertext: "Y2lwaGVy",
		nonce: "bm9uY2Vub25jZW5vbmNlbm9uY2Vub25jZQ==",
		...over,
	};
}

describe("FakeSyncServer (mirrors the verified server semantics)", () => {
	it("assigns dense sequential seqs and returns serverTime", () => {
		const server = new FakeSyncServer();
		const res = server.push([alive("a"), alive("b", { entityType: "project" })]);
		expect(res.applied.map((x) => x.seq)).toEqual([1, 2]);
		expect(new Date(res.serverTime).toISOString()).toBe(res.serverTime);
	});

	it("overwrites unconditionally and advances seq on re-push", () => {
		const server = new FakeSyncServer();
		server.push([alive("a")]);
		server.push([alive("a", { ciphertext: "ZnJlc2g=" })]);
		expect(server.dump()).toHaveLength(1);
		expect(server.dump()[0].seq).toBe(2);
		expect(server.dump()[0].ciphertext).toBe("ZnJlc2g=");
	});

	it("stores a tombstone with no payload, accepting null or omitted fields", () => {
		const server = new FakeSyncServer();
		server.push([alive("a")]);
		server.push([{ entityType: "task", id: "a", purged: true }]);
		expect(server.dump()[0]).toMatchObject({ purged: true, ciphertext: null, nonce: null });
	});

	it("rejects a tombstone that carries a payload (records_tombstone_shape)", () => {
		const server = new FakeSyncServer();
		expect(() => server.push([alive("a", { purged: true })])).toThrow(/tombstone/);
	});

	it("rejects an empty batch and a batch above 100", () => {
		const server = new FakeSyncServer();
		expect(() => server.push([])).toThrow(/batch/);
		expect(() =>
			server.push(Array.from({ length: 101 }, (_, i) => alive(`t${i}`))),
		).toThrow(/batch/);
	});

	it("paginates with an exclusive cursor and hasMore", () => {
		const server = new FakeSyncServer();
		server.push(Array.from({ length: 5 }, (_, i) => alive(`t${i}`)));
		const p1 = server.pull(0, 2);
		expect(p1.records.map((r) => r.seq)).toEqual([1, 2]);
		expect(p1.nextCursor).toBe(2);
		expect(p1.hasMore).toBe(true);
		const p3 = server.pull(4, 2);
		expect(p3.records.map((r) => r.seq)).toEqual([5]);
		expect(p3.hasMore).toBe(false);
	});

	it("answers empty at the latest cursor without moving it", () => {
		const server = new FakeSyncServer();
		server.push([alive("a")]);
		const res = server.pull(1, 500);
		expect(res.records).toEqual([]);
		expect(res.nextCursor).toBe(1);
	});

	it("throws CursorOutOfRangeError past the counter", () => {
		const server = new FakeSyncServer();
		server.push([alive("a")]);
		expect(() => server.pull(2, 500)).toThrow(CursorOutOfRangeError);
	});

	it("re-serves the freshest state of an entity pushed then purged", () => {
		const server = new FakeSyncServer();
		server.push([alive("a")]);
		server.push([{ entityType: "task", id: "a", purged: true }]);
		const res = server.pull(0, 500);
		expect(res.records).toHaveLength(1);
		expect(res.records[0]).toMatchObject({ id: "a", seq: 2, purged: true });
	});
});
```

- [ ] **Step 2 : Vérifier l'échec**

Run: `pnpm test:run src/test-harness/FakeSyncServer.test.ts`
Attendu : ÉCHEC — module inexistant.

- [ ] **Step 3 : Implémenter**

Créer `src/test-harness/FakeSyncServer.ts` :

```ts
import {
	CursorOutOfRangeError,
	PUSH_MAX_CHANGES,
	type PullResponse,
	type PushChange,
	type PushResponse,
	type SyncEntityType,
	type SyncTransport,
} from "@/sync/types";

export interface StoredRecord {
	entityType: SyncEntityType;
	id: string;
	seq: number;
	ciphertext: string | null;
	nonce: string | null;
	purged: boolean;
}

/**
 * In-memory stand-in for usagi-server's /v1/sync routes, mirroring the
 * VERIFIED semantics (develop 74e5f2c), not the docs: dense per-write seqs,
 * unconditional overwrite, exclusive cursor, hasMore, 409 past the counter,
 * and the records_tombstone_shape CHECK as a loud throw. Its own test file
 * replays the behaviours the server e2e suite pins — that is what lets the
 * engine tests trust this fake.
 */
export class FakeSyncServer {
	private records = new Map<string, StoredRecord>();
	private counter = 0;
	requestCount = 0;

	get seqCounter(): number {
		return this.counter;
	}

	push(changes: PushChange[]): PushResponse {
		if (changes.length < 1 || changes.length > PUSH_MAX_CHANGES) {
			throw new Error(`invalid batch size ${changes.length}`);
		}
		for (const change of changes) {
			if (change.purged && (change.ciphertext ?? null) !== null) {
				throw new Error("tombstone carries a ciphertext");
			}
			if (change.purged && (change.nonce ?? null) !== null) {
				throw new Error("tombstone carries a nonce");
			}
			if (!change.purged && (!change.ciphertext || !change.nonce)) {
				throw new Error("live change is missing its payload");
			}
		}
		const applied = changes.map((change) => {
			this.counter += 1;
			this.records.set(`${change.entityType} ${change.id}`, {
				entityType: change.entityType,
				id: change.id,
				seq: this.counter,
				ciphertext: change.purged ? null : (change.ciphertext as string),
				nonce: change.purged ? null : (change.nonce as string),
				purged: change.purged,
			});
			return { entityType: change.entityType, id: change.id, seq: this.counter };
		});
		return { applied, serverTime: new Date().toISOString() };
	}

	pull(cursor: number, limit: number): PullResponse {
		if (cursor > this.counter) {
			throw new CursorOutOfRangeError("cursor is beyond the workspace counter");
		}
		const sorted = [...this.records.values()]
			.filter((r) => r.seq > cursor)
			.sort((a, b) => a.seq - b.seq);
		const page = sorted.slice(0, limit);
		return {
			records: page.map((r) => ({ ...r })),
			nextCursor: page.length > 0 ? page[page.length - 1].seq : cursor,
			hasMore: sorted.length > limit,
			serverTime: new Date().toISOString(),
		};
	}

	transport(): SyncTransport {
		return {
			push: async (changes) => {
				this.requestCount += 1;
				return this.push(changes.map((c) => ({ ...c })));
			},
			pull: async (cursor, limit) => {
				this.requestCount += 1;
				return this.pull(cursor, limit);
			},
		};
	}

	dump(): StoredRecord[] {
		return [...this.records.values()].sort((a, b) => a.seq - b.seq);
	}
}
```

Créer `src/test-harness/FakeRecordCipher.ts` :

```ts
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
```

- [ ] **Step 4 : Vérifier le vert**

Run: `pnpm test:run src/test-harness/FakeSyncServer.test.ts` — Attendu : PASS.

- [ ] **Step 5 : Commit**

```bash
git add src/test-harness/FakeSyncServer.ts src/test-harness/FakeSyncServer.test.ts src/test-harness/FakeRecordCipher.ts
git commit -m 'test: :white_check_mark: add the in-memory sync server and fake cipher harness'
```

---

### Tâche 11 : Moteur — pull, merge, application transactionnelle

La pièce centrale. Trois exigences non négociables :

1. **§9.5 / §4.1 — atomicité par page** : l'application des enregistrements d'une page, les mises en quarantaine, la purge des entrées d'outbox devenues propres **et l'avancée du curseur** se font dans **une seule transaction** `DbDriver`. Un crash au milieu laisse la base à l'état de la page précédente, curseur compris : le rejeu est idempotent (merge de stamps identiques ⇒ propre).
2. **Les triggers tirent sur les écritures du moteur** : chaque upsert d'un enregistrement distant crée une entrée d'outbox. Si le merge n'a rien retenu de local (`locallyDirty === false`), cette entrée est supprimée **dans la même transaction** — sinon chaque pull déclencherait un push en écho, l'oscillation que le §4.1 interdit.
3. **Un blob illisible ne bloque jamais la boucle (§7)** : échec de déchiffrement ou payload malformé ⇒ ligne dans `sync_quarantine`, l'enregistrement suivant continue, le curseur avance.

S'y ajoutent les règles de fusion hors LWW : purge terminale (§5.2, les deux sens), collision de nom de tag (UNIQUE — « plus petit id gagne », déterministe sur tous les appareils), réparation des orphelins en fin de cycle (§5.3), reliaison des `_unlinkedTags`, reset du curseur sur 409, absorption de `serverTime` (§5.1).

**Détail de la règle de collision de tags** (vérifiée nécessaire : `tags.name` UNIQUE global, migration 001) : à l'application d'un tag distant vivant dont le nom égale celui d'un tag local vivant d'id différent, le **plus petit id (ordre lexicographique) gagne**. Si le distant gagne : le perdant local est purgé (`purged_at`, `name = id` — l'id est unique par construction, ce qui libère le nom), ses liens `task_tags` sont remappés vers le gagnant et le champ `tags` des tâches touchées est estampillé (cela se propage) ; le tag distant s'applique ensuite normalement. Si le local gagne : l'id distant est écrit comme **tombstone local** poussé au serveur — purge terminale, l'autre appareil purgera sa copie et récupérera les liens via les mises à jour de tâches. L'ordre `dirtied_at` de l'outbox garantit qu'un tag vivant arrive toujours avant le tombstone de son doublon, donc les affectations survivent. Un tag **purgé** qui squatte le nom est renommé `name = id` avant l'insertion.

**Files:**
- Create: `src/sync/apply.ts`, `src/sync/engine.ts`, `src/test-harness/engine.ts`
- Test: `src/sync/engine.pull.test.ts`

**Interfaces:**
- Consumes: tout T3-T10 ; `getOrCreateDeviceId` (`@/db/device-id`) ; `stampFields` (`@/db/field-timestamps`) ; `nowIso`/`nowMs`/`setClockOffsetMs` (T1) ; `SyncHttpError` (T4).
- Produces:
  - `apply.ts` : `liveTagIds(db): Promise<Set<string>>`, `upsertMerged(tx, entityType, id, payload): Promise<void>`, `applyRemoteTombstone(tx, entityType, id): Promise<void>`, `writeLocalTombstone(tx, entityType, id, deviceId): Promise<void>`, `resolveTagNameCollision(tx, remoteId, remoteName, deviceId): Promise<"apply-live" | "keep-local">`, `clearOutbox(tx, entityType, id)`, `touchOutbox(tx, entityType, id)`, `quarantinePull(tx, record, reason)`, `quarantinePushTooLarge(tx, entityType, id)`, `relinkPendingTags(tx)`, `repairOrphans(tx, deviceId)` ;
  - `engine.ts` : `class SyncEngine { constructor(deps: { db: DbDriver; transport: SyncTransport; cipher: RecordCipher; getServerInfo: () => Promise<ServerInfo> }); syncNow(): Promise<void>; resolveFirstSync(choice: "merge" | "replace"): Promise<void>; retryQuarantine(): Promise<void>; getStatus(): SyncStatus; onStatus(l: (s: SyncStatus) => void): () => void; }` — `resolveFirstSync` implémenté en tâche 13 (stub qui jette en T11) ;
  - `test-harness/engine.ts` : `FAKE_SERVER_INFO: ServerInfo`, `makeDevice(server: FakeSyncServer, opts?): Promise<TestDevice>` avec `TestDevice = { driver: BetterSqliteDriver; repo: SqliteRepository; engine: SyncEngine; cipher: FakeRecordCipher }`, `syncMerging(device): Promise<void>` (syncNow + resolveFirstSync("merge") si le garde-fou s'est levé — inerte tant que T13 n'existe pas, les tests T11 gardent un seul côté non vide).

- [ ] **Step 1 : Écrire le harnais d'appareil**

Créer `src/test-harness/engine.ts` :

```ts
import { ALL_MIGRATIONS } from "@/db/migrations";
import { runMigrations } from "@/db/migrations/run-migrations";
import { SqliteRepository } from "@/db/sqlite-repository";
import { SyncEngine } from "@/sync/engine";
import type { ServerInfo } from "@/sync/types";
import { BetterSqliteDriver } from "./BetterSqliteDriver";
import { FakeRecordCipher } from "./FakeRecordCipher";
import type { FakeSyncServer } from "./FakeSyncServer";

export const FAKE_SERVER_INFO: ServerInfo = {
	name: "usagi-server",
	version: "0.0.0-test",
	protocolVersion: 1,
	registrationEnabled: false,
	minClientVersion: "0.1.0",
};

export interface TestDevice {
	driver: BetterSqliteDriver;
	repo: SqliteRepository;
	engine: SyncEngine;
	cipher: FakeRecordCipher;
}

/** A device = a real migrated SQLite (triggers included) + an engine on it. */
export async function makeDevice(
	server: FakeSyncServer,
	opts: { cipher?: FakeRecordCipher; serverInfo?: ServerInfo } = {},
): Promise<TestDevice> {
	const driver = new BetterSqliteDriver();
	await runMigrations(driver, ALL_MIGRATIONS);
	const cipher = opts.cipher ?? new FakeRecordCipher();
	const engine = new SyncEngine({
		db: driver,
		transport: server.transport(),
		cipher,
		getServerInfo: async () => opts.serverInfo ?? FAKE_SERVER_INFO,
	});
	return { driver, repo: new SqliteRepository(driver), engine, cipher };
}

/** Sync, answering the §6.4 first-sync question with "merge" if it comes up. */
export async function syncMerging(device: TestDevice): Promise<void> {
	await device.engine.syncNow();
	if (device.engine.getStatus() === "awaiting-first-sync") {
		await device.engine.resolveFirstSync("merge");
	}
}
```

- [ ] **Step 2 : Écrire le spec du pull (échec attendu)**

Créer `src/sync/engine.pull.test.ts` :

```ts
// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { makeDevice, syncMerging, type TestDevice } from "@/test-harness/engine";
import { FakeSyncServer } from "@/test-harness/FakeSyncServer";
import { getSyncState, setSyncState } from "./state";

let server: FakeSyncServer;
let a: TestDevice;
let b: TestDevice;

beforeEach(async () => {
	server = new FakeSyncServer();
	a = await makeDevice(server);
	b = await makeDevice(server);
});
afterEach(() => {
	a?.driver.close();
	b?.driver.close();
});

async function outboxCount(d: TestDevice): Promise<number> {
	const rows = await d.driver.select<{ n: number }>(
		"SELECT COUNT(*) AS n FROM sync_outbox",
	);
	return rows[0].n;
}

describe("pull → merge → apply", () => {
	it("propagates a task from A to B with identical stamps, and both outboxes end empty", async () => {
		const task = await a.repo.createTask({ title: "From A" });
		await syncMerging(a);
		await syncMerging(b);

		const rowsB = await b.driver.select<{ title: string; field_updated_at: string }>(
			"SELECT title, field_updated_at FROM tasks WHERE id = ?",
			[task.id],
		);
		expect(rowsB[0].title).toBe("From A");
		const rowsA = await a.driver.select<{ field_updated_at: string }>(
			"SELECT field_updated_at FROM tasks WHERE id = ?",
			[task.id],
		);
		expect(JSON.parse(rowsB[0].field_updated_at)).toEqual(
			JSON.parse(rowsA[0].field_updated_at),
		);
		expect(await outboxCount(a)).toBe(0);
		expect(await outboxCount(b)).toBe(0);
		expect(await getSyncState(b.driver, "cursor")).toBe(String(server.seqCounter));
	});

	it("does not echo a pulled record back to the server (§4.1: no oscillation)", async () => {
		await a.repo.createTask({ title: "quiet" });
		await syncMerging(a);
		const seqAfterA = server.seqCounter;
		await syncMerging(b);
		await syncMerging(b); // a second full cycle must push nothing
		expect(server.seqCounter).toBe(seqAfterA);
	});

	it("merges concurrent edits of different fields of the same task", async () => {
		const task = await a.repo.createTask({ title: "original" });
		await syncMerging(a);
		await syncMerging(b);

		// Offline on both sides: A renames, B reprioritises, 1ms apart so the
		// stamps differ and each field has a distinct winner.
		await a.repo.updateTask(task.id, { title: "renamed by A" });
		await new Promise((r) => setTimeout(r, 2));
		await b.repo.updateTask(task.id, { priority: "high" });

		await syncMerging(a);
		await syncMerging(b);
		await syncMerging(a);

		for (const d of [a, b]) {
			const rows = await d.driver.select<{ title: string; priority: string }>(
				"SELECT title, priority FROM tasks WHERE id = ?",
				[task.id],
			);
			expect(rows[0]).toEqual({ title: "renamed by A", priority: "high" });
		}
	});

	it("purge is terminal in both directions (§5.2)", async () => {
		const t1 = await a.repo.createTask({ title: "purged remotely" });
		const t2 = await a.repo.createTask({ title: "purged locally" });
		await syncMerging(a);
		await syncMerging(b);

		// Remote purge vs local edit: A purges t1 while B edits it.
		await a.repo.deleteTask(t1.id);
		await b.repo.updateTask(t1.id, { title: "B edited t1" });
		// Local purge vs remote edit: B purges t2 while A edits it.
		await b.repo.deleteTask(t2.id);
		await a.repo.updateTask(t2.id, { title: "A edited t2" });

		await syncMerging(a);
		await syncMerging(b);
		await syncMerging(a);

		for (const d of [a, b]) {
			const rows = await d.driver.select<{ id: string; purged_at: string | null }>(
				"SELECT id, purged_at FROM tasks WHERE id IN (?, ?)",
				[t1.id, t2.id],
			);
			expect(rows).toHaveLength(2);
			for (const row of rows) expect(row.purged_at).not.toBeNull();
		}
		expect(server.dump().filter((r) => r.purged)).toHaveLength(2);
	});

	it("creates a local tombstone for a purge of a never-seen record", async () => {
		const task = await a.repo.createTask({ title: "born and purged on A" });
		await a.repo.deleteTask(task.id);
		await syncMerging(a);
		await syncMerging(b);
		const rows = await b.driver.select<{ purged_at: string | null }>(
			"SELECT purged_at FROM tasks WHERE id = ?",
			[task.id],
		);
		expect(rows).toHaveLength(1);
		expect(rows[0].purged_at).not.toBeNull();
		expect(await outboxCount(b)).toBe(0);
	});

	it("quarantines an undecryptable blob, keeps the loop running, and retries later (§7)", async () => {
		const bad = await a.repo.createTask({ title: "will corrupt" });
		const good = await a.repo.createTask({ title: "fine" });
		await syncMerging(a);

		b.cipher.corrupt("task", bad.id);
		await syncMerging(b);

		const tasksB = await b.driver.select<{ id: string }>("SELECT id FROM tasks");
		expect(tasksB.map((r) => r.id)).toEqual([good.id]);
		const quarantine = await b.driver.select<{ entity_id: string; reason: string }>(
			"SELECT entity_id, reason FROM sync_quarantine",
		);
		expect(quarantine).toEqual([{ entity_id: bad.id, reason: "decrypt-failed" }]);
		// The cursor moved past the poisoned record: the loop was not blocked.
		expect(await getSyncState(b.driver, "cursor")).toBe(String(server.seqCounter));

		// The blob heals (e.g. vault unlocked with the right key): retried and applied.
		b.cipher.heal("task", bad.id);
		await syncMerging(b);
		expect(await b.driver.select("SELECT id FROM tasks WHERE id = ?", [bad.id])).toHaveLength(1);
		expect(await b.driver.select("SELECT * FROM sync_quarantine")).toHaveLength(0);
	});

	it("survives quarantine across a restart (persisted, not in memory)", async () => {
		const bad = await a.repo.createTask({ title: "poison" });
		await syncMerging(a);
		b.cipher.corrupt("task", bad.id);
		await syncMerging(b);
		const reopened = b.driver.reopen();
		const rows = await reopened.select<{ entity_id: string }>(
			"SELECT entity_id FROM sync_quarantine",
		);
		expect(rows).toEqual([{ entity_id: bad.id }]);
		reopened.close();
	});

	it("resets the cursor and re-pulls everything on 409 CURSOR_OUT_OF_RANGE", async () => {
		const task = await a.repo.createTask({ title: "resync me" });
		await syncMerging(a);
		await syncMerging(b);
		// A cursor from another life (spec: restored backup, another server).
		await setSyncState(b.driver, "cursor", String(server.seqCounter + 100));
		await b.repo.updateTask(task.id, { title: "edited on B" });
		await syncMerging(b);
		expect(await getSyncState(b.driver, "cursor")).toBe(String(server.seqCounter));
		expect(await outboxCount(b)).toBe(0);
		const rows = await b.driver.select<{ title: string }>(
			"SELECT title FROM tasks WHERE id = ?",
			[task.id],
		);
		expect(rows[0].title).toBe("edited on B");
	});

	it("applies a page, clears the outbox and advances the cursor in ONE transaction (§9.5)", async () => {
		await a.repo.createTask({ title: "atomic" });
		await syncMerging(a);
		const cursorBefore = await getSyncState(b.driver, "cursor");
		// The outbox cleanup is the last write of the page transaction: making
		// it fail must roll back the applied row AND the cursor with it.
		b.driver.failNextExecuteMatching(/DELETE FROM sync_outbox/);
		await expect(b.engine.syncNow()).rejects.toThrow();
		expect(await b.driver.select("SELECT id FROM tasks")).toHaveLength(0);
		expect(await getSyncState(b.driver, "cursor")).toBe(cursorBefore);
		// Next attempt succeeds and converges — the replay is idempotent.
		await syncMerging(b);
		expect(await b.driver.select("SELECT id FROM tasks")).toHaveLength(1);
	});

	it("repairs an orphaned task into the Inbox at end of cycle (§5.3), and it propagates", async () => {
		const project = await a.repo.createProject({ name: "Doomed" });
		const task = await a.repo.createTask({ title: "orphan", projectId: project.id });
		await syncMerging(a);
		await syncMerging(b);
		await a.repo.deleteProject(project.id);
		await syncMerging(a);
		await syncMerging(b);
		await syncMerging(a);
		for (const d of [a, b]) {
			const rows = await d.driver.select<{ project_id: string | null }>(
				"SELECT project_id FROM tasks WHERE id = ?",
				[task.id],
			);
			expect(rows[0].project_id).toBeNull();
		}
	});

	it("converges two same-named tags created offline to one, preserving assignments", async () => {
		// First contact while B is still empty: the §6.4 gate stays down, and
		// resolveFirstSync (a stub until the first-sync task) is never needed.
		await syncMerging(b);
		const taskA = await a.repo.createTask({ title: "on A" });
		const taskB = await b.repo.createTask({ title: "on B" });
		const tagA = await a.repo.createTag({ name: "urgent" });
		const tagB = await b.repo.createTag({ name: "urgent" });
		await a.repo.updateTask(taskA.id, { tags: [tagA.id] });
		await b.repo.updateTask(taskB.id, { tags: [tagB.id] });

		await syncMerging(a);
		await syncMerging(b);
		await syncMerging(a);
		await syncMerging(b);

		const winner = tagA.id < tagB.id ? tagA.id : tagB.id;
		for (const d of [a, b]) {
			const live = await d.driver.select<{ id: string }>(
				"SELECT id FROM tags WHERE purged_at IS NULL",
			);
			expect(live.map((r) => r.id)).toEqual([winner]);
			const links = await d.driver.select<{ task_id: string; tag_id: string }>(
				"SELECT task_id, tag_id FROM task_tags ORDER BY task_id",
			);
			expect(links.map((l) => l.tag_id)).toEqual([winner, winner]);
			expect(new Set(links.map((l) => l.task_id))).toEqual(new Set([taskA.id, taskB.id]));
		}
	});

	it("preserves unknown payload fields end to end (§5.4)", async () => {
		// A future client pushed a task carrying a field this version ignores.
		const futurePayload = {
			_v: 1,
			created_at: "2026-08-20T08:00:00.000Z",
			_fields: {
				title: { t: "2026-08-25T09:00:00.000Z", d: "future-device" },
				recurrence: { t: "2026-08-25T09:00:00.000Z", d: "future-device" },
			},
			title: "recurring task",
			description: null,
			project_id: null,
			priority: "none",
			due_date: null,
			sort_key: "a0",
			completed_at: null,
			deleted_at: null,
			tags: [],
			recurrence: { every: "week" },
		};
		const enc = await b.cipher.encrypt("task", "future-1", JSON.stringify(futurePayload));
		server.push([{ entityType: "task", id: "future-1", purged: false, ...enc }]);

		await syncMerging(b);
		await b.repo.updateTask("future-1", { title: "renamed by old client" });
		await syncMerging(b);

		const stored = server.dump().find((r) => r.id === "future-1");
		const decrypted = JSON.parse(
			await b.cipher.decrypt("task", "future-1", stored?.ciphertext ?? "", stored?.nonce ?? ""),
		) as Record<string, unknown>;
		expect(decrypted.title).toBe("renamed by old client");
		expect(decrypted.recurrence).toEqual({ every: "week" });
	});

	it("absorbs serverTime into the persisted clock offset (§5.1)", async () => {
		await a.repo.createTask({ title: "tick" });
		await syncMerging(a);
		const stored = await getSyncState(a.driver, "clock_offset_ms");
		expect(stored).not.toBeNull();
		expect(Math.abs(Number(stored))).toBeLessThan(5_000); // fake server = same machine clock
	});
});
```

- [ ] **Step 3 : Vérifier l'échec**

Run: `pnpm test:run src/sync/engine.pull.test.ts`
Attendu : ÉCHEC — `@/sync/engine` inexistant.

- [ ] **Step 4 : Implémenter `apply.ts`**

Créer `src/sync/apply.ts` :

```ts
import type { DbDriver } from "@/db/driver";
import { stampFields } from "@/db/field-timestamps";
import { nowIso } from "@/lib/sync-clock";
import { payloadToWrite, UNLINKED_TAGS_KEY } from "./payload";
import {
	ENTITY_TABLE,
	type PulledRecord,
	type SyncEntityType,
	type SyncPayload,
} from "./types";

export async function liveTagIds(db: DbDriver): Promise<Set<string>> {
	const rows = await db.select<{ id: string }>(
		"SELECT id FROM tags WHERE purged_at IS NULL",
	);
	return new Set(rows.map((r) => r.id));
}

export async function clearOutbox(
	tx: DbDriver,
	entityType: SyncEntityType,
	id: string,
): Promise<void> {
	await tx.execute(
		"DELETE FROM sync_outbox WHERE entity_type = ? AND entity_id = ?",
		[entityType, id],
	);
}

export async function touchOutbox(
	tx: DbDriver,
	entityType: SyncEntityType,
	id: string,
): Promise<void> {
	await tx.execute(
		"INSERT OR REPLACE INTO sync_outbox (entity_type, entity_id, dirtied_at) VALUES (?, ?, ?)",
		[entityType, id, nowIso()],
	);
}

export async function quarantinePull(
	tx: DbDriver,
	record: PulledRecord,
	reason: string,
): Promise<void> {
	await tx.execute(
		`INSERT OR REPLACE INTO sync_quarantine
		 (entity_type, entity_id, seq, direction, ciphertext, nonce, reason, quarantined_at)
		 VALUES (?, ?, ?, 'pull', ?, ?, ?, ?)`,
		[record.entityType, record.id, record.seq, record.ciphertext, record.nonce, reason, nowIso()],
	);
}

export async function quarantinePushTooLarge(
	tx: DbDriver,
	entityType: SyncEntityType,
	id: string,
): Promise<void> {
	// No blob to keep: the record itself lives in its table; what is parked is
	// the fact that it cannot be pushed (server bound: 64 KiB of ciphertext).
	await tx.execute(
		`INSERT OR REPLACE INTO sync_quarantine
		 (entity_type, entity_id, seq, direction, ciphertext, nonce, reason, quarantined_at)
		 VALUES (?, ?, NULL, 'push', NULL, NULL, 'payload-too-large', ?)`,
		[entityType, id, nowIso()],
	);
}

/** Upserts the merged payload without touching non-synced columns (sort_order). */
export async function upsertMerged(
	tx: DbDriver,
	entityType: SyncEntityType,
	id: string,
	payload: SyncPayload,
): Promise<void> {
	const table = ENTITY_TABLE[entityType];
	const linkable = entityType === "task" ? await liveTagIds(tx) : new Set<string>();
	const write = payloadToWrite(entityType, payload, linkable);
	const cols: Record<string, unknown> = {
		...write.columns,
		updated_at: nowIso(),
		field_updated_at: write.stamps,
		sync_extra: write.extra,
		// Only live remotes reach this function (tombstones and the local
		// purge-terminal guard are handled upstream), so the row is live.
		purged_at: null,
	};
	const names = Object.keys(cols);
	const updates = names.map((n) => `${n} = excluded.${n}`).join(", ");
	// INSERT … ON CONFLICT, never INSERT OR REPLACE: OR REPLACE is
	// DELETE-then-INSERT in SQLite — it would fire the DELETE trigger and reset
	// every column left out of the statement (sort_order, and whatever a future
	// migration adds).
	await tx.execute(
		`INSERT INTO ${table} (id, ${names.join(", ")})
		 VALUES (?, ${names.map(() => "?").join(", ")})
		 ON CONFLICT(id) DO UPDATE SET ${updates}`,
		[id, ...names.map((n) => cols[n])],
	);
	if (entityType === "task") {
		await tx.execute("DELETE FROM task_tags WHERE task_id = ?", [id]);
		for (const tagId of write.tagIds) {
			await tx.execute(
				"INSERT OR IGNORE INTO task_tags (task_id, tag_id) VALUES (?, ?)",
				[id, tagId],
			);
		}
	}
}

/** Column resets a purge applies, mirroring deleteTask / deleteProjectGroup. */
function tombstoneResets(entityType: SyncEntityType, id: string): string {
	switch (entityType) {
		case "task":
			return "title = '', description = NULL";
		case "tag":
			// tags.name is globally UNIQUE and NOT NULL; the id is unique by
			// construction, so renaming the tombstone to it frees the name for
			// any future live tag without ever colliding with another tombstone.
			return `name = '${id.replaceAll("'", "''")}'`;
		case "project":
		case "project_group":
			return "name = ''";
	}
}

export async function applyRemoteTombstone(
	tx: DbDriver,
	entityType: SyncEntityType,
	id: string,
): Promise<void> {
	const table = ENTITY_TABLE[entityType];
	const now = nowIso();
	const existing = await tx.select<{ id: string }>(
		`SELECT id FROM ${table} WHERE id = ?`,
		[id],
	);
	if (existing.length === 0) {
		// The row must exist as a tombstone: "purged" and "never existed" are
		// different answers when a stale live version of it arrives later.
		const name = entityType === "tag" ? id : "";
		if (entityType === "task") {
			await tx.execute(
				`INSERT INTO tasks (id, title, created_at, updated_at, deleted_at, purged_at, field_updated_at)
				 VALUES (?, '', ?, ?, ?, ?, '{}')`,
				[id, now, now, now, now],
			);
		} else if (entityType === "project_group") {
			await tx.execute(
				`INSERT INTO project_groups (id, name, color, created_at, updated_at, purged_at, field_updated_at)
				 VALUES (?, ?, '', ?, ?, ?, '{}')`,
				[id, name, now, now, now],
			);
		} else {
			await tx.execute(
				`INSERT INTO ${table} (id, name, created_at, updated_at, purged_at, field_updated_at)
				 VALUES (?, ?, ?, ?, ?, '{}')`,
				[id, name, now, now, now],
			);
		}
	} else {
		// Purge is terminal (§5.2): local edits, however fresh, are discarded.
		const deletedAt = entityType === "task" ? ", deleted_at = ?" : "";
		await tx.execute(
			`UPDATE ${table} SET purged_at = ?, updated_at = ?${deletedAt}, ${tombstoneResets(entityType, id)} WHERE id = ?`,
			entityType === "task" ? [now, now, now, id] : [now, now, id],
		);
	}
	if (entityType === "task") {
		await tx.execute("DELETE FROM task_tags WHERE task_id = ?", [id]);
	}
	if (entityType === "tag") {
		await tx.execute("DELETE FROM task_tags WHERE tag_id = ?", [id]);
	}
	// Both sides now agree on the tombstone: nothing of it is left to push.
	await clearOutbox(tx, entityType, id);
}

/**
 * Writes the losing remote tag id as a LOCAL tombstone and arms the outbox:
 * purge is terminal, so pushing it back is what makes the other device drop
 * its duplicate. Used when the local tag wins the name collision.
 */
export async function writeLocalTombstone(
	tx: DbDriver,
	entityType: SyncEntityType,
	id: string,
	deviceId: string,
): Promise<void> {
	await applyRemoteTombstone(tx, entityType, id);
	const now = nowIso();
	await tx.execute(
		`UPDATE ${ENTITY_TABLE[entityType]} SET field_updated_at = ? WHERE id = ?`,
		[stampFields(null, ["purged_at", "name"], now, deviceId), id],
	);
	await touchOutbox(tx, entityType, id);
}

/**
 * tags.name is globally UNIQUE (migration 001): two devices creating the same
 * name offline collide at apply time. Deterministic rule — the SMALLER id
 * wins — so every device resolves the same collision the same way without
 * coordination. Outbox ordering (dirtied_at) guarantees a live tag always
 * arrives before the tombstone of its duplicate, so task assignments survive
 * through the remap below.
 */
export async function resolveTagNameCollision(
	tx: DbDriver,
	remoteId: string,
	remoteName: string,
	deviceId: string,
): Promise<"apply-live" | "keep-local"> {
	// A purged tag squatting the name would break the upsert's UNIQUE: free it.
	const squatters = await tx.select<{ id: string }>(
		"SELECT id FROM tags WHERE name = ? AND id != ? AND purged_at IS NOT NULL",
		[remoteName, remoteId],
	);
	for (const squatter of squatters) {
		await tx.execute("UPDATE tags SET name = ? WHERE id = ?", [squatter.id, squatter.id]);
	}

	const rivals = await tx.select<{ id: string; field_updated_at: string | null }>(
		"SELECT id, field_updated_at FROM tags WHERE name = ? AND id != ? AND purged_at IS NULL",
		[remoteName, remoteId],
	);
	const rival = rivals[0];
	if (!rival) return "apply-live";
	if (rival.id < remoteId) return "keep-local";

	// Remote wins: purge the local duplicate and remap its links.
	const now = nowIso();
	await tx.execute(
		"UPDATE tags SET purged_at = ?, updated_at = ?, name = ?, field_updated_at = ? WHERE id = ?",
		[now, now, rival.id, stampFields(rival.field_updated_at, ["purged_at", "name"], now, deviceId), rival.id],
	);
	await touchOutbox(tx, "tag", rival.id);
	const linked = await tx.select<{ task_id: string }>(
		"SELECT task_id FROM task_tags WHERE tag_id = ?",
		[rival.id],
	);
	for (const { task_id } of linked) {
		await tx.execute(
			"INSERT OR IGNORE INTO task_tags (task_id, tag_id) VALUES (?, ?)",
			[task_id, remoteId],
		);
		await tx.execute("DELETE FROM task_tags WHERE task_id = ? AND tag_id = ?", [task_id, rival.id]);
		// The tags field of the task genuinely changed: stamp it so it wins LWW
		// against the stale assignment and propagates (the UPDATE arms the outbox).
		const rows = await tx.select<{ field_updated_at: string | null }>(
			"SELECT field_updated_at FROM tasks WHERE id = ?",
			[task_id],
		);
		await tx.execute(
			"UPDATE tasks SET field_updated_at = ?, updated_at = ? WHERE id = ?",
			[stampFields(rows[0]?.field_updated_at ?? null, ["tags"], now, deviceId), now, task_id],
		);
	}
	return "apply-live";
}

/** End-of-cycle §5.3: reattach dangling references — a real, propagating edit. */
export async function repairOrphans(tx: DbDriver, deviceId: string): Promise<void> {
	const now = nowIso();
	const fixes: Array<{ table: string; column: string; refTable: string }> = [
		{ table: "tasks", column: "project_id", refTable: "projects" },
		{ table: "tags", column: "project_id", refTable: "projects" },
		{ table: "projects", column: "group_id", refTable: "project_groups" },
	];
	for (const { table, column, refTable } of fixes) {
		const orphans = await tx.select<{ id: string; field_updated_at: string | null }>(
			`SELECT id, field_updated_at FROM ${table}
			 WHERE purged_at IS NULL AND ${column} IS NOT NULL
			   AND ${column} NOT IN (SELECT id FROM ${refTable} WHERE purged_at IS NULL)`,
		);
		for (const orphan of orphans) {
			await tx.execute(
				`UPDATE ${table} SET ${column} = NULL, updated_at = ?, field_updated_at = ? WHERE id = ?`,
				[now, stampFields(orphan.field_updated_at, [column], now, deviceId), orphan.id],
			);
		}
	}
}

/** End-of-cycle: tags that arrived after the tasks referencing them. */
export async function relinkPendingTags(tx: DbDriver): Promise<void> {
	const pending = await tx.select<{ id: string; sync_extra: string; dirtied: string | null }>(
		`SELECT t.id, t.sync_extra,
		        (SELECT dirtied_at FROM sync_outbox o WHERE o.entity_type = 'task' AND o.entity_id = t.id) AS dirtied
		 FROM tasks t WHERE t.sync_extra LIKE '%${UNLINKED_TAGS_KEY}%'`,
	);
	if (pending.length === 0) return;
	const live = await liveTagIds(tx);
	for (const row of pending) {
		let extra: Record<string, unknown>;
		try {
			extra = JSON.parse(row.sync_extra) as Record<string, unknown>;
		} catch {
			continue;
		}
		const unlinked = Array.isArray(extra[UNLINKED_TAGS_KEY])
			? (extra[UNLINKED_TAGS_KEY] as string[])
			: [];
		const linkable = unlinked.filter((t) => live.has(t));
		if (linkable.length === 0) continue;
		for (const tagId of linkable) {
			await tx.execute(
				"INSERT OR IGNORE INTO task_tags (task_id, tag_id) VALUES (?, ?)",
				[row.id, tagId],
			);
		}
		const still = unlinked.filter((t) => !live.has(t));
		if (still.length > 0) extra[UNLINKED_TAGS_KEY] = still;
		else delete extra[UNLINKED_TAGS_KEY];
		const nextExtra = Object.keys(extra).length > 0 ? JSON.stringify(extra) : null;
		await tx.execute("UPDATE tasks SET sync_extra = ? WHERE id = ?", [nextExtra, row.id]);
		// Linking is pure materialisation: the tags field VALUE is unchanged
		// (linked ∪ unlinked is the same set), so nothing new must push. Drop
		// the outbox entry the UPDATE trigger just created — unless the task
		// was already dirty before this repair.
		if (row.dirtied === null) await clearOutbox(tx, "task", row.id);
	}
}
```

- [ ] **Step 5 : Implémenter `engine.ts`**

Créer `src/sync/engine.ts` :

```ts
import { getOrCreateDeviceId } from "@/db/device-id";
import type { DbDriver } from "@/db/driver";
import { nowIso, nowMs, setClockOffsetMs } from "@/lib/sync-clock";
import {
	applyRemoteTombstone,
	clearOutbox,
	quarantinePull,
	quarantinePushTooLarge,
	relinkPendingTags,
	repairOrphans,
	resolveTagNameCollision,
	touchOutbox,
	upsertMerged,
	writeLocalTombstone,
} from "./apply";
import { SyncHttpError } from "./http";
import { mergePayloads } from "./merge";
import {
	loadSnapshot,
	plaintextByteLength,
	serializePayload,
	snapshotToPayload,
} from "./payload";
import { getSyncState, setSyncState } from "./state";
import {
	CLIENT_PROTOCOL_VERSION,
	CursorOutOfRangeError,
	MAX_PLAINTEXT_BYTES,
	PUSH_MAX_CHANGES,
	ReauthRequiredError,
	SYNC_PULL_LIMIT,
	type PulledRecord,
	type PullResponse,
	type PushChange,
	type RecordCipher,
	type ServerInfo,
	type SyncEntityType,
	type SyncPayload,
	type SyncStatus,
	type SyncTransport,
} from "./types";

export interface SyncEngineDeps {
	db: DbDriver;
	transport: SyncTransport;
	cipher: RecordCipher;
	getServerInfo: () => Promise<ServerInfo>;
}

interface DecryptedRecord {
	record: PulledRecord;
	payload: SyncPayload | null;
	failure: string | null;
}

interface OutboxEntry {
	entity_type: string;
	entity_id: string;
	dirtied_at: string;
}

// A continuously-edited row re-dirties itself during its own push and comes
// back next round; the bound only stops that pathological loop from starving
// the caller — leftovers are picked up by the §4.2 debounce trigger.
const MAX_PUSH_ROUNDS = 50;

export class SyncEngine {
	private status: SyncStatus = "idle";
	private readonly listeners = new Set<(status: SyncStatus) => void>();
	private running = false;
	private rerunRequested = false;
	private protocolChecked = false;

	constructor(private readonly deps: SyncEngineDeps) {}

	getStatus(): SyncStatus {
		return this.status;
	}

	onStatus(listener: (status: SyncStatus) => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	private setStatus(status: SyncStatus): void {
		if (this.status === status) return;
		this.status = status;
		for (const listener of this.listeners) listener(status);
	}

	/** Pull → merge → push (§4.1), single-flight with rerun coalescing. */
	async syncNow(): Promise<void> {
		if (this.running) {
			this.rerunRequested = true;
			return;
		}
		this.running = true;
		try {
			if (!(await this.ensureProtocol())) return;
			await this.loadPersistedOffset();
			this.setStatus("syncing");
			await this.retryQuarantine();
			const gated = await this.pullPhase();
			if (gated) {
				this.setStatus("awaiting-first-sync");
				return;
			}
			await this.repairPhase();
			await this.pushPhase();
			await setSyncState(this.deps.db, "last_sync_at", nowIso());
			this.setStatus("idle");
		} catch (err) {
			if (err instanceof ReauthRequiredError) {
				this.setStatus("reauth-required");
				return;
			}
			this.setStatus("idle");
			// §7: offline and transient server failures are normal states — the
			// outbox accumulates and the next trigger retries. Anything else
			// (a DB failure, a bug) must surface, not vanish.
			if (err instanceof SyncHttpError || err instanceof TypeError) return;
			throw err;
		} finally {
			this.running = false;
			if (this.rerunRequested) {
				this.rerunRequested = false;
				void this.syncNow();
			}
		}
	}

	/** Implemented in the first-sync task; declared here so callers compile. */
	async resolveFirstSync(_choice: "merge" | "replace"): Promise<void> {
		throw new Error("not implemented yet");
	}

	async retryQuarantine(): Promise<void> {
		const db = this.deps.db;
		const rows = await db.select<{
			entity_type: SyncEntityType;
			entity_id: string;
			seq: number | null;
			ciphertext: string | null;
			nonce: string | null;
		}>(
			"SELECT entity_type, entity_id, seq, ciphertext, nonce FROM sync_quarantine WHERE direction = 'pull'",
		);
		if (rows.length === 0) return;
		const deviceId = await getOrCreateDeviceId(db);
		for (const row of rows) {
			if (row.ciphertext === null || row.nonce === null) continue;
			const record: PulledRecord = {
				entityType: row.entity_type,
				id: row.entity_id,
				seq: row.seq ?? 0,
				ciphertext: row.ciphertext,
				nonce: row.nonce,
				purged: false,
			};
			const item = await this.decryptOne(record);
			if (item.failure !== null) continue; // still poisoned: stays parked (§7)
			await db.transaction(async (tx) => {
				await this.applyOne(tx, item, nowMs(), deviceId);
				await tx.execute(
					"DELETE FROM sync_quarantine WHERE entity_type = ? AND entity_id = ?",
					[row.entity_type, row.entity_id],
				);
			});
		}
	}

	private async ensureProtocol(): Promise<boolean> {
		if (this.protocolChecked) return this.status !== "protocol-mismatch";
		const info = await this.deps.getServerInfo();
		this.protocolChecked = true;
		if (info.protocolVersion !== CLIENT_PROTOCOL_VERSION) {
			// §4.0: refuse outright. The app stays fully usable locally.
			this.setStatus("protocol-mismatch");
			return false;
		}
		return true;
	}

	private async loadPersistedOffset(): Promise<void> {
		const stored = await getSyncState(this.deps.db, "clock_offset_ms");
		setClockOffsetMs(stored ? Number(stored) || 0 : 0);
	}

	private async absorbServerTime(serverTime: string): Promise<void> {
		const offset = Date.parse(serverTime) - Date.now();
		if (!Number.isFinite(offset)) return;
		setClockOffsetMs(offset);
		await setSyncState(this.deps.db, "clock_offset_ms", String(offset));
	}

	/** Returns true when the §6.4 first-sync question must be asked. */
	private async pullPhase(): Promise<boolean> {
		const db = this.deps.db;
		let cursor = Number((await getSyncState(db, "cursor")) ?? "0");
		let cursorWasReset = false;
		for (;;) {
			let page: PullResponse;
			try {
				page = await this.deps.transport.pull(cursor, SYNC_PULL_LIMIT);
			} catch (err) {
				if (err instanceof CursorOutOfRangeError && !cursorWasReset) {
					// Contract from 4b: this cursor cannot have come from this
					// workspace. Reset once and full-pull; merging is idempotent.
					cursorWasReset = true;
					cursor = 0;
					await setSyncState(db, "cursor", "0");
					continue;
				}
				throw err;
			}
			await this.absorbServerTime(page.serverTime);
			if (await this.firstSyncGate(cursor, page)) return true;
			const serverTimeMs = Date.parse(page.serverTime);
			const decrypted: DecryptedRecord[] = [];
			for (const record of page.records) {
				decrypted.push(await this.decryptOne(record));
			}
			const deviceId = await getOrCreateDeviceId(db);
			// §9.5: applied records, quarantine rows, outbox cleanup and the
			// cursor advance commit or roll back as one unit.
			await db.transaction(async (tx) => {
				for (const item of decrypted) {
					await this.applyOne(tx, item, serverTimeMs, deviceId);
				}
				await setSyncState(tx, "cursor", String(page.nextCursor));
			});
			cursor = page.nextCursor;
			if (!page.hasMore) return false;
		}
	}

	private async decryptOne(record: PulledRecord): Promise<DecryptedRecord> {
		if (record.purged || record.ciphertext === null || record.nonce === null) {
			return { record, payload: null, failure: record.purged ? null : "malformed-record" };
		}
		try {
			const plaintext = await this.deps.cipher.decrypt(
				record.entityType,
				record.id,
				record.ciphertext,
				record.nonce,
			);
			const parsed: unknown = JSON.parse(plaintext);
			if (
				!parsed ||
				typeof parsed !== "object" ||
				(parsed as SyncPayload)._v !== 1 ||
				typeof (parsed as SyncPayload)._fields !== "object"
			) {
				return { record, payload: null, failure: "malformed-payload" };
			}
			return { record, payload: parsed as SyncPayload, failure: null };
		} catch (err) {
			return {
				record,
				payload: null,
				failure: err instanceof SyntaxError ? "malformed-payload" : "decrypt-failed",
			};
		}
	}

	private async applyOne(
		tx: DbDriver,
		item: DecryptedRecord,
		serverTimeMs: number,
		deviceId: string,
	): Promise<void> {
		const { record } = item;
		if (record.purged) {
			await applyRemoteTombstone(tx, record.entityType, record.id);
			return;
		}
		if (item.failure !== null || item.payload === null) {
			await quarantinePull(tx, record, item.failure ?? "malformed-payload");
			return;
		}
		const snapshot = await loadSnapshot(tx, record.entityType, record.id);
		if (snapshot && snapshot.columns.purged_at != null) {
			// §5.2 the other way round: OUR purge outlives THEIR edit. Re-arm
			// the outbox so the tombstone pushes over the remote live version.
			await touchOutbox(tx, record.entityType, record.id);
			return;
		}
		if (record.entityType === "tag") {
			const action = await resolveTagNameCollision(
				tx,
				record.id,
				String(item.payload.name ?? ""),
				deviceId,
			);
			if (action === "keep-local") {
				await writeLocalTombstone(tx, "tag", record.id, deviceId);
				return;
			}
		}
		const local = snapshot ? snapshotToPayload(record.entityType, snapshot) : null;
		const merged = mergePayloads(local, item.payload, serverTimeMs);
		await upsertMerged(tx, record.entityType, record.id, merged.payload);
		// The upsert's UPDATE trigger just armed the outbox. If nothing local
		// survived the merge, the row is exactly what the server holds: clear
		// it in the SAME transaction (§9.5) or every pull becomes an echo push.
		if (!merged.locallyDirty) {
			await clearOutbox(tx, record.entityType, record.id);
		}
	}

	private async firstSyncGate(cursor: number, page: PullResponse): Promise<boolean> {
		const db = this.deps.db;
		if (await getSyncState(db, "first_sync_resolved")) return false;
		if (cursor > 0) {
			// Mid-history cursor: this device already synced before the flag
			// existed; the question would be meaningless now.
			await setSyncState(db, "first_sync_resolved", "1");
			return false;
		}
		const counts = await db.select<{ n: number }>(
			`SELECT (SELECT COUNT(*) FROM tasks) + (SELECT COUNT(*) FROM projects)
			      + (SELECT COUNT(*) FROM tags) + (SELECT COUNT(*) FROM project_groups) AS n`,
		);
		const localNonEmpty = (counts[0]?.n ?? 0) > 0;
		if (!localNonEmpty || page.records.length === 0) {
			await setSyncState(db, "first_sync_resolved", "1");
			return false;
		}
		// §6.4: both sides have data. A naïve merge-push would read as silent
		// corruption — stop before applying anything and ask.
		return true;
	}

	private async repairPhase(): Promise<void> {
		const db = this.deps.db;
		const deviceId = await getOrCreateDeviceId(db);
		await db.transaction(async (tx) => {
			await relinkPendingTags(tx);
			await repairOrphans(tx, deviceId);
		});
	}

	private async pushPhase(): Promise<void> {
		const db = this.deps.db;
		for (let round = 0; round < MAX_PUSH_ROUNDS; round++) {
			const entries = await db.select<OutboxEntry>(
				"SELECT entity_type, entity_id, dirtied_at FROM sync_outbox ORDER BY dirtied_at, entity_type, entity_id LIMIT ?",
				[PUSH_MAX_CHANGES],
			);
			if (entries.length === 0) return;

			const changes: PushChange[] = [];
			const settled: OutboxEntry[] = [];
			for (const entry of entries) {
				const entityType = entry.entity_type as SyncEntityType;
				const snapshot = await loadSnapshot(db, entityType, entry.entity_id);
				if (!snapshot) {
					// Pre-4a ghost: the row was physically deleted; there is
					// nothing to push and nothing to tombstone.
					settled.push(entry);
					continue;
				}
				if (snapshot.columns.purged_at != null) {
					// Tombstone shape (note 4b): ciphertext/nonce omitted.
					changes.push({ entityType, id: entry.entity_id, purged: true });
					settled.push(entry);
					continue;
				}
				const plaintext = serializePayload(snapshotToPayload(entityType, snapshot));
				if (plaintextByteLength(plaintext) > MAX_PLAINTEXT_BYTES) {
					// One oversized record must not wedge the outbox: the server
					// rejects the WHOLE batch on any invalid item.
					await db.transaction(async (tx) => {
						await quarantinePushTooLarge(tx, entityType, entry.entity_id);
						await tx.execute(
							"DELETE FROM sync_outbox WHERE entity_type = ? AND entity_id = ? AND dirtied_at = ?",
							[entry.entity_type, entry.entity_id, entry.dirtied_at],
						);
					});
					continue;
				}
				const { ciphertext, nonce } = await this.deps.cipher.encrypt(
					entityType,
					entry.entity_id,
					plaintext,
				);
				changes.push({ entityType, id: entry.entity_id, purged: false, ciphertext, nonce });
				settled.push(entry);
			}

			if (changes.length > 0) {
				const res = await this.deps.transport.push(changes);
				await this.absorbServerTime(res.serverTime);
			}
			await db.transaction(async (tx) => {
				for (const entry of settled) {
					// dirtied_at is part of the key on purpose: a local write
					// DURING the push replaced the entry with a fresher
					// dirtied_at, this delete misses it, and the row is pushed
					// again next round instead of being silently dropped.
					await tx.execute(
						"DELETE FROM sync_outbox WHERE entity_type = ? AND entity_id = ? AND dirtied_at = ?",
						[entry.entity_type, entry.entity_id, entry.dirtied_at],
					);
				}
			});
		}
	}
}
```

- [ ] **Step 6 : Vérifier le vert**

Run: `pnpm test:run src/sync/engine.pull.test.ts`
Attendu : PASS — **sauf** les assertions passant par `syncMerging` sur un appareil des deux côtés non vides (aucune dans ce fichier : les scénarios gardent toujours un côté vide au premier sync, précisément pour que le garde-fou §6.4 ne se lève pas avant la tâche 13).

Run: `pnpm test:run` — Attendu : tout vert.

- [ ] **Step 7 : Commit**

```bash
git add src/sync/apply.ts src/sync/engine.ts src/test-harness/engine.ts src/sync/engine.pull.test.ts
git commit -m 'feat: :sparkles: add the sync engine pull phase with transactional apply'
```

- [ ] **Step 8 : [SABOTAGE] Prouver la vidange d'outbox dans la même transaction — le cœur du §9.5**

Dans `src/sync/engine.ts`, dans `applyOne`, supprimer le bloc final `if (!merged.locallyDirty) { await clearOutbox(tx, record.entityType, record.id); }` (avec son commentaire).

```bash
git diff --stat -- src/sync/engine.ts                    # doit lister le fichier
grep -c 'clearOutbox(tx, record.entityType' src/sync/engine.ts   # doit afficher 0 (avant sabotage : 1)
pnpm test:run src/sync/engine.pull.test.ts   # 'does not echo a pulled record back…' DOIT échouer (seq serveur avance), et 'propagates a task…' aussi (outbox non vide)
git checkout -- src/sync/engine.ts
pnpm test:run src/sync/engine.pull.test.ts   # tout DOIT repasser
```

- [ ] **Step 9 : [SABOTAGE] Prouver que le curseur avance dans la transaction de page**

Dans `src/sync/engine.ts`, dans `pullPhase`, déplacer la ligne `await setSyncState(tx, "cursor", String(page.nextCursor));` HORS de la transaction : la supprimer du callback et insérer `await setSyncState(db, "cursor", String(page.nextCursor));` juste APRÈS le `await db.transaction(...)`.

```bash
git diff --stat -- src/sync/engine.ts                 # doit lister le fichier
grep -c 'setSyncState(tx, "cursor"' src/sync/engine.ts   # doit afficher 0 (avant sabotage : 1)
pnpm test:run src/sync/engine.pull.test.ts   # 'applies a page, clears the outbox and advances the cursor in ONE transaction' DOIT échouer
git checkout -- src/sync/engine.ts
pnpm test:run src/sync/engine.pull.test.ts   # tout DOIT repasser
```

Nota : ce sabotage déplacé (et non retiré) reproduit le bug réel — un crash entre l'application et la persistance du curseur ; ici c'est l'échec injecté par `failNextExecuteMatching` qui joue le crash, et le test voit le curseur avancé sur une page annulée… ou, selon le sens, une page appliquée au curseur figé qui rejouerait. Les deux sont rouges.

---

### Tâche 12 : Moteur — push : drain d'outbox, batching, tombstones, garde de taille

Le push lit l'état **courant** des lignes sales (sync state-based, §1.1 : un rejeu est idempotent par construction), par lots de 100, tombstones avec `ciphertext`/`nonce` **omis** (forme acceptée par le serveur, note 4b), et la suppression d'entrée d'outbox est conditionnée au `dirtied_at` capturé — une écriture locale pendant le push survit au drain.

**Files:**
- Test: `src/sync/engine.push.test.ts` (l'implémentation est déjà en place depuis T11 — cette tâche la met sous test et sous sabotage)

**Interfaces:**
- Consumes: T11 (`SyncEngine.pushPhase` via `syncNow`), harnais T10/T11.

- [ ] **Step 1 : Écrire le spec du push (échec possible = bug réel, pas TDD)**

Créer `src/sync/engine.push.test.ts` :

```ts
// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { makeDevice, syncMerging, type TestDevice } from "@/test-harness/engine";
import { FakeSyncServer } from "@/test-harness/FakeSyncServer";

let server: FakeSyncServer;
let a: TestDevice;

beforeEach(async () => {
	server = new FakeSyncServer();
	a = await makeDevice(server);
});
afterEach(() => a?.driver.close());

async function outboxCount(d: TestDevice): Promise<number> {
	const rows = await d.driver.select<{ n: number }>("SELECT COUNT(*) AS n FROM sync_outbox");
	return rows[0].n;
}

describe("push phase", () => {
	it("drains a large outbox in batches of at most 100", async () => {
		for (let i = 0; i < 230; i++) {
			await a.repo.createTask({ title: `task ${i}` });
		}
		const pullsBefore = server.requestCount;
		await syncMerging(a);
		expect(server.dump().filter((r) => r.entityType === "task")).toHaveLength(230);
		expect(await outboxCount(a)).toBe(0);
		// 230 changes at ≤100 per batch = at least 3 pushes (plus the pulls).
		expect(server.requestCount - pullsBefore).toBeGreaterThanOrEqual(4);
	});

	it("pushes a purge as a bare tombstone the server-side CHECK accepts", async () => {
		const task = await a.repo.createTask({ title: "doomed" });
		await syncMerging(a);
		await a.repo.deleteTask(task.id);
		// FakeSyncServer throws on a payload-carrying tombstone, mirroring the
		// server's records_tombstone_shape — reaching the assertions below
		// proves the wire shape is right.
		await syncMerging(a);
		const stored = server.dump().find((r) => r.id === task.id);
		expect(stored).toMatchObject({ purged: true, ciphertext: null, nonce: null });
		expect(await outboxCount(a)).toBe(0);
	});

	it("re-pushes the fresh state when a local write lands during the push", async () => {
		const task = await a.repo.createTask({ title: "v1" });
		// A write arrives while the push request is in flight: the outbox entry
		// is replaced under the engine's feet with a fresher dirtied_at.
		const realPush = server.push.bind(server);
		let interfered = false;
		server.push = ((changes) => {
			const out = realPush(changes);
			if (!interfered) {
				interfered = true;
				// Direct driver write: better-sqlite3 executes synchronously
				// beneath its promise wrapper, so the row AND its outbox entry
				// (via the UPDATE trigger) are fresher before push() even
				// returns — deterministic, no microtask race.
				void a.driver.execute(
					"UPDATE tasks SET title = 'v2 — mid-push', updated_at = '2026-12-31T00:00:00.000Z' WHERE id = ?",
					[task.id],
				);
			}
			return out;
		}) as typeof server.push;
		await syncMerging(a);
		const stored = server.dump().find((r) => r.id === task.id);
		const decrypted = JSON.parse(
			await a.cipher.decrypt("task", task.id, stored?.ciphertext ?? "", stored?.nonce ?? ""),
		) as { title: string };
		expect(decrypted.title).toBe("v2 — mid-push");
		expect(await outboxCount(a)).toBe(0);
	});

	it("quarantines an oversized record instead of wedging the whole outbox", async () => {
		const huge = await a.repo.createTask({ title: "huge" });
		await a.repo.updateTask(huge.id, { description: "x".repeat(70_000) });
		const fine = await a.repo.createTask({ title: "fine" });
		await syncMerging(a);
		// The valid record went through; the oversized one is parked, visibly.
		expect(server.dump().map((r) => r.id)).toContain(fine.id);
		expect(server.dump().map((r) => r.id)).not.toContain(huge.id);
		const parked = await a.driver.select<{ entity_id: string; direction: string; reason: string }>(
			"SELECT entity_id, direction, reason FROM sync_quarantine",
		);
		expect(parked).toEqual([
			{ entity_id: huge.id, direction: "push", reason: "payload-too-large" },
		]);
		expect(await outboxCount(a)).toBe(0);
	});

	it("drops an outbox entry pointing at a physically-deleted row (pre-4a ghost)", async () => {
		await a.driver.execute(
			"INSERT INTO sync_outbox (entity_type, entity_id, dirtied_at) VALUES ('task', 'ghost-1', '2026-01-01T00:00:00.000Z')",
		);
		await syncMerging(a);
		expect(await outboxCount(a)).toBe(0);
		expect(server.dump()).toHaveLength(0);
	});
});
```

- [ ] **Step 2 : Exécuter — tout doit passer sur l'implémentation de T11**

Run: `pnpm test:run src/sync/engine.push.test.ts`
Attendu : PASS. Un test jamais vu rouge ne prouvant rien, les deux sabotages suivants sont obligatoires.

- [ ] **Step 3 : Commit**

```bash
git add src/sync/engine.push.test.ts
git commit -m 'test: :white_check_mark: pin the push phase batching, tombstones and drain guard'
```

- [ ] **Step 4 : [SABOTAGE] Prouver la garde `dirtied_at` du drain**

Dans `src/sync/engine.ts`, dans `pushPhase`, dans le DELETE final, remplacer la requête par `"DELETE FROM sync_outbox WHERE entity_type = ? AND entity_id = ?"` et retirer `entry.dirtied_at` des paramètres (la clause `AND dirtied_at = ?` disparaît — **ne toucher qu'au DELETE du push**, pas à celui de la quarantaine too-large).

```bash
git diff --stat -- src/sync/engine.ts   # doit lister le fichier
grep -c 'AND dirtied_at = ?' src/sync/engine.ts   # doit afficher 1 (avant sabotage : 2 — celui du too-large reste)
pnpm test:run src/sync/engine.push.test.ts   # 're-pushes the fresh state when a local write lands during the push' DOIT échouer (le serveur garde v1)
git checkout -- src/sync/engine.ts
pnpm test:run src/sync/engine.push.test.ts   # tout DOIT repasser
```

- [ ] **Step 5 : [SABOTAGE] Prouver la forme des tombstones poussés**

Dans `src/sync/engine.ts`, dans `pushPhase`, remplacer `changes.push({ entityType, id: entry.entity_id, purged: true });` par `changes.push({ entityType, id: entry.entity_id, purged: true, ciphertext: "AA==", nonce: "AA==" });`.

```bash
git diff --stat -- src/sync/engine.ts   # doit lister le fichier
grep -c 'purged: true, ciphertext' src/sync/engine.ts   # doit afficher 1 (avant sabotage : 0)
pnpm test:run src/sync/engine.push.test.ts   # 'pushes a purge as a bare tombstone…' DOIT échouer (FakeSyncServer jette « tombstone carries a ciphertext », l'exact miroir du 400 serveur)
git checkout -- src/sync/engine.ts
pnpm test:run src/sync/engine.push.test.ts   # tout DOIT repasser
```

---

### Tâche 13 : Première synchronisation — `resolveFirstSync` (§6.4)

Le garde-fou existe depuis T11 (`firstSyncGate` + statut `awaiting-first-sync`) ; cette tâche livre la résolution. **Fusionner** = poser le drapeau et relancer un cycle normal (le LWW §5 fait le reste). **Remplacer** = effacer physiquement les cinq tables locales puis vider l'outbox **en dernier dans la même transaction** (les DELETE la remplissent via les triggers — la vider d'abord repousserait les données abandonnées, l'union silencieuse exacte que le §6.4 interdit), poser le drapeau, re-puller tout. La sauvegarde JSON automatique avant « Remplacer » est le dialogue de 4d, qui appellera cette API.

**Files:**
- Modify: `src/sync/engine.ts` (remplacer le stub `resolveFirstSync`)
- Test: `src/sync/engine.first-sync.test.ts`

**Interfaces:**
- Consumes: T11.
- Produces: `SyncEngine.resolveFirstSync(choice: "merge" | "replace"): Promise<void>` — **contrat consommé par le dialogue 4d**.

- [ ] **Step 1 : Écrire le spec (échec attendu)**

Créer `src/sync/engine.first-sync.test.ts` :

```ts
// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { makeDevice, syncMerging, type TestDevice } from "@/test-harness/engine";
import { FakeSyncServer } from "@/test-harness/FakeSyncServer";
import { getSyncState } from "./state";

let server: FakeSyncServer;
let a: TestDevice;
let b: TestDevice;

beforeEach(async () => {
	server = new FakeSyncServer();
	a = await makeDevice(server);
	b = await makeDevice(server);
	// A seeds the account; B is the second device arriving with its own data.
	await a.repo.createTask({ title: "from the account" });
	await syncMerging(a);
	await b.repo.createTask({ title: "local on B" });
});
afterEach(() => {
	a?.driver.close();
	b?.driver.close();
});

describe("first sync (§6.4)", () => {
	it("gates when local and remote are both non-empty: nothing applied, nothing pushed", async () => {
		const seqBefore = server.seqCounter;
		await b.engine.syncNow();
		expect(b.engine.getStatus()).toBe("awaiting-first-sync");
		expect(server.seqCounter).toBe(seqBefore);
		const titles = await b.driver.select<{ title: string }>("SELECT title FROM tasks");
		expect(titles).toEqual([{ title: "local on B" }]);
		expect(await getSyncState(b.driver, "cursor")).toBeNull();
	});

	it("merge: both datasets survive, reconciled by normal LWW", async () => {
		await b.engine.syncNow();
		await b.engine.resolveFirstSync("merge");
		await syncMerging(a);
		for (const d of [a, b]) {
			const titles = await d.driver.select<{ title: string }>(
				"SELECT title FROM tasks ORDER BY title",
			);
			expect(titles.map((t) => t.title)).toEqual(["from the account", "local on B"]);
		}
	});

	it("replace: local data is wiped, never pushed, and the account is re-downloaded", async () => {
		await b.engine.syncNow();
		const seqBefore = server.seqCounter;
		await b.engine.resolveFirstSync("replace");
		// Nothing of B's abandoned data ever reached the server (§6.4: the
		// outbox is emptied before the first push).
		expect(server.seqCounter).toBe(seqBefore);
		const titles = await b.driver.select<{ title: string }>("SELECT title FROM tasks");
		expect(titles).toEqual([{ title: "from the account" }]);
		const outbox = await b.driver.select("SELECT * FROM sync_outbox");
		expect(outbox).toHaveLength(0);
	});

	it("asks only once: after resolution the gate never rises again", async () => {
		await b.engine.syncNow();
		await b.engine.resolveFirstSync("merge");
		await b.repo.createTask({ title: "later" });
		await b.engine.syncNow();
		expect(b.engine.getStatus()).toBe("idle");
	});

	it("does not gate a fresh empty device", async () => {
		const c = await makeDevice(server);
		await c.engine.syncNow();
		expect(c.engine.getStatus()).toBe("idle");
		expect(await c.driver.select("SELECT id FROM tasks")).toHaveLength(1);
		c.driver.close();
	});

	it("does not gate against an empty account", async () => {
		const emptyServer = new FakeSyncServer();
		const d = await makeDevice(emptyServer);
		await d.repo.createTask({ title: "purely local until now" });
		await d.engine.syncNow();
		expect(d.engine.getStatus()).toBe("idle");
		expect(emptyServer.dump()).toHaveLength(1);
		d.driver.close();
	});
});
```

- [ ] **Step 2 : Vérifier l'échec**

Run: `pnpm test:run src/sync/engine.first-sync.test.ts`
Attendu : ÉCHEC — le stub `resolveFirstSync` jette « not implemented yet » (les deux derniers tests, sans résolution, passent déjà : le garde-fou de T11 les couvre).

- [ ] **Step 3 : Implémenter**

Dans `src/sync/engine.ts`, remplacer le stub par :

```ts
	/**
	 * §6.4 — the answer to the first-sync question, called by the 4d dialog.
	 * merge: flag and run a normal cycle, the per-field LWW reconciles.
	 * replace: wipe the five local tables PHYSICALLY (nothing was ever pushed,
	 * so there is nothing to tombstone), and empty the outbox LAST inside the
	 * same transaction — the deletes re-fill it through the triggers, and an
	 * outbox emptied first would push the abandoned data right back up: the
	 * exact silent union §6.4 exists to prevent. The automatic JSON backup
	 * before "replace" belongs to the 4d dialog, upstream of this call.
	 */
	async resolveFirstSync(choice: "merge" | "replace"): Promise<void> {
		const db = this.deps.db;
		if (choice === "replace") {
			await db.transaction(async (tx) => {
				await tx.execute("DELETE FROM task_tags");
				await tx.execute("DELETE FROM tasks");
				await tx.execute("DELETE FROM tags");
				await tx.execute("DELETE FROM projects");
				await tx.execute("DELETE FROM project_groups");
				await tx.execute("DELETE FROM sync_outbox");
				await setSyncState(tx, "first_sync_resolved", "1");
			});
		} else {
			await setSyncState(db, "first_sync_resolved", "1");
		}
		this.setStatus("idle");
		await this.syncNow();
	}
```

- [ ] **Step 4 : Vérifier le vert**

Run: `pnpm test:run src/sync/engine.first-sync.test.ts` — Attendu : PASS.
Run: `pnpm test:run` — Attendu : tout vert.

- [ ] **Step 5 : Commit**

```bash
git add src/sync/engine.ts src/sync/engine.first-sync.test.ts
git commit -m 'feat: :sparkles: gate the first sync and resolve it by merge or replace'
```

- [ ] **Step 6 : [SABOTAGE] Prouver l'ordre « vider l'outbox en dernier »**

Dans `src/sync/engine.ts`, dans `resolveFirstSync`, déplacer la ligne `await tx.execute("DELETE FROM sync_outbox");` en PREMIÈRE position du callback de transaction (avant le DELETE de task_tags).

```bash
git diff --stat -- src/sync/engine.ts   # doit lister le fichier
# La ligne sync_outbox doit maintenant précéder task_tags dans le fichier :
grep -n 'DELETE FROM sync_outbox"\|DELETE FROM task_tags"' src/sync/engine.ts | head -2   # sync_outbox doit apparaître AVANT task_tags
pnpm test:run src/sync/engine.first-sync.test.ts   # 'replace: local data is wiped, never pushed…' DOIT échouer (seq serveur avance : les tombstones des DELETE sont partis au push)
git checkout -- src/sync/engine.ts
pnpm test:run src/sync/engine.first-sync.test.ts   # tout DOIT repasser
```

---

### Tâche 14 : Déclencheurs §4.2, repository notifiant, branchement inerte (§6.1, §8.2)

Quatre déclencheurs : démarrage, retour de focus, toutes les 5 minutes, 2 s (debounce) après une écriture locale. L'écriture locale est signalée par un décorateur `Proxy` autour du `TodoRepository` — le moteur **observe**, le repository reste inchangé (spec §1). Le branchement dans `App.tsx` est **inerte** sans `server_url` : le moteur n'est jamais instancié, aucune requête, aucun timer (§6.1) — épinglé par le test de non-régression §8.2.

**Files:**
- Create: `src/sync/scheduler.ts`, `src/sync/notifying-repository.ts`, `src/sync/init.ts`
- Test: `src/sync/scheduler.test.ts`, `src/sync/init.test.ts`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `SyncEngine` (T11/T13), `AuthorizedHttp`/`getServerInfo` (T5), `HttpSyncTransport` (T7), `RequestGate` (T6), `TauriRecordCipher` (T3), `getSyncState` (T3), `lock` (`@/crypto`), `TodoRepository` (`@/db/repository`).
- Produces:
  - `SYNC_INTERVAL_MS = 300_000`, `WRITE_DEBOUNCE_MS = 2_000` ; `class SyncScheduler { constructor(engine: { syncNow(): Promise<void> }, opts?: { intervalMs?: number; debounceMs?: number; windowTarget?: Window | null }); start(): void; notifyLocalWrite(): void; stop(): void; }` ;
  - `withWriteNotifications(repo: TodoRepository, onWrite: () => void): TodoRepository` ;
  - `initSync(db: DbDriver, repository: TodoRepository, deps: { fetchImpl: FetchLike; cipher?: RecordCipher }): Promise<SyncRuntime | null>` avec `SyncRuntime = { engine: SyncEngine; scheduler: SyncScheduler; repository: TodoRepository }` — **contrat consommé par 4d** (l'écran de réglages relira `initSync` après connexion/déconnexion).

- [ ] **Step 1 : Écrire les tests (échec attendu)**

Créer `src/sync/scheduler.test.ts` :

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SyncScheduler, SYNC_INTERVAL_MS, WRITE_DEBOUNCE_MS } from "./scheduler";

let syncNow: ReturnType<typeof vi.fn>;
let scheduler: SyncScheduler;

beforeEach(() => {
	vi.useFakeTimers();
	syncNow = vi.fn(async () => undefined);
	scheduler = new SyncScheduler({ syncNow }, { windowTarget: null });
});
afterEach(() => {
	scheduler.stop();
	vi.useRealTimers();
});

describe("SyncScheduler (§4.2 triggers)", () => {
	it("syncs immediately on start", () => {
		scheduler.start();
		expect(syncNow).toHaveBeenCalledTimes(1);
	});

	it("syncs every 5 minutes", () => {
		scheduler.start();
		vi.advanceTimersByTime(SYNC_INTERVAL_MS * 2);
		expect(syncNow).toHaveBeenCalledTimes(3); // start + 2 intervals
	});

	it("debounces local writes: a burst collapses to one sync, 2s after the last", () => {
		scheduler.start();
		syncNow.mockClear();
		scheduler.notifyLocalWrite();
		vi.advanceTimersByTime(1_000);
		scheduler.notifyLocalWrite();
		vi.advanceTimersByTime(1_000);
		scheduler.notifyLocalWrite();
		expect(syncNow).not.toHaveBeenCalled();
		vi.advanceTimersByTime(WRITE_DEBOUNCE_MS);
		expect(syncNow).toHaveBeenCalledTimes(1);
	});

	it("syncs when the window regains focus", () => {
		const listeners = new Map<string, EventListener>();
		const fakeWindow = {
			addEventListener: (type: string, l: EventListener) => listeners.set(type, l),
			removeEventListener: (type: string) => listeners.delete(type),
		} as unknown as Window;
		const focused = new SyncScheduler({ syncNow }, { windowTarget: fakeWindow });
		focused.start();
		syncNow.mockClear();
		listeners.get("focus")?.(new Event("focus"));
		expect(syncNow).toHaveBeenCalledTimes(1);
		focused.stop();
		expect(listeners.has("focus")).toBe(false);
	});

	it("stop() silences every trigger", () => {
		scheduler.start();
		scheduler.notifyLocalWrite();
		scheduler.stop();
		syncNow.mockClear();
		vi.advanceTimersByTime(SYNC_INTERVAL_MS * 3);
		expect(syncNow).not.toHaveBeenCalled();
	});
});
```

Créer `src/sync/init.test.ts` :

```ts
// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ALL_MIGRATIONS } from "@/db/migrations";
import { runMigrations } from "@/db/migrations/run-migrations";
import { SqliteRepository } from "@/db/sqlite-repository";
import { BetterSqliteDriver } from "@/test-harness/BetterSqliteDriver";
import { FakeRecordCipher } from "@/test-harness/FakeRecordCipher";
import { initSync } from "./init";
import { withWriteNotifications } from "./notifying-repository";
import { setSyncState } from "./state";

let driver: BetterSqliteDriver;
let repo: SqliteRepository;

beforeEach(async () => {
	vi.useFakeTimers();
	driver = new BetterSqliteDriver();
	await runMigrations(driver, ALL_MIGRATIONS);
	repo = new SqliteRepository(driver);
});
afterEach(() => {
	driver?.close();
	vi.useRealTimers();
});

describe("initSync — sync off means OFF (§6.1, §8.2)", () => {
	it("without server_url: no engine, no request, no timer — ever", async () => {
		const fetchSpy = vi.fn();
		const runtime = await initSync(driver, repo, {
			fetchImpl: fetchSpy as unknown as typeof fetch,
			cipher: new FakeRecordCipher(),
		});
		expect(runtime).toBeNull();
		// Local writes and hours of uptime must not wake anything up.
		await repo.createTask({ title: "purely local" });
		vi.advanceTimersByTime(60 * 60 * 1000);
		expect(fetchSpy).not.toHaveBeenCalled();
		expect(vi.getTimerCount()).toBe(0);
	});

	it("with a server_url but no refresh token (signed out): stays inert", async () => {
		await setSyncState(driver, "server_url", "https://sync.example");
		const fetchSpy = vi.fn();
		const runtime = await initSync(driver, repo, {
			fetchImpl: fetchSpy as unknown as typeof fetch,
			cipher: new FakeRecordCipher(),
		});
		expect(runtime).toBeNull();
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it("with a full session: starts the scheduler and syncs through the given fetch", async () => {
		await setSyncState(driver, "server_url", "https://sync.example");
		await setSyncState(driver, "refresh_token", "refresh-1");
		const fetchSpy = vi.fn(
			async () =>
				new Response(JSON.stringify({ statusCode: 500 }), { status: 500 }),
		);
		const runtime = await initSync(driver, repo, {
			fetchImpl: fetchSpy as unknown as typeof fetch,
			cipher: new FakeRecordCipher(),
		});
		expect(runtime).not.toBeNull();
		await vi.runOnlyPendingTimersAsync();
		// The start trigger fired and reached the network layer (server-info).
		expect(fetchSpy).toHaveBeenCalled();
		runtime?.scheduler.stop();
	});
});

describe("withWriteNotifications", () => {
	it("notifies after a write, not after a read", async () => {
		const onWrite = vi.fn();
		const wrapped = withWriteNotifications(repo, onWrite);
		await wrapped.getTasks();
		expect(onWrite).not.toHaveBeenCalled();
		await wrapped.createTask({ title: "hello" });
		expect(onWrite).toHaveBeenCalledTimes(1);
	});
});
```

- [ ] **Step 2 : Vérifier l'échec**

Run: `pnpm test:run src/sync/scheduler.test.ts src/sync/init.test.ts`
Attendu : ÉCHEC — modules inexistants.

- [ ] **Step 3 : Implémenter**

Créer `src/sync/scheduler.ts` :

```ts
export const SYNC_INTERVAL_MS = 5 * 60_000;
export const WRITE_DEBOUNCE_MS = 2_000;

/**
 * Spec §4.2 (v1): sync on start, on window focus, every 5 minutes, and 2s
 * after a local write (debounced). No WebSocket — real time is a later
 * improvement that does not change the protocol. Overlapping triggers are
 * harmless: the engine is single-flight and coalesces reruns.
 */
export class SyncScheduler {
	private readonly intervalMs: number;
	private readonly debounceMs: number;
	private readonly windowTarget: Window | null;
	private interval: ReturnType<typeof setInterval> | null = null;
	private debounce: ReturnType<typeof setTimeout> | null = null;
	private readonly onFocus = () => void this.engine.syncNow();

	constructor(
		private readonly engine: { syncNow(): Promise<void> },
		opts: { intervalMs?: number; debounceMs?: number; windowTarget?: Window | null } = {},
	) {
		this.intervalMs = opts.intervalMs ?? SYNC_INTERVAL_MS;
		this.debounceMs = opts.debounceMs ?? WRITE_DEBOUNCE_MS;
		this.windowTarget =
			opts.windowTarget !== undefined
				? opts.windowTarget
				: typeof window !== "undefined"
					? window
					: null;
	}

	start(): void {
		void this.engine.syncNow();
		this.interval = setInterval(() => void this.engine.syncNow(), this.intervalMs);
		this.windowTarget?.addEventListener("focus", this.onFocus);
	}

	notifyLocalWrite(): void {
		if (this.debounce) clearTimeout(this.debounce);
		this.debounce = setTimeout(() => {
			this.debounce = null;
			void this.engine.syncNow();
		}, this.debounceMs);
	}

	stop(): void {
		if (this.interval) clearInterval(this.interval);
		if (this.debounce) clearTimeout(this.debounce);
		this.interval = null;
		this.debounce = null;
		this.windowTarget?.removeEventListener("focus", this.onFocus);
	}
}
```

Créer `src/sync/notifying-repository.ts` :

```ts
import type { TodoRepository } from "@/db/repository";

/**
 * The engine OBSERVES the repository (spec §1): the UI keeps its writes local
 * and synchronous, and this decorator fires the §4.2 debounce after each one.
 * A read allowlist rather than a write list: a repository method added
 * tomorrow defaults to "notifies", which costs at worst a redundant sync —
 * the safe direction.
 */
const READ_ONLY_METHODS = new Set<string>([
	"getTasks",
	"getTask",
	"getArchivedTasks",
	"getProjects",
	"getProjectGroups",
	"getTags",
	"getSettings",
	"isTagUsedInProjectTasks",
	"previewImport",
]);

export function withWriteNotifications(
	repo: TodoRepository,
	onWrite: () => void,
): TodoRepository {
	return new Proxy(repo, {
		get(target, prop, receiver) {
			const value = Reflect.get(target, prop, receiver) as unknown;
			if (typeof value !== "function") return value;
			const method = value.bind(target) as (...args: unknown[]) => unknown;
			if (READ_ONLY_METHODS.has(String(prop))) return method;
			return async (...args: unknown[]) => {
				const out = await method(...args);
				onWrite();
				return out;
			};
		},
	}) as TodoRepository;
}
```

(Ajuster `READ_ONLY_METHODS` aux méthodes de lecture réellement présentes dans `TodoRepository` — la liste ci-dessus vient de `src/db/repository.ts` ; une méthode oubliée notifie en trop, jamais en moins.)

Créer `src/sync/init.ts` :

```ts
import { lock } from "@/crypto";
import type { DbDriver } from "@/db/driver";
import type { TodoRepository } from "@/db/repository";
import { AuthorizedHttp, getServerInfo } from "./auth";
import { RequestGate } from "./backoff";
import { TauriRecordCipher } from "./cipher";
import { SyncEngine } from "./engine";
import type { FetchLike } from "./http";
import { withWriteNotifications } from "./notifying-repository";
import { SyncScheduler } from "./scheduler";
import { getSyncState } from "./state";
import { HttpSyncTransport } from "./transport";
import type { RecordCipher } from "./types";

export interface SyncRuntime {
	engine: SyncEngine;
	scheduler: SyncScheduler;
	repository: TodoRepository;
}

/**
 * Spec §6.1: without a server_url the engine is NEVER instantiated — no
 * timer, no request, no login screen, zero added latency. Pinned by the §8.2
 * non-regression test. fetch is injected by the caller (App passes
 * @tauri-apps/plugin-http's fetch) so this module stays testable under node.
 */
export async function initSync(
	db: DbDriver,
	repository: TodoRepository,
	deps: { fetchImpl: FetchLike; cipher?: RecordCipher },
): Promise<SyncRuntime | null> {
	const serverUrl = await getSyncState(db, "server_url");
	if (!serverUrl) return null;
	const refreshToken = await getSyncState(db, "refresh_token");
	if (!refreshToken) return null;

	const http = new AuthorizedHttp({ db, fetchImpl: deps.fetchImpl, baseUrl: serverUrl });
	const engine = new SyncEngine({
		db,
		transport: new HttpSyncTransport(http, new RequestGate()),
		cipher: deps.cipher ?? new TauriRecordCipher(),
		getServerInfo: () => getServerInfo(deps.fetchImpl, serverUrl),
	});
	engine.onStatus((status) => {
		// §7 revoked device: a permanent 401 locks the vault and erases the
		// in-memory keys. The local SQLite is untouched — the app stays usable.
		if (status === "reauth-required") void lock();
	});
	const scheduler = new SyncScheduler(engine);
	const notifying = withWriteNotifications(repository, () =>
		scheduler.notifyLocalWrite(),
	);
	scheduler.start();
	return { engine, scheduler, repository: notifying };
}
```

- [ ] **Step 4 : Vérifier le vert**

Run: `pnpm test:run src/sync/scheduler.test.ts src/sync/init.test.ts` — Attendu : PASS.

- [ ] **Step 5 : Brancher dans `App.tsx`**

Dans `src/App.tsx`, dans l'effet d'initialisation (autour des lignes 115-118), après :

```ts
				const driver = adaptDatabase(db);
				await runMigrations(driver, ALL_MIGRATIONS);
				await backfillSortKeys(driver);
				setRepository(createRepository(db));
```

ajouter :

```ts
				// Sync stays entirely inert without a configured server (§6.1);
				// plan 4d's settings screen is what will ever set server_url.
				const syncRuntime = await initSync(driver, getRepository(), {
					fetchImpl: httpFetch as FetchLike,
				});
				if (syncRuntime) setRepository(syncRuntime.repository);
```

avec les imports :

```ts
import { fetch as httpFetch } from "@tauri-apps/plugin-http";
import type { FetchLike } from "@/sync/http";
import { initSync } from "@/sync/init";
```

(`getRepository` est déjà importé dans App.tsx.) Vérifier que `pnpm build` compile — App.tsx n'est pas couvert par vitest, c'est le test d'init qui porte la logique.

- [ ] **Step 6 : Suite complète et build**

```bash
pnpm test:run
pnpm build
```

Attendu : tout vert, build propre.

- [ ] **Step 7 : Commit**

```bash
git add src/sync/scheduler.ts src/sync/scheduler.test.ts src/sync/notifying-repository.ts src/sync/init.ts src/sync/init.test.ts src/App.tsx
git commit -m 'feat: :sparkles: wire the sync triggers, inert without a configured server'
```

- [ ] **Step 8 : [SABOTAGE] Prouver le test §8.2 « sync désactivée »**

Dans `src/sync/init.ts`, remplacer `if (!serverUrl) return null;` par `if (!serverUrl) { /* fall through */ }` et sur la ligne suivante remplacer `const refreshToken = …` en gardant le flux (le moteur s'instancie alors avec `baseUrl` nul). Plus simple et équivalent : supprimer uniquement la ligne `if (!serverUrl) return null;`.

```bash
git diff --stat -- src/sync/init.ts        # doit lister le fichier
grep -c 'if (!serverUrl) return null;' src/sync/init.ts   # doit afficher 0 (avant sabotage : 1)
pnpm test:run src/sync/init.test.ts   # 'without server_url: no engine, no request, no timer' DOIT échouer
git checkout -- src/sync/init.ts
pnpm test:run src/sync/init.test.ts   # tout DOIT repasser
```

---

### Tâche 15 : Convergence §8.1 — le livrable à part entière

Deux appareils réels (SQLite migré, triggers, repository de production), un `FakeSyncServer`, une séquence d'opérations aléatoires **déterministe** (PRNG semé, `crypto.randomUUID` stubbé en compteur, horloge factice) appliquée hors ligne, puis reconnexion — et la triple assertion du spec :

1. **A et B strictement identiques** après convergence (valeurs, stamps, extras, tags, tombstones) ;
2. **le même état final quel que soit l'ordre de reconnexion** (le même univers rejoué en ordre inverse aboutit aux mêmes valeurs) ;
3. **point fixe** : une ronde complète de sync sans écriture locale ne pousse plus rien (anti-oscillation §4.1) — c'est le critère d'arrêt de `converge()`, donc il est prouvé à chaque exécution.

Le déterminisme n'est pas du confort : sans ids et horloge rejouables, l'assertion n° 2 est incomparables d'un univers à l'autre. Un prologue force en outre un **conflit à égalité stricte de timestamp** sur le même champ (title), pour que le départage §5 soit exercé à chaque exécution — c'est ce qui rend le sabotage détectable de façon déterministe, pas probabiliste.

**Files:**
- Test: `src/sync/convergence.test.ts`

**Interfaces:**
- Consumes: tout le harnais (T10, T11), `getSyncState` (T3).

- [ ] **Step 1 : Écrire le test**

Créer `src/sync/convergence.test.ts` :

```ts
// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BetterSqliteDriver } from "@/test-harness/BetterSqliteDriver";
import { makeDevice, syncMerging, type TestDevice } from "@/test-harness/engine";
import { FakeSyncServer } from "@/test-harness/FakeSyncServer";

/** Deterministic PRNG — the whole scenario replays from its seed. */
function mulberry32(seed: number): () => number {
	let s = seed >>> 0;
	return () => {
		s = (s + 0x6d2b79f5) >>> 0;
		let t = s;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

const BASE_TIME = Date.parse("2026-08-25T12:00:00.000Z");
const OPS_PER_SEED = 60;

afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

/** Counter-based UUIDs: both universes of a seed mint identical ids. */
function stubDeterministicIds(): void {
	let counter = 0;
	vi.spyOn(globalThis.crypto, "randomUUID").mockImplementation(() => {
		counter += 1;
		return `00000000-0000-4000-8000-${String(counter).padStart(12, "0")}` as `${string}-${string}-${string}-${string}-${string}`;
	});
}

interface Pools {
	tasks: string[];
	projects: string[];
	tags: string[];
}

function pick<T>(rng: () => number, list: T[]): T | undefined {
	if (list.length === 0) return undefined;
	return list[Math.floor(rng() * list.length)];
}

/**
 * One random offline operation through the PRODUCTION repository API. Invalid
 * random targets (e.g. completing an already-purged task) just no-op: the
 * scenario stays deterministic because the guard outcome is deterministic too.
 */
async function randomOp(
	rng: () => number,
	device: TestDevice,
	pools: Pools,
	label: string,
): Promise<void> {
	const roll = Math.floor(rng() * 12);
	try {
		switch (roll) {
			case 0:
			case 1: {
				const task = await device.repo.createTask({
					title: `task ${label}`,
					projectId: pick(rng, pools.projects) ?? undefined,
				});
				pools.tasks.push(task.id);
				return;
			}
			case 2: {
				const id = pick(rng, pools.tasks);
				if (id) await device.repo.updateTask(id, { title: `renamed ${label}` });
				return;
			}
			case 3: {
				const id = pick(rng, pools.tasks);
				if (id)
					await device.repo.updateTask(id, {
						priority: (["none", "low", "medium", "high"] as const)[Math.floor(rng() * 4)],
					});
				return;
			}
			case 4: {
				const id = pick(rng, pools.tasks);
				if (id) await device.repo.completeTask(id);
				return;
			}
			case 5: {
				const id = pick(rng, pools.tasks);
				if (id) await device.repo.archiveTask(id);
				return;
			}
			case 6: {
				const id = pick(rng, pools.tasks);
				if (id) await device.repo.deleteTask(id);
				return;
			}
			case 7: {
				const project = await device.repo.createProject({ name: `project ${label}` });
				pools.projects.push(project.id);
				return;
			}
			case 8: {
				const id = pick(rng, pools.projects);
				if (id) await device.repo.deleteProject(id);
				return;
			}
			case 9: {
				const tag = await device.repo.createTag({ name: `tag ${label}` });
				pools.tags.push(tag.id);
				return;
			}
			case 10: {
				const task = pick(rng, pools.tasks);
				const tag = pick(rng, pools.tags);
				if (task && tag) await device.repo.updateTask(task, { tags: [tag] });
				return;
			}
			case 11: {
				const prev = pick(rng, pools.tasks) ?? null;
				const id = pick(rng, pools.tasks);
				if (id && prev && id !== prev) await device.repo.moveTask(id, prev, null);
				return;
			}
		}
	} catch {
		// Deterministically-invalid target: skipping is part of the scenario.
	}
}

/** Everything user-visible plus sync metadata, normalised for comparison. */
async function fullDump(driver: BetterSqliteDriver): Promise<unknown> {
	const tables: Array<[string, string[]]> = [
		["tasks", ["title", "description", "project_id", "priority", "due_date", "sort_key", "completed_at", "deleted_at"]],
		["projects", ["name", "color", "icon", "group_id", "sort_key", "deleted_at"]],
		["tags", ["name", "color", "project_id", "deleted_at"]],
		["project_groups", ["name", "color", "sort_key"]],
	];
	const out: Record<string, unknown> = {};
	for (const [table, cols] of tables) {
		out[table] = await driver.select(
			`SELECT id, ${cols.join(", ")}, field_updated_at, sync_extra FROM ${table} WHERE purged_at IS NULL ORDER BY id`,
		);
		// Tombstones: only identity matters — purge instants are device-local.
		out[`${table}:purged`] = await driver.select(
			`SELECT id FROM ${table} WHERE purged_at IS NOT NULL ORDER BY id`,
		);
	}
	out.task_tags = await driver.select(
		"SELECT task_id, tag_id FROM task_tags ORDER BY task_id, tag_id",
	);
	return out;
}

/** fullDump minus the stamps — the cross-universe comparison: repair writes
 * (orphan reattachment, tag dedup) are stamped at sync time, which differs
 * between reconnection orders; their VALUES must not. */
async function valuesDump(driver: BetterSqliteDriver): Promise<unknown> {
	const dump = (await fullDump(driver)) as Record<string, Array<Record<string, unknown>>>;
	for (const rows of Object.values(dump)) {
		for (const row of rows) {
			delete row.field_updated_at;
		}
	}
	return dump;
}

/** Full sync rounds until a whole round pushes nothing: the §4.1 fixpoint.
 * Not converging within the bound IS a failure — oscillation is the bug
 * class this file exists to catch. */
async function converge(server: FakeSyncServer, devices: TestDevice[]): Promise<void> {
	for (let round = 0; round < 8; round++) {
		const before = server.seqCounter;
		for (const device of devices) {
			vi.setSystemTime(Date.now() + 1); // syncs never share an op's clock tick
			await syncMerging(device);
		}
		if (server.seqCounter === before) return;
	}
	throw new Error("no fixpoint after 8 full sync rounds: the devices oscillate");
}

interface UniverseResult {
	dumpA: unknown;
	dumpB: unknown;
	values: unknown;
}

async function runUniverse(seed: number, order: "ab" | "ba"): Promise<UniverseResult> {
	vi.useFakeTimers({ now: BASE_TIME });
	stubDeterministicIds();
	const rng = mulberry32(seed);
	const server = new FakeSyncServer();
	const a = await makeDevice(server);
	const b = await makeDevice(server);

	try {
		// Prologue: a shared task, then a guaranteed same-millisecond conflict
		// on the same field — the §5 tie-break runs on EVERY execution.
		const shared = await a.repo.createTask({ title: "shared" });
		vi.setSystemTime(BASE_TIME + 10);
		await syncMerging(a);
		await syncMerging(b);
		vi.setSystemTime(BASE_TIME + 20);
		await a.repo.updateTask(shared.id, { title: "A wrote at the tie" });
		await b.repo.updateTask(shared.id, { title: "B wrote at the tie" });

		// Offline phase: the SAME deterministic op sequence in every universe.
		const poolsA: Pools = { tasks: [shared.id], projects: [], tags: [] };
		const poolsB: Pools = { tasks: [shared.id], projects: [], tags: [] };
		for (let i = 0; i < OPS_PER_SEED; i++) {
			const onA = rng() < 0.5;
			vi.setSystemTime(Date.now() + Math.floor(rng() * 3)); // 0 keeps ties possible
			await randomOp(rng, onA ? a : b, onA ? poolsA : poolsB, `${seed}.${i}`);
		}

		// Reconnection, in this universe's order.
		const devices = order === "ab" ? [a, b] : [b, a];
		vi.setSystemTime(BASE_TIME + 100_000);
		await converge(server, devices);

		const [dumpA, dumpB, values] = [
			await fullDump(a.driver),
			await fullDump(b.driver),
			await valuesDump(a.driver),
		];
		return { dumpA, dumpB, values };
	} finally {
		a.driver.close();
		b.driver.close();
		vi.useRealTimers();
		vi.restoreAllMocks();
	}
}

describe("convergence (§8.1) — the high-value test", () => {
	it.each([1, 2, 3, 4, 5])(
		"seed %s: A and B end strictly identical, whatever the reconnection order",
		async (seed) => {
			const forward = await runUniverse(seed, "ab");
			// Within a universe: STRICT equality, stamps and extras included.
			expect(forward.dumpA).toEqual(forward.dumpB);

			const reverse = await runUniverse(seed, "ba");
			expect(reverse.dumpA).toEqual(reverse.dumpB);

			// Across universes: identical values whatever the reconnection
			// order (stamps excluded: repair writes are stamped at sync time).
			expect(forward.values).toEqual(reverse.values);
		},
		60_000,
	);
});
```

- [ ] **Step 2 : Exécuter et stabiliser**

```bash
pnpm test:run src/sync/convergence.test.ts
```

Attendu : PASS sur les 5 seeds. Si un seed échoue, **c'est un bug de convergence réel** — le corriger dans le moteur (jamais en affaiblissant l'assertion ni en changeant de seed), puis relancer toute la suite. C'est exactement le travail que ce test existe pour provoquer.

- [ ] **Step 3 : Vérifier la suite complète**

```bash
pnpm test:run
pnpm lint
```

- [ ] **Step 4 : Commit**

```bash
git add src/sync/convergence.test.ts
git commit -m 'test: :white_check_mark: prove two-device convergence under random offline edits'
```

- [ ] **Step 5 : [SABOTAGE] Prouver que la convergence tient au départage déterministe**

Dans `src/sync/merge.ts`, dans `stampWins`, remplacer `return candidate.d > incumbent.d;` par `return false;` — à égalité de timestamp, chaque appareil garde SA valeur : c'est précisément la non-convergence que le spec §5 décrit (« deux appareils peuvent trancher différemment le même conflit et ne jamais converger »).

```bash
git diff --stat -- src/sync/merge.ts   # doit lister le fichier
grep -c 'candidate.d > incumbent.d' src/sync/merge.ts   # doit afficher 0 (avant sabotage : 1)
pnpm test:run src/sync/convergence.test.ts   # DOIT échouer : dumpA ≠ dumpB (le title du prologue diverge) ou absence de point fixe
git checkout -- src/sync/merge.ts
pnpm test:run src/sync/convergence.test.ts   # tout DOIT repasser
```

Nota : inverser le sens (`<` au lieu de `>`) resterait **convergent** — les deux appareils appliqueraient la même règle inversée — c'est pourquoi le sabotage de convergence est `return false` (règle asymétrique), et le sens exact du départage est prouvé par le sabotage de la tâche 9, pas ici. Les deux sabotages couvrent des propriétés différentes.

---

## Clôture

- [ ] **Vérification finale complète**

```bash
pnpm test:run
pnpm lint
pnpm build
git log --oneline develop..feat/sync-engine
```

Attendu : trois commandes vertes ; ~15 commits (horloge, migration, socle, http, auth, backoff, transport, payload, merge, harnais, pull, push, first-sync, déclencheurs, convergence).

- [ ] **Fin de tâche CLAUDE.md**

1. **Changelog : aucune entrée.** Le moteur est du logiciel interne tant que 4d n'expose ni réglages ni connexion — `server_url` n'est jamais posé, rien n'est visible par l'utilisateur. L'entrée bilingue viendra avec 4d.
2. **react-doctor** — préparation d'environnement obligatoire puis exécution, ne corriger que les diagnostics introduits par ce travail :

```bash
nvm use 22.22.2
rm -rf ~/.npm/_npx
pnpm run doctor
```

3. **`pnpm run lint:fix`** puis committer les éventuelles corrections (`style: :art: apply lint fixes`).

- [ ] Pousser la branche et suivre `superpowers:finishing-a-development-branch` (PR vers `develop`).

## Hors périmètre (plan 4d — UI de synchronisation)

- Réglages §6.3 : section « Synchronisation », test de connexion (`getServerInfo` est prêt), formulaires connexion/inscription (`signIn`/`register` sont prêts), affichage de la clé de 24 mots (`register` la retourne, à ne jamais persister), état de sync et liste des appareils.
- Dialogue de première synchronisation §6.4 (consomme `awaiting-first-sync` + `resolveFirstSync`), avec sauvegarde JSON automatique via `dataTransfer.ts` avant « Remplacer ».
- Déconnexion et changement de serveur §6.5 (`signOut` est prêt ; effacer curseur, outbox, identité — pas le SQLite).
- Validation d'URL côté saisie (https imposé, exceptions localhost/`.local`).
- Avertissement + confirmation sur l'import (décision 4a, §9.4) — l'import se propage désormais réellement.
- Entrée changelog bilingue de la fonctionnalité.
- Compteur/écran de quarantaine (la table est prête).
