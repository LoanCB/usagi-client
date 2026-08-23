# Plan 4a — Prérequis de synchronisation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendre le modèle de données local réellement synchronisable — estampillage complet, ordre global, tombstones cohérents, transactions — pour que le moteur du plan 4c s'appuie sur des invariants qui tiennent.

**Architecture:** Uniquement du client, aucun réseau. On corrige `SqliteRepository` et `DbDriver`, on bascule les lectures d'ordre de `sort_order` vers `sort_key`, et on remplace le placeholder d'identifiant d'appareil par une vraie valeur persistée.

**Tech Stack:** TypeScript, SQLite via `tauri-plugin-sql`, `better-sqlite3` dans le harnais de test, `fractional-indexing`, Vitest, Biome.

**Spec:** [docs/superpowers/specs/2026-08-20-sync-offline-first-design.md](../specs/2026-08-20-sync-offline-first-design.md) — §9 en entier, et les corrections du §1.2 et du §5 qu'il référence.

## Global Constraints

- Gestionnaire de paquets : **pnpm**, jamais npm.
- Commentaires en **anglais**, concis, expliquant le *pourquoi* et non le *quoi*.
- TypeScript : tabulations, guillemets doubles (biome.json). Types dans leur propre fichier sauf props de composant non partagées.
- **Aucun appel réseau, aucune UI de synchronisation.** Ce plan prépare le terrain ; le moteur est le plan 4c.
- Après chaque tâche : `pnpm test:run`, `pnpm lint`, `pnpm build` doivent sortir en 0.
- Le changelog (`src/assets/changelog.json`) ne reçoit **rien** pour les changements purement internes. La Task 10 est la seule visible par l'utilisateur — elle, oui.

## État mesuré avant de commencer

Relevé sur `develop` à `29d1ba5`, par lecture du code et non de mémoire :

| Fait | Conséquence |
|---|---|
| Aucun `ORDER BY` de production ne lit `sort_key` | La bascule est invisible si elle est correcte, immédiatement visible sinon |
| `reorderTasks` réécrit `0..N-1` sur le seul sous-ensemble affiché | Deux vues réordonnées produisent des numéros qui se télescopent |
| `createTask` / `createProject` codent `sort_order = 0` en dur, `createProjectGroup` fait `MAX+1` | Trois conventions pour trois tables |
| `sort_key` n'est écrit que par `reorderTasks` et le backfill au démarrage | Une ligne créée a `sort_key IS NULL` jusqu'au prochain lancement |
| `LOCAL_DEVICE_ID = "local"`, littéral identique partout | Le départage LWW du §5 est inopérant |
| `sync_state` existe depuis la migration 009, rien ne l'écrit ni ne le lit | À câbler |
| `DbDriver` n'expose que `execute` et `select` | Aucune atomicité possible |
| Le glisser-déposer est actif dans Inbox, Aujourd'hui, Toutes les tâches, et sous filtres projet/tag/priorité/complété | Il traverse les projets, d'où l'ordre global |
| Il est **impossible** sous recherche texte, et un tri rapide actif est réinitialisé par un glisser | Ces vues n'ont pas à être traitées |

Prochain numéro de migration disponible : **010**.

## Structure des fichiers

| Fichier | Rôle |
|---|---|
| `src/db/driver.ts` | Ajout de `transaction` à l'interface |
| `src/test-harness/BetterSqliteDriver.ts` | Implémentation synchrone de `transaction` |
| `src/db/index.ts` | Implémentation Tauri de `transaction` |
| `src/db/device-id.ts` | **Nouveau** — lecture/création de l'identifiant d'appareil dans `sync_state` |
| `src/db/migrations/010_device_id_restamp.sql` | **Nouveau** — réécriture des estampilles portant `"local"` |
| `src/db/sqlite-repository.ts` | Estampillage, `sort_key`, tombstones, import |
| `src/db/backfill-sort-keys.ts` | Re-backfill intégral |
| `src/components/settings/…` | Avertissement et confirmation d'import (Task 10) |

---

## Task 1 : Transactions dans `DbDriver`

C'est la plus grosse lacune d'interface laissée par le plan 1, et les Tasks 8 et 9 en dépendent. Elle vient donc en premier.

**Files:**
- Modify: `src/db/driver.ts`
- Modify: `src/test-harness/BetterSqliteDriver.ts`
- Modify: `src/db/index.ts`
- Test: `src/db/driver.test.ts` (nouveau)

**Interfaces:**
- Produces : `transaction<T>(work: (tx: DbDriver) => Promise<T>): Promise<T>` sur `DbDriver`.

- [ ] **Step 1 : Écrire les tests qui échouent**

Créer `src/db/driver.test.ts` :

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { BetterSqliteDriver } from "../test-harness/BetterSqliteDriver";

describe("DbDriver.transaction", () => {
	let db: BetterSqliteDriver;

	beforeEach(async () => {
		db = new BetterSqliteDriver();
		await db.execute("CREATE TABLE t (id TEXT PRIMARY KEY, v TEXT)", []);
	});

	it("commits every write when the callback resolves", async () => {
		await db.transaction(async (tx) => {
			await tx.execute("INSERT INTO t (id, v) VALUES ('a', '1')", []);
			await tx.execute("INSERT INTO t (id, v) VALUES ('b', '2')", []);
		});
		const rows = await db.select<{ id: string }>("SELECT id FROM t ORDER BY id");
		expect(rows.map((r) => r.id)).toEqual(["a", "b"]);
	});

	it("rolls every write back when the callback throws", async () => {
		// The whole point: the sync engine purges its outbox entries in the same
		// transaction that applies a remote change. A half-applied pair would
		// either replay a change forever or drop it silently.
		await expect(
			db.transaction(async (tx) => {
				await tx.execute("INSERT INTO t (id, v) VALUES ('a', '1')", []);
				throw new Error("boom");
			}),
		).rejects.toThrow("boom");
		const rows = await db.select<{ id: string }>("SELECT id FROM t");
		expect(rows).toEqual([]);
	});

	it("returns the callback's value", async () => {
		const out = await db.transaction(async () => 42);
		expect(out).toBe(42);
	});

	it("rolls back a write that fails on a constraint", async () => {
		await db.execute("INSERT INTO t (id, v) VALUES ('a', '1')", []);
		await expect(
			db.transaction(async (tx) => {
				await tx.execute("INSERT INTO t (id, v) VALUES ('b', '2')", []);
				await tx.execute("INSERT INTO t (id, v) VALUES ('a', 'dup')", []);
			}),
		).rejects.toThrow();
		const rows = await db.select<{ id: string }>("SELECT id FROM t ORDER BY id");
		expect(rows.map((r) => r.id)).toEqual(["a"]);
	});
});
```

- [ ] **Step 2 : Lancer et vérifier l'échec**

Run: `pnpm test:run src/db/driver.test.ts`
Expected: FAIL — `db.transaction is not a function`.

- [ ] **Step 3 : Étendre l'interface**

Dans `src/db/driver.ts` :

```ts
export interface QueryResult {
	rowsAffected: number;
	lastInsertId: number;
}

export interface DbDriver {
	execute(query: string, bindValues?: unknown[]): Promise<QueryResult>;
	select<T>(query: string, bindValues?: unknown[]): Promise<T[]>;
	/**
	 * Run `work` atomically. Everything it writes commits together or not at all.
	 *
	 * The sync engine needs this to purge an outbox entry in the same transaction
	 * that applies the remote change it came from: split across two commits, a
	 * crash in between either replays the change forever or drops it silently.
	 *
	 * The driver handed to `work` is the transactional one — use it, not the outer
	 * driver, or the write escapes the transaction.
	 */
	transaction<T>(work: (tx: DbDriver) => Promise<T>): Promise<T>;
}
```

- [ ] **Step 4 : Implémenter dans le harnais de test**

Dans `src/test-harness/BetterSqliteDriver.ts`, ajouter à la classe :

```ts
	async transaction<T>(work: (tx: DbDriver) => Promise<T>): Promise<T> {
		// better-sqlite3's own `transaction()` helper only wraps synchronous
		// functions; `work` is async, so drive the statements by hand.
		await this.execute("BEGIN", []);
		try {
			const out = await work(this);
			await this.execute("COMMIT", []);
			return out;
		} catch (error) {
			await this.execute("ROLLBACK", []);
			throw error;
		}
	}
```

- [ ] **Step 5 : Implémenter côté Tauri**

Dans `src/db/index.ts`, sur le driver qui enveloppe `tauri-plugin-sql`, ajouter la même méthode. Le plugin n'expose pas d'API de transaction dédiée : `BEGIN` / `COMMIT` / `ROLLBACK` passent par `execute` comme n'importe quelle instruction.

```ts
	async transaction<T>(work: (tx: DbDriver) => Promise<T>): Promise<T> {
		// tauri-plugin-sql has no transaction API of its own; the statements go
		// through execute like any other. Nested calls are not supported — SQLite
		// would reject the inner BEGIN — and nothing in this codebase nests.
		await this.execute("BEGIN", []);
		try {
			const out = await work(this);
			await this.execute("COMMIT", []);
			return out;
		} catch (error) {
			await this.execute("ROLLBACK", []);
			throw error;
		}
	}
```

- [ ] **Step 6 : Lancer et vérifier le succès**

Run: `pnpm test:run src/db/driver.test.ts`
Expected: PASS (4 tests).

Puis `pnpm test:run` en entier — l'ajout d'une méthode à l'interface casse tout objet qui l'implémente à la main dans les tests. Les corriger.

- [ ] **Step 7 : Ajouter les trois points d'instrumentation au harnais**

`BetterSqliteDriver` n'expose aujourd'hui que `execute`, `select` et `close`. Trois tâches ultérieures ont besoin de plus, et les ajouter ici évite que chacune bricole le sien :

```ts
	/** A second driver over the same database, with no memoised state. */
	reopen(): BetterSqliteDriver

	/** Statements executed so far. Task 7 asserts a move writes one row, not N. */
	countWrites(): number

	/**
	 * Make the next execute matching `pattern` throw.
	 *
	 * Atomicity is otherwise only assertable by claim: Tasks 8 and 9 need a
	 * failure *between* two writes to prove the rollback actually happens.
	 */
	failNextExecuteMatching(pattern: RegExp): void
```

`reopen` doit partager la base sous-jacente : sur `:memory:` cela veut dire réutiliser la même connexion `better-sqlite3` derrière un objet neuf, pas en ouvrir une seconde qui verrait une base vide.

- [ ] **Step 8 : Vérifier `isIgnorable` contre le vrai moteur SQL**

Le §9.6 laisse ce point ouvert : `isIgnorable` ne tolère que `/duplicate column name/i`, vérifié sous `better-sqlite3` mais **jamais sous `@tauri-apps/plugin-sql`**. Ce plan ajoute deux migrations qui s'exécuteront sur des bases existantes, donc il exerce précisément ce chemin — c'est le moment de lever le doute plutôt que de le reporter une troisième fois.

Lancer `pnpm tauri dev` sur une base ayant déjà des migrations appliquées, et provoquer l'erreur en rejouant une migration `ALTER TABLE … ADD COLUMN` déjà passée. Relever le **texte exact** de l'erreur remontée par le plugin.

- Si elle correspond à `/duplicate column name/i`, ajouter un commentaire au-dessus d'`isIgnorable` disant qu'elle a été confirmée sous les deux moteurs, avec le texte observé.
- Sinon, élargir le motif pour couvrir les deux formulations, et ajouter un test qui fixe chacune.

Reporter le résultat dans le rapport de tâche quoi qu'il arrive : c'est la seule étape de ce plan qu'un test automatisé ne peut pas trancher, puisqu'elle porte sur le comportement d'un moteur que le harnais de test n'utilise pas.

- [ ] **Step 9 : Commit**

```bash
git add src/db/driver.ts src/db/index.ts src/db/driver.test.ts src/test-harness/BetterSqliteDriver.ts src/db/migrations/run-migrations.ts
git commit -m "feat: :sparkles: give DbDriver a transaction boundary"
```

---

## Task 2 : Identifiant d'appareil réel

**Files:**
- Create: `src/db/device-id.ts`
- Create: `src/db/device-id.test.ts`
- Create: `src/db/migrations/010_device_id_restamp.sql`
- Modify: `src/db/migrations/index.ts`

**Interfaces:**
- Produces : `getOrCreateDeviceId(db: DbDriver): Promise<string>`, mémoïsé par instance de driver.

**Pourquoi ce n'est pas cosmétique.** `LOCAL_DEVICE_ID` vaut la chaîne `"local"` sur toutes les installations. Le §5 départage les égalités LWW par comparaison lexicographique du `device_id` : avec la même valeur partout, deux écritures concurrentes au même horodatage sont strictement égales et le départage ne tranche jamais. Le mécanisme du §5 est inopérant tant que ce point n'est pas traité.

- [ ] **Step 1 : Écrire les tests qui échouent**

Créer `src/db/device-id.test.ts` :

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { BetterSqliteDriver } from "../test-harness/BetterSqliteDriver";
import { getOrCreateDeviceId } from "./device-id";
import { runMigrations } from "./migrations/run-migrations";

describe("getOrCreateDeviceId", () => {
	let db: BetterSqliteDriver;

	beforeEach(async () => {
		db = new BetterSqliteDriver();
		await runMigrations(db);
	});

	it("creates an id on first call and persists it in sync_state", async () => {
		const id = await getOrCreateDeviceId(db);
		expect(id).toMatch(/^[0-9a-f-]{36}$/);
		const rows = await db.select<{ value: string }>(
			"SELECT value FROM sync_state WHERE key = 'device_id'",
		);
		expect(rows[0]?.value).toBe(id);
	});

	it("returns the same id on a later call", async () => {
		const first = await getOrCreateDeviceId(db);
		const second = await getOrCreateDeviceId(db);
		expect(second).toBe(first);
	});

	it("survives a fresh driver over the same database", async () => {
		// Memoisation must not be the only thing keeping the id stable — a
		// device that changed identity between launches would break LWW
		// tie-breaks silently.
		const first = await getOrCreateDeviceId(db);
		const again = await getOrCreateDeviceId(db.reopen());
		expect(again).toBe(first);
	});

	it("is not the placeholder", async () => {
		expect(await getOrCreateDeviceId(db)).not.toBe("local");
	});

	it("differs between two devices", async () => {
		const other = new BetterSqliteDriver();
		await runMigrations(other);
		expect(await getOrCreateDeviceId(db)).not.toBe(
			await getOrCreateDeviceId(other),
		);
	});
});
```

Si `BetterSqliteDriver` n'a pas de `reopen()`, l'ajouter : il doit rendre un nouveau driver partageant la même base sous-jacente, sans état mémoïsé.

- [ ] **Step 2 : Lancer et vérifier l'échec**

Run: `pnpm test:run src/db/device-id.test.ts`
Expected: FAIL — module introuvable.

- [ ] **Step 3 : Implémenter**

Créer `src/db/device-id.ts` :

```ts
import type { DbDriver } from "./driver";

const KEY = "device_id";

// Per-driver cache. The value is stable on disk; this only avoids a SELECT on
// every stamped write, which is every write.
const cache = new WeakMap<DbDriver, string>();

/**
 * The identity this install writes into `field_updated_at`.
 *
 * It has to be genuinely unique per install, not per user and not per session:
 * spec §5 breaks LWW ties by comparing device ids lexicographically, so two
 * installs sharing a value make concurrent same-instant writes compare equal
 * and never converge.
 */
export async function getOrCreateDeviceId(db: DbDriver): Promise<string> {
	const cached = cache.get(db);
	if (cached) return cached;

	const rows = await db.select<{ value: string }>(
		"SELECT value FROM sync_state WHERE key = ?",
		[KEY],
	);
	const existing = rows[0]?.value;
	if (existing) {
		cache.set(db, existing);
		return existing;
	}

	const id = crypto.randomUUID();
	// INSERT OR IGNORE, not INSERT: two concurrent first calls would otherwise
	// race and the loser would overwrite the winner's id.
	await db.execute(
		"INSERT OR IGNORE INTO sync_state (key, value) VALUES (?, ?)",
		[KEY, id],
	);
	const settled = await db.select<{ value: string }>(
		"SELECT value FROM sync_state WHERE key = ?",
		[KEY],
	);
	const winner = settled[0]?.value ?? id;
	cache.set(db, winner);
	return winner;
}
```

- [ ] **Step 4 : Écrire la migration de réécriture**

Créer `src/db/migrations/010_device_id_restamp.sql` :

```sql
-- Every stamp written before this migration carries the literal device id
-- "local", because LOCAL_DEVICE_ID was a hardcoded placeholder. Spec §5 breaks
-- LWW ties by comparing device ids, so those stamps cannot lose a tie against
-- another device's — nor win one. Blanking the device half leaves the
-- timestamps intact (they are the primary comparison) and marks these stamps as
-- authorless, which is the truth: we cannot know which install wrote them.
--
-- The timestamps are what matter for merging; the device id only breaks exact
-- ties, which are rare. Rewriting to the *current* device's id would be worse:
-- it would claim authorship of writes this install may never have made.
UPDATE tasks
SET field_updated_at = REPLACE(field_updated_at, '"d":"local"', '"d":""')
WHERE field_updated_at LIKE '%"d":"local"%';

UPDATE projects
SET field_updated_at = REPLACE(field_updated_at, '"d":"local"', '"d":""')
WHERE field_updated_at LIKE '%"d":"local"%';

UPDATE tags
SET field_updated_at = REPLACE(field_updated_at, '"d":"local"', '"d":""')
WHERE field_updated_at LIKE '%"d":"local"%';

UPDATE project_groups
SET field_updated_at = REPLACE(field_updated_at, '"d":"local"', '"d":""')
WHERE field_updated_at LIKE '%"d":"local"%';
```

L'enregistrer dans `src/db/migrations/index.ts`, en suivant exactement la forme des neuf précédentes.

- [ ] **Step 5 : Tester la migration**

Ajouter à `src/db/migrations/migrations.test.ts` :

```ts
it("blanks the placeholder device id in existing stamps", async () => {
	const db = new BetterSqliteDriver();
	await runMigrations(db);
	await db.execute(
		`INSERT INTO tasks (id, title, created_at, updated_at, field_updated_at)
		 VALUES ('t1', 'x', '2026-01-01', '2026-01-01',
		         '{"title":{"t":"2026-01-01","d":"local"}}')`,
		[],
	);
	// Re-running is safe and is what an upgrade over an existing install does.
	await runMigrations(db);

	const rows = await db.select<{ field_updated_at: string }>(
		"SELECT field_updated_at FROM tasks WHERE id = 't1'",
	);
	const stamps = JSON.parse(rows[0].field_updated_at) as Record<
		string,
		{ t: string; d: string }
	>;
	expect(stamps.title.d).toBe("");
	expect(stamps.title.t).toBe("2026-01-01");
});
```

Note : ce test insère la ligne *après* la première exécution des migrations, donc la réécriture n'a pas encore eu lieu pour elle ; la seconde exécution l'attrape. C'est délibéré — c'est la seule façon de simuler une base héritée dans un harnais qui part d'une base vide.

- [ ] **Step 6 : Lancer et vérifier**

Run: `pnpm test:run src/db/device-id.test.ts src/db/migrations/`
Expected: PASS.

- [ ] **Step 7 : Commit**

```bash
git add src/db/device-id.ts src/db/device-id.test.ts src/db/migrations src/test-harness
git commit -m "feat: :sparkles: give each install a real device identity"
```

---

## Task 3 : Estampiller les six méthodes non instrumentées de `tasks`

**Files:**
- Modify: `src/db/sqlite-repository.ts`
- Modify: `src/db/sqlite-repository.test.ts`

**Interfaces:**
- Consumes : `getOrCreateDeviceId`.
- Produces : un helper privé `_stamp(id, fields, now)` sur `SqliteRepository`.

Les méthodes concernées, listées par la correction du §1.2 : `archiveTask` et `unarchiveTask` (`deleted_at`), `completeTask` et `uncompleteTask` (`completed_at`), `moveTasksToProject` (`project_id`), `reorderTasks` (`sort_key`, `sort_order`) — plus `deleteTask`, qui pose un tombstone sans rien estamper.

- [ ] **Step 1 : Écrire les tests qui échouent**

Ajouter à `src/db/sqlite-repository.test.ts` un bloc couvrant chaque méthode. Le motif, à répéter pour les sept :

```ts
describe("field stamping beyond updateTask", () => {
	// A merge engine built on the original claim that updateTask was the only
	// write path would never see an archive, a completion or a move as a field
	// change — the remote value would win forever.
	async function stampsOf(repo: SqliteRepository, db: BetterSqliteDriver, id: string) {
		const rows = await db.select<{ field_updated_at: string | null }>(
			"SELECT field_updated_at FROM tasks WHERE id = ?",
			[id],
		);
		return JSON.parse(rows[0]?.field_updated_at ?? "{}") as Record<
			string,
			{ t: string; d: string }
		>;
	}

	it("archiveTask stamps deleted_at", async () => {
		const task = await repo.createTask({ title: "x" });
		await repo.archiveTask(task.id);
		expect((await stampsOf(repo, db, task.id)).deleted_at).toBeDefined();
	});

	it("unarchiveTask stamps deleted_at", async () => {
		const task = await repo.createTask({ title: "x" });
		await repo.archiveTask(task.id);
		const before = (await stampsOf(repo, db, task.id)).deleted_at.t;
		await repo.unarchiveTask(task.id);
		expect((await stampsOf(repo, db, task.id)).deleted_at.t).not.toBe(before);
	});

	it("completeTask stamps completed_at", async () => {
		const task = await repo.createTask({ title: "x" });
		await repo.completeTask(task.id);
		expect((await stampsOf(repo, db, task.id)).completed_at).toBeDefined();
	});

	it("uncompleteTask stamps completed_at", async () => {
		const task = await repo.createTask({ title: "x" });
		await repo.completeTask(task.id);
		await repo.uncompleteTask(task.id);
		expect((await stampsOf(repo, db, task.id)).completed_at).toBeDefined();
	});

	it("moveTasksToProject stamps project_id on every task moved", async () => {
		const a = await repo.createTask({ title: "a" });
		const b = await repo.createTask({ title: "b" });
		const project = await repo.createProject({ name: "p" });
		await repo.moveTasksToProject([a.id, b.id], project.id);
		expect((await stampsOf(repo, db, a.id)).project_id).toBeDefined();
		expect((await stampsOf(repo, db, b.id)).project_id).toBeDefined();
	});

	it("deleteTask stamps the columns its tombstone writes", async () => {
		const task = await repo.createTask({ title: "x" });
		await repo.deleteTask(task.id);
		const stamps = await stampsOf(repo, db, task.id);
		// purged_at is what tells another device this row is gone; without a
		// stamp the tombstone loses every tie against a stale live copy.
		expect(stamps.purged_at).toBeDefined();
		expect(stamps.deleted_at).toBeDefined();
		expect(stamps.title).toBeDefined();
	});

	it("stamps carry the real device id, not the placeholder", async () => {
		const task = await repo.createTask({ title: "x" });
		await repo.archiveTask(task.id);
		const stamps = await stampsOf(repo, db, task.id);
		expect(stamps.deleted_at.d).not.toBe("local");
		expect(stamps.deleted_at.d).toMatch(/^[0-9a-f-]{36}$/);
	});
});
```

`reorderTasks` est couvert par la Task 7, qui réécrit la méthode.

- [ ] **Step 2 : Lancer et vérifier l'échec**

Run: `pnpm test:run src/db/sqlite-repository.test.ts -t "field stamping"`
Expected: FAIL sur chacun — les stamps sont absents.

- [ ] **Step 3 : Implémenter le helper**

Dans `src/db/sqlite-repository.ts`, remplacer la constante `LOCAL_DEVICE_ID` par deux helpers de classe et supprimer le placeholder. Le nom de table est contraint par un type fermé plutôt qu'interpolé librement — un nom de table ne doit jamais arriver d'une chaîne quelconque dans du SQL :

```ts
type SyncedTable = "tasks" | "projects" | "tags" | "project_groups";
```


```ts
	/**
	 * Merge `fields` into a task's stamp map, preserving the stamps of fields
	 * this write did not touch.
	 *
	 * Every method that writes an LWW-governed column has to call this, not just
	 * updateTask — see the §1.2 correction in the spec for the list and for what
	 * a merge engine does when a write path skips it.
	 */
	private async _stamp(
		table: SyncedTable,
		id: string,
		fields: string[],
		now: string,
	): Promise<void> {
		const deviceId = await getOrCreateDeviceId(this.db);
		const prior = await this.db.select<{ field_updated_at: string | null }>(
			`SELECT field_updated_at FROM ${table} WHERE id = ?`,
			[id],
		);
		await this.db.execute(
			`UPDATE ${table} SET field_updated_at = ? WHERE id = ?`,
			[
				stampFields(prior[0]?.field_updated_at ?? null, fields, now, deviceId),
				id,
			],
		);
	}

	/** The fractional key a row currently holds, or null if it has none yet. */
	private async _keyOf(table: SyncedTable, id: string): Promise<string | null> {
		const rows = await this.db.select<{ sort_key: string | null }>(
			`SELECT sort_key FROM ${table} WHERE id = ?`,
			[id],
		);
		return rows[0]?.sort_key ?? null;
	}
```

Puis appeler `_stamp("tasks", …)` depuis les sept méthodes, avec les champs que chacune écrit réellement :

| Méthode | Champs à estamper |
|---|---|
| `archiveTask` | `["deleted_at"]` |
| `unarchiveTask` | `["deleted_at"]` |
| `completeTask` | `["completed_at"]` |
| `uncompleteTask` | `["completed_at"]` |
| `moveTasksToProject` | `["project_id"]`, pour **chaque** identifiant déplacé |
| `deleteTask` | `["purged_at", "deleted_at", "title", "description"]` |

`createTask` et `updateTask` passent aussi par `getOrCreateDeviceId` au lieu de `LOCAL_DEVICE_ID`.

- [ ] **Step 4 : Lancer et vérifier le succès**

Run: `pnpm test:run src/db/sqlite-repository.test.ts`
Expected: PASS.

- [ ] **Step 5 : Vérifier que le placeholder a disparu**

```bash
grep -rn "LOCAL_DEVICE_ID\|\"local\"" src/db/ || echo "gone"
```

Expected : plus aucune occurrence hors de la migration 010 et de ses tests.

- [ ] **Step 6 : Commit**

```bash
git add src/db/sqlite-repository.ts src/db/sqlite-repository.test.ts
git commit -m "feat: :sparkles: stamp every task write path, not just updateTask"
```

---

## Task 4 : Estampiller `projects`, `tags` et `project_groups`

**Files:**
- Modify: `src/db/sqlite-repository.ts`
- Modify: `src/db/sqlite-repository.test.ts`

Les trois tables ont la colonne `field_updated_at` depuis la migration 007, mais elle reste NULL : seule `tasks` est instrumentée.

`_stamp` est déjà paramétré par la table depuis la Task 3 ; cette tâche l'appelle simplement depuis les méthodes des trois autres tables.

- [ ] **Step 1 : Recenser les méthodes à instrumenter**

```bash
grep -n "async \(create\|update\|delete\|reorder\)\(Project\|Tag\|ProjectGroup\)" src/db/sqlite-repository.ts
```

Chacune écrit au moins une colonne régie par le LWW et doit estamper exactement les champs qu'elle écrit.

- [ ] **Step 2 : Écrire les tests qui échouent**

Un test par méthode recensée, sur ce motif :

```ts
async function stampsOfRow(
	db: BetterSqliteDriver,
	table: string,
	id: string,
): Promise<Record<string, { t: string; d: string }>> {
	const rows = await db.select<{ field_updated_at: string | null }>(
		`SELECT field_updated_at FROM ${table} WHERE id = ?`,
		[id],
	);
	return JSON.parse(rows[0]?.field_updated_at ?? "{}");
}

it("createProject stamps the fields it writes", async () => {
	const project = await repo.createProject({ name: "p" });
	const stamps = await stampsOfRow(db, "projects", project.id);
	expect(stamps.name).toBeDefined();
	expect(stamps.name.d).toMatch(/^[0-9a-f-]{36}$/);
});

it("updateProject stamps only the fields in the patch", async () => {
	const project = await repo.createProject({ name: "p" });
	const before = await stampsOfRow(db, "projects", project.id);
	await repo.updateProject(project.id, { color: "#fff" });
	const after = await stampsOfRow(db, "projects", project.id);
	expect(after.color).toBeDefined();
	// An untouched field keeps its old stamp: re-stamping everything on every
	// write would make the last writer win the whole row, not the field.
	expect(after.name.t).toBe(before.name.t);
});
```

Puis le test de cascade, qui est le moins évident :

```ts
it("deleteProject stamps the cascaded tag deletions too", async () => {
	const project = await repo.createProject({ name: "p" });
	const tag = await repo.createTag({ name: "t", projectId: project.id });
	await repo.deleteProject(project.id);
	// The cascade writes deleted_at on the tag; unstamped, the tag would come
	// back the moment another device pushed its own stale copy.
	const stamps = await tagStampsOf(db, tag.id);
	expect(stamps.deleted_at).toBeDefined();
});
```

- [ ] **Step 3 : Lancer, implémenter, relancer**

Run: `pnpm test:run src/db/sqlite-repository.test.ts`
Expected: échec puis succès.

- [ ] **Step 4 : Commit**

```bash
git add src/db/sqlite-repository.ts src/db/sqlite-repository.test.ts
git commit -m "feat: :sparkles: stamp projects, tags and project groups"
```

---

## Task 5 : Écrire `sort_key` à l'insertion

**Files:**
- Modify: `src/db/sqlite-repository.ts`
- Modify: `src/db/sqlite-repository.test.ts`

Aujourd'hui `createTask`, `createProject` et `createProjectGroup` n'écrivent pas `sort_key` : une ligne créée a `sort_key IS NULL` jusqu'au prochain lancement, où le backfill lui attribue une clé **après le maximum existant** — donc en bas, alors que `sort_order = 0` l'affichait en haut. Le backfill étant idempotent, il n'y reviendra jamais.

- [ ] **Step 1 : Écrire les tests qui échouent**

```ts
describe("sort_key at insert", () => {
	it("gives a new task a key without waiting for a restart", async () => {
		const task = await repo.createTask({ title: "x" });
		const rows = await db.select<{ sort_key: string | null }>(
			"SELECT sort_key FROM tasks WHERE id = ?",
			[task.id],
		);
		expect(rows[0].sort_key).not.toBeNull();
	});

	it("places a new task at the top, matching where the UI shows it", async () => {
		// The optimistic store prepends a new task; the persisted order must
		// agree, or the task jumps on the next reload.
		const first = await repo.createTask({ title: "first" });
		const second = await repo.createTask({ title: "second" });
		const rows = await db.select<{ id: string; sort_key: string }>(
			"SELECT id, sort_key FROM tasks ORDER BY sort_key",
		);
		expect(rows.map((r) => r.id)).toEqual([second.id, first.id]);
	});

	it("gives each new task a distinct key", async () => {
		const a = await repo.createTask({ title: "a" });
		const b = await repo.createTask({ title: "b" });
		const rows = await db.select<{ sort_key: string }>(
			"SELECT sort_key FROM tasks WHERE id IN (?, ?)",
			[a.id, b.id],
		);
		expect(new Set(rows.map((r) => r.sort_key)).size).toBe(2);
	});

	it("stamps sort_key as a field", async () => {
		const task = await repo.createTask({ title: "x" });
		expect((await stampsOf(db, task.id)).sort_key).toBeDefined();
	});
});
```

Le second test fixe une décision : **une nouvelle tâche va en haut.** C'est ce que fait déjà le store en optimiste (`store/tasks.ts` fait `[task, ...s.tasks]`), et c'est ce que `sort_order = 0` visait. Le comportement observé aujourd'hui après rechargement est différent — le départage par `created_at` la renvoie en bas de son groupe d'ex æquo — donc ce test **corrige un désaccord existant** entre l'affichage optimiste et l'affichage rechargé.

- [ ] **Step 2 : Implémenter**

Ajouter un helper qui calcule la clé de tête d'une table :

```ts
	/**
	 * A key that sorts before every existing row of `table`.
	 *
	 * New rows go to the top: that is where the optimistic store already shows
	 * them, and disagreeing here makes a freshly created row jump on the next
	 * reload.
	 */
	private async _headKey(table: SyncedTable): Promise<string> {
		const rows = await this.db.select<{ sort_key: string | null }>(
			`SELECT sort_key FROM ${table} WHERE sort_key IS NOT NULL ORDER BY sort_key LIMIT 1`,
		);
		return generateKeyBetween(null, rows[0]?.sort_key ?? null);
	}
```

Puis l'appeler dans les trois `create*`, en ajoutant `sort_key` à la liste des colonnes insérées et `"sort_key"` à la liste des champs estampillés.

- [ ] **Step 3 : Lancer et vérifier**

Run: `pnpm test:run src/db/sqlite-repository.test.ts`
Expected: PASS.

- [ ] **Step 4 : Commit**

```bash
git add src/db/sqlite-repository.ts src/db/sqlite-repository.test.ts
git commit -m "feat: :sparkles: assign sort_key when a row is created"
```

---

## Task 6 : Re-backfill intégral

**Files:**
- Modify: `src/db/backfill-sort-keys.ts`
- Modify: `src/db/backfill-sort-keys.test.ts`
- Create: `src/db/migrations/011_reset_sort_keys.sql`
- Modify: `src/db/migrations/index.ts`

Le spec est explicite : ne faire confiance à **aucune** valeur de `sort_key` existante. Deux causes de divergence coexistent — un réordonnancement de sous-ensemble ré-ancre à `a0` et entre en collision avec les lignes non touchées, et une tâche créée après le premier backfill se retrouve figée à une position fausse.

- [ ] **Step 1 : Écrire la migration de remise à zéro**

Créer `src/db/migrations/011_reset_sort_keys.sql` :

```sql
-- Discard every sort_key written before the ordering semantics were settled.
--
-- Two independent sources of corruption are already on disk. A subset reorder
-- re-anchored its slice at "a0" and collided with rows it never touched; and a
-- row created after the first backfill was filled in *after* the existing
-- maximum, putting it at the bottom while sort_order = 0 displayed it at the
-- top. The backfill is idempotent, so it never revisited either.
--
-- Nothing reads sort_key yet, so dropping the values costs nothing today. It
-- would cost a rebuild of every user's ordering once the read cutover ships.
UPDATE tasks SET sort_key = NULL;
UPDATE projects SET sort_key = NULL;
UPDATE project_groups SET sort_key = NULL;
```

- [ ] **Step 2 : Écrire les tests qui échouent**

```ts
it("assigns keys in the displayed order", async () => {
	// Seed rows whose sort_order/created_at order is known, then assert the
	// backfilled keys sort the same way.
	await seedTasks(db, [
		{ id: "b", sort_order: 1, created_at: "2026-01-02" },
		{ id: "a", sort_order: 0, created_at: "2026-01-01" },
		{ id: "c", sort_order: 2, created_at: "2026-01-03" },
	]);
	await backfillSortKeys(db);
	const rows = await db.select<{ id: string }>(
		"SELECT id FROM tasks ORDER BY sort_key",
	);
	expect(rows.map((r) => r.id)).toEqual(["a", "b", "c"]);
});

it("gives every row a key, leaving none null", async () => {
	await seedTasks(db, [{ id: "a" }, { id: "b" }]);
	await backfillSortKeys(db);
	const rows = await db.select<{ n: number }>(
		"SELECT COUNT(*) AS n FROM tasks WHERE sort_key IS NULL",
	);
	expect(rows[0].n).toBe(0);
});

it("produces strictly increasing keys with no duplicates", async () => {
	// The collision this guards against is exactly what the pre-existing data
	// suffered: two rows sharing a key have no defined relative order, and the
	// list silently reshuffles between reloads.
	await seedTasks(db, Array.from({ length: 50 }, (_, i) => ({ id: `t${i}` })));
	await backfillSortKeys(db);
	const rows = await db.select<{ sort_key: string }>(
		"SELECT sort_key FROM tasks ORDER BY sort_key",
	);
	const keys = rows.map((r) => r.sort_key);
	expect(new Set(keys).size).toBe(keys.length);
	expect([...keys].sort()).toEqual(keys);
});

it("is idempotent once every row has a key", async () => {
	await seedTasks(db, [{ id: "a" }, { id: "b" }]);
	await backfillSortKeys(db);
	const before = await db.select<{ id: string; sort_key: string }>(
		"SELECT id, sort_key FROM tasks ORDER BY id",
	);
	await backfillSortKeys(db);
	const after = await db.select<{ id: string; sort_key: string }>(
		"SELECT id, sort_key FROM tasks ORDER BY id",
	);
	expect(after).toEqual(before);
});
```

- [ ] **Step 3 : Adapter le backfill**

Il doit couvrir les **trois** tables (`tasks`, `projects`, `project_groups`), pas seulement `tasks`, et écrire les clés en une transaction — un backfill interrompu à mi-chemin laisserait une base à moitié ordonnée.

- [ ] **Step 4 : Lancer et vérifier**

Run: `pnpm test:run src/db/backfill-sort-keys.test.ts src/db/migrations/`
Expected: PASS.

- [ ] **Step 5 : Commit**

```bash
git add src/db/backfill-sort-keys.ts src/db/backfill-sort-keys.test.ts src/db/migrations
git commit -m "fix: :bug: rebuild every sort_key from scratch"
```

---

## Task 7 : Ordre global et bascule des lectures

C'est le cœur du §9.1. `reorderTasks` cesse de renuméroter N lignes et écrit **une seule clé**, calculée entre les deux voisines visibles.

**Files:**
- Modify: `src/db/sqlite-repository.ts`
- Modify: `src/db/sqlite-repository.test.ts`
- Modify: `src/components/layout/TaskList.tsx`
- Modify: `src/store/tasks.ts`

**Interfaces:**
- Produces : `moveTask`, `moveProject`, `moveProjectGroup`, tous de signature `(id: string, prevId: string | null, nextId: string | null) => Promise<void>`, remplaçant respectivement `reorderTasks`, `reorderProjects` et `reorderProjectGroups`.

> **Les trois, pas seulement les tâches.** `reorderProjects` et `reorderProjectGroups`
> n'écrivent aujourd'hui **que** `sort_order`, jamais `sort_key`. Basculer
> `getProjects` et `getProjectGroups` sur `ORDER BY sort_key` sans les convertir
> ferait cesser le réordonnancement de la barre latérale **en silence** : l'écriture
> partirait dans une colonne que plus personne ne lit. Ça compile, ça passe les
> tests, et ça casse entre les mains de l'utilisateur.
>
> Fichiers supplémentaires à toucher pour cette raison : `src/db/repository.ts`
> (l'interface), `src/test-harness/MemoryRepository.ts` (la seconde implémentation),
> `src/components/layout/Sidebar.tsx` (trois appels à `reorderProjects`) et
> `src/store/projects.ts` / `src/store/projectGroups.ts`.

- [ ] **Step 1 : Écrire les tests qui échouent**

```ts
describe("moveTask", () => {
	it("writes exactly one row", async () => {
		const [a, b, c] = await seedThree(repo);
		const writes = db.countWrites(); // instrument BetterSqliteDriver if needed
		await repo.moveTask(c.id, a.id, b.id);
		expect(db.countWrites() - writes).toBe(2); // the move, plus its stamp
	});

	it("places the task between its two neighbours", async () => {
		const [a, b, c] = await seedThree(repo);
		await repo.moveTask(c.id, a.id, b.id);
		const order = await orderedIds(db);
		expect(order).toEqual([a.id, c.id, b.id]);
	});

	it("moves to the very top when there is no previous neighbour", async () => {
		const [a, b, c] = await seedThree(repo);
		await repo.moveTask(c.id, null, a.id);
		expect(await orderedIds(db)).toEqual([c.id, a.id, b.id]);
	});

	it("moves to the very bottom when there is no next neighbour", async () => {
		const [a, b, c] = await seedThree(repo);
		await repo.moveTask(a.id, c.id, null);
		expect(await orderedIds(db)).toEqual([b.id, c.id, a.id]);
	});

	it("leaves rows outside the move untouched", async () => {
		// The bug this replaces: reordering a filtered subset renumbered it
		// 0..N-1 and collided with every row the view did not show.
		const [a, b, c] = await seedThree(repo);
		const hidden = await repo.createTask({ title: "hidden" });
		const before = await keyOf(db, hidden.id);
		await repo.moveTask(c.id, a.id, b.id);
		expect(await keyOf(db, hidden.id)).toBe(before);
	});

	it("keeps a hidden row between the two visible neighbours it sat between", async () => {
		// Dropping between two *visible* tasks places the moved task among any
		// hidden rows that lie between them. That is the documented meaning of a
		// global order under a filtered view, not a defect.
		const [a, b] = await seedTwo(repo);
		const hidden = await repo.createTask({ title: "hidden" });
		await repo.moveTask(hidden.id, a.id, b.id);
		const moved = await repo.createTask({ title: "moved" });
		await repo.moveTask(moved.id, a.id, b.id);
		const order = await orderedIds(db);
		expect(order.indexOf(moved.id)).toBeGreaterThan(order.indexOf(a.id));
		expect(order.indexOf(moved.id)).toBeLessThan(order.indexOf(b.id));
	});

	it("stamps sort_key on the moved row", async () => {
		const [a, b, c] = await seedThree(repo);
		await repo.moveTask(c.id, a.id, b.id);
		expect((await stampsOf(db, c.id)).sort_key).toBeDefined();
	});

	it("still reorders projects once getProjects reads sort_key", async () => {
		// The regression this guards: reorderProjects only ever wrote sort_order.
		// Switching the read to sort_key without converting the write makes the
		// sidebar reorder a no-op that leaves no trace.
		const a = await repo.createProject({ name: "a" });
		const b = await repo.createProject({ name: "b" });
		await repo.moveProject(b.id, null, a.id);
		expect((await repo.getProjects()).map((p) => p.id)).toEqual([b.id, a.id]);
	});

	it("still reorders project groups once getProjectGroups reads sort_key", async () => {
		const a = await repo.createProjectGroup({ name: "a" });
		const b = await repo.createProjectGroup({ name: "b" });
		await repo.moveProjectGroup(b.id, null, a.id);
		expect((await repo.getProjectGroups()).map((g) => g.id)).toEqual([b.id, a.id]);
	});
});
```

- [ ] **Step 2 : Implémenter `moveTask`**

```ts
	/**
	 * Place `id` between two neighbours, identified by the rows the user dropped
	 * it between. Either may be null at the ends of the list.
	 *
	 * One row is written, not N. The method this replaces renumbered the whole
	 * displayed subset to 0..N-1, which collided with every row the current
	 * filter happened to hide — see spec §9.1.
	 */
	async moveTask(
		id: string,
		prevId: string | null,
		nextId: string | null,
	): Promise<void> {
		const now = new Date().toISOString();
		const prevKey = prevId ? await this._keyOf("tasks", prevId) : null;
		const nextKey = nextId ? await this._keyOf("tasks", nextId) : null;
		const key = generateKeyBetween(prevKey, nextKey);
		await this.db.execute(
			"UPDATE tasks SET sort_key = ?, updated_at = ? WHERE id = ?",
			[key, now, id],
		);
		await this._stamp("tasks", id, ["sort_key"], now);
	}
```

`sort_order` n'est **plus écrit**. Le commentaire d'origine de `reorderTasks` le justifiait par la possibilité d'un rollback de release ; ce plan bascule les lectures, donc un rollback serait de toute façon incohérent, et maintenir deux sources d'ordre divergentes est pire que n'en avoir qu'une.

- [ ] **Step 3 : Basculer les lectures**

Remplacer `ORDER BY t.sort_order, t.created_at` par `ORDER BY t.sort_key` dans les deux requêtes de `getTasks`, et `ORDER BY sort_order, created_at` par `ORDER BY sort_key` dans `getProjects` et `getProjectGroups`.

`getArchivedTasks` garde `ORDER BY deleted_at DESC` — l'archive n'est pas réordonnable et son tri chronologique est voulu.

- [ ] **Step 4 : Adapter l'appelant**

Dans `src/components/layout/TaskList.tsx`, `handleDragEnd` calcule aujourd'hui un tableau complet réordonné. Il doit désormais transmettre les deux voisines :

```ts
const reordered = arrayMove(displayedTasks, oldIndex, newIndex);
const at = reordered.findIndex((t) => t.id === active.id);
resetSort();
moveTask(
	getRepository(),
	String(active.id),
	reordered[at - 1]?.id ?? null,
	reordered[at + 1]?.id ?? null,
);
```

Adapter `src/store/tasks.ts` en conséquence : la mise à jour optimiste réordonne la liste en mémoire comme avant, seul l'appel au repository change.

- [ ] **Step 5 : Lancer et vérifier**

Run: `pnpm test:run`
Expected: PASS. Les tests existants de `reorderTasks` doivent être réécrits, pas supprimés.

- [ ] **Step 6 : Vérifier à la main**

`pnpm tauri dev`, puis : réordonner dans Toutes les tâches, basculer sur un projet, vérifier que l'ordre y est cohérent ; réordonner sous un filtre par tag, retirer le filtre, vérifier qu'aucune autre tâche n'a bougé. C'est le scénario que l'ancien code cassait.

- [ ] **Step 7 : Commit**

```bash
git add src/db src/components/layout/TaskList.tsx src/store/tasks.ts
git commit -m "feat: :sparkles: order by a single global fractional key"
```

---

## Task 8 : `deleteProjectGroup` en tombstone

**Files:**
- Modify: `src/db/sqlite-repository.ts`
- Modify: `src/db/sqlite-repository.test.ts`

La migration 007 a donné un `purged_at` à `project_groups` et la 009 un trigger DELETE, mais la méthode fait toujours une suppression physique. L'outbox reçoit donc une entrée pointant vers une ligne qui n'existe plus, et le moteur ne peut pas distinguer « purgé » de « n'a jamais existé ». L'exploration a relevé un second défaut au passage : les `projects.group_id` des projets rattachés ne sont pas remis à NULL, donc ils pointent vers un groupe disparu.

- [ ] **Step 1 : Écrire les tests qui échouent**

```ts
it("tombstones the group instead of deleting the row", async () => {
	const group = await repo.createProjectGroup({ name: "g" });
	await repo.deleteProjectGroup(group.id);
	const rows = await db.select<{ purged_at: string | null }>(
		"SELECT purged_at FROM project_groups WHERE id = ?",
		[group.id],
	);
	expect(rows).toHaveLength(1);
	expect(rows[0].purged_at).not.toBeNull();
});

it("detaches the projects that belonged to it", async () => {
	// Without this the projects keep a group_id pointing at a row no reader
	// can resolve, and the sidebar renders them under a group that is gone.
	const group = await repo.createProjectGroup({ name: "g" });
	const project = await repo.createProject({ name: "p" });
	// CreateProjectInput carries no groupId; the attachment is its own method.
	await repo.assignProjectToGroup(project.id, group.id);
	await repo.deleteProjectGroup(group.id);
	const rows = await db.select<{ group_id: string | null }>(
		"SELECT group_id FROM projects WHERE id = ?",
		[project.id],
	);
	expect(rows[0].group_id).toBeNull();
});

it("stamps both the tombstone and the detached projects", async () => {
	const group = await repo.createProjectGroup({ name: "g" });
	const project = await repo.createProject({ name: "p" });
	await repo.assignProjectToGroup(project.id, group.id);
	await repo.deleteProjectGroup(group.id);
	expect((await groupStampsOf(db, group.id)).purged_at).toBeDefined();
	expect((await projectStampsOf(db, project.id)).group_id).toBeDefined();
});

it("hides the tombstoned group from getProjectGroups", async () => {
	const group = await repo.createProjectGroup({ name: "g" });
	await repo.deleteProjectGroup(group.id);
	expect(await repo.getProjectGroups()).toEqual([]);
});

it("applies the tombstone and the detach atomically", async () => {
	// Half of this pair is worse than neither: a tombstoned group whose
	// projects still point at it renders an unresolvable reference.
	const group = await repo.createProjectGroup({ name: "g" });
	const project = await repo.createProject({ name: "p" });
	await repo.assignProjectToGroup(project.id, group.id);
	db.failNextExecuteMatching(/UPDATE projects SET group_id = NULL/);
	await expect(repo.deleteProjectGroup(group.id)).rejects.toThrow();
	const rows = await db.select<{ purged_at: string | null }>(
		"SELECT purged_at FROM project_groups WHERE id = ?",
		[group.id],
	);
	expect(rows[0].purged_at).toBeNull();
});
```

Le dernier test demande un point d'injection de panne dans `BetterSqliteDriver` (`failNextExecuteMatching`). L'ajouter : c'est le seul moyen de prouver l'atomicité plutôt que de l'affirmer.

- [ ] **Step 2 : Implémenter**

```ts
	async deleteProjectGroup(id: string): Promise<void> {
		const now = new Date().toISOString();
		// Both writes or neither: a tombstoned group whose projects still carry
		// its id renders a reference no reader can resolve.
		await this.db.transaction(async (tx) => {
			await tx.execute(
				"UPDATE projects SET group_id = NULL, updated_at = ? WHERE group_id = ?",
				[now, id],
			);
			await tx.execute(
				"UPDATE project_groups SET purged_at = ?, updated_at = ?, name = '' WHERE id = ?",
				[now, now, id],
			);
			await tx.execute(
				"UPDATE project_groups SET purged_at = ?, updated_at = ?, name = '' WHERE id = ?",
				[now, now, id],
			);
		});

		// Stamped after the transaction commits: _stamp reads the row back, and
		// the detached ids have to be collected before the UPDATE clears them.
		await this._stamp("project_groups", id, ["purged_at", "name"], now);
		for (const projectId of detached) {
			await this._stamp("projects", projectId, ["group_id"], now);
		}
	}
```

`detached` est lu **avant** la transaction (`SELECT id FROM projects WHERE group_id = ?`) : après l'`UPDATE`, plus aucune ligne ne porte ce `group_id` et la liste serait vide.

Filtrer `purged_at IS NULL` dans `getProjectGroups`.

- [ ] **Step 3 : Lancer, vérifier, commit**

```bash
git add src/db src/test-harness
git commit -m "fix: :bug: tombstone project groups instead of deleting them"
```

---

## Task 9 : Sémantique d'import

**Files:**
- Modify: `src/db/sqlite-repository.ts`
- Modify: `src/db/sqlite-repository.test.ts`

Décision du §9.4 : l'import est une **édition locale en masse qui se propage**. Chaque ligne écrite est estampillée à maintenant avec l'identifiant réel ; en mode `replace`, les lignes absentes de la sauvegarde sont **tombstonées**, pas supprimées physiquement.

- [ ] **Step 1 : Écrire les tests qui échouent**

```ts
describe("bulkImport under sync", () => {
	it("stamps every imported row", async () => {
		await repo.bulkImport(exportWith([{ id: "t1", title: "x" }]), "merge");
		expect((await stampsOf(db, "t1")).title).toBeDefined();
	});

	it("does not leave field_updated_at null on a colliding row", async () => {
		// INSERT OR REPLACE is a DELETE-then-INSERT in SQLite, so a colliding row
		// used to lose its stamps, its tombstone and its key in merge mode too —
		// merge was never the gentler option it looked like.
		const task = await repo.createTask({ title: "original" });
		await repo.bulkImport(exportWith([{ id: task.id, title: "imported" }]), "merge");
		const stamps = await stampsOf(db, task.id);
		expect(Object.keys(stamps).length).toBeGreaterThan(0);
	});

	it("preserves sort_key on imported rows", async () => {
		await repo.bulkImport(exportWith([{ id: "t1", title: "x" }]), "merge");
		const rows = await db.select<{ sort_key: string | null }>(
			"SELECT sort_key FROM tasks WHERE id = 't1'",
		);
		expect(rows[0].sort_key).not.toBeNull();
	});

	it("tombstones local rows absent from a replace import", async () => {
		const stays = await repo.createTask({ title: "in the backup" });
		const goes = await repo.createTask({ title: "not in the backup" });
		await repo.bulkImport(exportWith([{ id: stays.id, title: "in the backup" }]), "replace");
		const rows = await db.select<{ id: string; purged_at: string | null }>(
			"SELECT id, purged_at FROM tasks ORDER BY id",
		);
		const byId = new Map(rows.map((r) => [r.id, r.purged_at]));
		expect(byId.get(goes.id)).not.toBeNull();
		expect(byId.get(stays.id)).toBeNull();
	});

	it("does not physically delete rows in replace mode", async () => {
		// A physical DELETE fires the trigger and fills the outbox with entries
		// pointing at rows that no longer exist — the engine cannot tell
		// "purged" from "never existed".
		const goes = await repo.createTask({ title: "x" });
		await repo.bulkImport(exportWith([]), "replace");
		const rows = await db.select<{ n: number }>(
			"SELECT COUNT(*) AS n FROM tasks WHERE id = ?",
			[goes.id],
		);
		expect(rows[0].n).toBe(1);
	});

	it("resurrects a tombstoned task the backup still contains", async () => {
		// This is the documented consequence of "import propagates": restoring a
		// backup older than a deletion undoes that deletion everywhere. The
		// confirmation dialog in the next task is what makes it consented.
		const task = await repo.createTask({ title: "x" });
		await repo.deleteTask(task.id);
		await repo.bulkImport(exportWith([{ id: task.id, title: "x" }]), "merge");
		const rows = await db.select<{ purged_at: string | null }>(
			"SELECT purged_at FROM tasks WHERE id = ?",
			[task.id],
		);
		expect(rows[0].purged_at).toBeNull();
	});

	it("applies the whole import atomically", async () => {
		const before = await repo.getTasks({});
		db.failNextExecuteMatching(/INSERT OR REPLACE INTO tasks/);
		await expect(
			repo.bulkImport(exportWith([{ id: "t1", title: "x" }]), "replace"),
		).rejects.toThrow();
		expect(await repo.getTasks({})).toEqual(before);
	});
});
```

- [ ] **Step 2 : Implémenter**

Envelopper tout `bulkImport` dans `this.db.transaction`, puis remplacer le bloc `replace` :

```ts
		if (strategy === "replace") {
			// Tombstone, don't DELETE. A physical delete fires the outbox trigger
			// on a row that no longer exists, leaving the engine unable to tell
			// "purged" from "never existed" — and the deletion never reaches the
			// other devices, which is the whole point of a replace import.
			const keptIds = data.tasks.map((t) => t.id);
			const placeholders = keptIds.map(() => "?").join(", ");
			await tx.execute(
				keptIds.length > 0
					? `UPDATE tasks SET purged_at = ?, deleted_at = ?, updated_at = ?, title = '', description = NULL
					   WHERE purged_at IS NULL AND id NOT IN (${placeholders})`
					: `UPDATE tasks SET purged_at = ?, deleted_at = ?, updated_at = ?, title = '', description = NULL
					   WHERE purged_at IS NULL`,
				[now, now, now, ...keptIds],
			);
			// Same treatment for projects and tags; task_tags stays a physical
			// delete, it carries no sync identity of its own (spec §1.5).
		}
```

Le `WHERE purged_at IS NULL` évite de ré-estampiller les tombstones déjà posés, ce qui les ferait repartir vers le serveur à chaque import.

Puis ajouter `sort_key` et `field_updated_at` aux colonnes insérées, en dérivant les deux à l'écriture — `_headKey` pour la clé, `stampFields` sur l'ensemble des colonnes que le payload fournit. Enfin, tombstoner ligne par ligne demande un identifiant : les tâches absentes du payload conservent le leur, donc rien à générer.

- [ ] **Step 3 : Lancer, vérifier, commit**

```bash
git add src/db
git commit -m "feat: :sparkles: make importing a backup a change that propagates"
```

---

## Task 10 : Avertissement et confirmation d'import

La seule tâche visible par l'utilisateur, et la contrepartie de la Task 9 : sous synchronisation, restaurer une sauvegarde n'est plus une opération locale, elle réécrit les autres appareils.

**Files:**
- Modify: l'écran d'import dans `src/components/settings/`
- Test: le fichier de test du composant concerné
- Modify: `src/assets/changelog.json`

- [ ] **Step 1 : Localiser le point d'entrée**

```bash
grep -rn "bulkImport" src/components src/store
```

- [ ] **Step 2 : Écrire les tests qui échouent**

Couvrir : le dialogue s'affiche avant tout appel à `bulkImport` ; annuler n'importe rien ; confirmer importe ; le texte du mode `replace` dit explicitement que les tâches absentes de la sauvegarde seront supprimées sur **tous** les appareils.

```tsx
it("does not import until the user confirms", async () => {
	render(<ImportSection />);
	await pickFile(validBackup);
	expect(bulkImport).not.toHaveBeenCalled();
});

it("names the consequence for other devices in replace mode", async () => {
	render(<ImportSection />);
	await pickFile(validBackup);
	await selectMode("replace");
	// The user is about to delete data on machines that are not in front of
	// them. Saying "this cannot be undone" is not enough — say where.
	expect(screen.getByRole("alertdialog")).toHaveTextContent(/autres appareils/i);
});

it("imports once confirmed", async () => {
	render(<ImportSection />);
	await pickFile(validBackup);
	await userEvent.click(screen.getByRole("button", { name: /importer/i }));
	expect(bulkImport).toHaveBeenCalledOnce();
});
```

- [ ] **Step 3 : Implémenter**

Suivre le composant de dialogue déjà utilisé ailleurs dans les réglages plutôt que d'en introduire un nouveau. Le texte doit distinguer les deux modes : `merge` ajoute et écrase les entrées correspondantes, `replace` supprime en plus tout ce qui ne figure pas dans la sauvegarde.

- [ ] **Step 4 : Ajouter l'entrée de changelog**

Contrairement aux neuf tâches précédentes, celle-ci change ce que voit l'utilisateur.

- [ ] **Step 5 : Vérification complète**

```bash
pnpm test:run && pnpm lint && pnpm build
nvm use 22.22.2 && rm -rf ~/.npm/_npx && pnpm run doctor
```

Ne corriger que les diagnostics introduits par ce plan.

- [ ] **Step 6 : Commit**

```bash
git add src/components src/assets/changelog.json
git commit -m "feat: :sparkles: confirm before an import rewrites other devices"
```

---

## Ce que ce plan ne fait pas

- **Aucun réseau.** `sync_outbox` se remplit toujours et personne ne la vide : c'est le plan 4c.
- **`sort_order` reste dans le schéma**, désormais non lu et non écrit. Le supprimer demande une reconstruction de table, et le §9.6 avertit qu'une reconstruction droppe les triggers et les colonnes de sync ajoutées depuis. À faire dans une migration dédiée, pas en passant.
- **Le serveur n'a rien de tout ça.** Ni table d'enregistrements, ni `/v1/sync/push`, ni `/v1/sync/pull` — plan 4b.
- **`LOCAL_DEVICE_ID` disparaît, mais les estampilles héritées gardent un `d` vide.** C'est assumé : on ne peut pas savoir quelle installation les a écrites, et revendiquer leur paternité serait pire.

## Contrainte de livraison

**Les Tasks 2 et 3 doivent partir dans la même release.** Découvert à l'exécution de la Task 2 : `runMigrations` est verrouillé par `user_version` et ne rejoue jamais une migration déjà appliquée. La migration 010 ne nettoie donc que les estampilles `"local"` présentes **avant** la mise à jour — elle ne peut pas repasser.

Or `sqlite-repository.ts` continue d'écrire `"local"` jusqu'à ce que la Task 3 remplace ses points d'appel. Livrer la Task 2 sans la Task 3 produirait des estampilles `"local"` qu'aucun mécanisme ne rattraperait ensuite.

Le cas résiduel, assumé : un utilisateur qui met à jour, revient à une build antérieure, écrit d'autres estampilles, puis remet à jour. La 010 ne se redéclenchera pas pour lui. Il gardera des estampilles sans auteur, qui perdent les égalités au lieu de corrompre des données — jugé préférable à une passe de nettoyage au démarrage qui tournerait à chaque lancement pour toujours.
