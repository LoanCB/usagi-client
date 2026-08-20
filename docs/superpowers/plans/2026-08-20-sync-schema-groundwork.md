# Plan 1 — Fondations de schéma pour la synchronisation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Préparer le schéma SQLite local de Bunly à la synchronisation, de façon purement additive et sans aucun changement visible par l'utilisateur, afin de publier une release dédiée avant tout travail de sync.

**Architecture:** Trois migrations additives (colonnes de sync, clé d'ordonnancement fractionnaire, outbox alimentée par triggers) précédées de trois corrections du moteur de migration, qui ne sait aujourd'hui ni exécuter un trigger ni signaler une erreur. Aucune colonne existante n'est supprimée : `sort_order` est conservée en parallèle de `sort_key` pour permettre un rollback.

**Tech Stack:** TypeScript 5.8, React 19, Vite 7, `@tauri-apps/plugin-sql` (SQLite), Vitest 4, Biome 2, pnpm.

**Spec:** [docs/superpowers/specs/2026-08-20-sync-offline-first-design.md](../specs/2026-08-20-sync-offline-first-design.md) — sections 1.2, 1.3, 1.4, 1.5 et 6.1.

## Global Constraints

- **Gestionnaire de paquets : `pnpm`**, jamais `npm` (CLAUDE.md).
- **Commentaires en anglais**, concis, expliquant le *pourquoi* et non le *quoi* (CLAUDE.md).
- **Indentation : tabulations**, guillemets doubles (biome.json `indentStyle: "tab"`, `quoteStyle: "double"`).
- **Types dans leur propre fichier**, sauf props de composant non partagées (CLAUDE.md).
- Alias d'import : `@` → `./src` (vite.config.ts:9).
- **Fin de tâche obligatoire** (CLAUDE.md) : mettre à jour `src/assets/changelog.json` si le changement est visible par l'utilisateur, lancer react-doctor, puis `pnpm run lint:fix`. Dans ce plan, **seule la Task 10 produit une entrée de changelog** — tout le reste est interne.
- **Contrainte de release :** aucune tâche de ce plan ne doit modifier le comportement observable de l'application. Toute migration est additive ; aucune colonne n'est supprimée ni renommée.
- Les migrations sont chargées via `?raw` de Vite et versionnées par `PRAGMA user_version` (App.tsx:8-14, 116-147).

---

## Contexte critique découvert à l'exploration

Le moteur de migration actuel (App.tsx:133-146) a **deux défauts bloquants** pour ce plan :

1. **Il découpe chaque migration sur `;`.** Un `CREATE TRIGGER` contient des `;` à l'intérieur de son bloc `BEGIN … END`. Le découpage naïf le briserait en fragments invalides. La Task 6 est donc impossible sans la Task 2.
2. **Il avale silencieusement toutes les erreurs** (`.catch(() => {})`). Une migration partiellement appliquée avancerait quand même `user_version`, laissant une base durablement incohérente — sans le moindre signal. C'est acceptable pour les `ALTER TABLE` idempotents que le commentaire vise ; ça ne l'est pas pour des colonnes dont la sync dépendra.

Les tâches 1 à 3 corrigent ces fondations avant toute migration.

## Structure des fichiers

| Fichier | Responsabilité |
|---|---|
| `src/db/migrations/split-statements.ts` | *Créé.* Découpe une migration en statements, en respectant les blocs `BEGIN … END`. Fonction pure, testable seule. |
| `src/db/migrations/run-migrations.ts` | *Créé.* Extrait la boucle de migration hors de `App.tsx`. Gère `user_version` et la politique d'erreur. |
| `src/db/migrations/007_sync_columns.sql` | *Créé.* `field_updated_at` + `purged_at` sur les 4 tables métier. |
| `src/db/migrations/008_sort_key.sql` | *Créé.* Colonne `sort_key TEXT`, additive. |
| `src/db/migrations/009_sync_outbox.sql` | *Créé.* Table `sync_outbox`, table `sync_state`, et 12 triggers. |
| `src/db/backfill-sort-keys.ts` | *Créé.* Remplit `sort_key` à partir de `sort_order`. Non exprimable en SQL pur. |
| `src/db/field-timestamps.ts` | *Créé.* Construction et fusion de la carte `field_updated_at`. |
| `src/test-harness/BetterSqliteDriver.ts` | *Créé.* Implémente `DbDriver` sur un vrai SQLite en mémoire, pour tester migrations et triggers. |
| `src/db/sqlite-repository.ts` | *Modifié.* Maintien de `field_updated_at`, purge au lieu du DELETE, `sort_key` dans le réordonnancement. |
| `src/App.tsx:116-147` | *Modifié.* Délègue à `run-migrations.ts`. |

---

## Task 1 : Harness SQLite réel pour les tests

Les tests actuels de `sqlite-repository.test.ts` mockent `DbDriver` avec `vi.fn()` et inspectent les chaînes SQL (`calls[0][0]).toContain("DELETE FROM task_tags")`). Ce style ne peut pas valider une migration ni un trigger : il faut un vrai moteur SQLite. Ce harness resservira aux tests de convergence du plan 4.

**Files:**
- Create: `src/test-harness/BetterSqliteDriver.ts`
- Create: `src/test-harness/BetterSqliteDriver.test.ts`
- Modify: `package.json` (devDependencies)

**Interfaces:**
- Consumes: `DbDriver`, `QueryResult` depuis `@/db/driver`.
- Produces: `class BetterSqliteDriver implements DbDriver` avec `constructor()` (base en mémoire) et `close(): void`.

- [ ] **Step 1 : Installer la dépendance de test**

```bash
pnpm add -D better-sqlite3 @types/better-sqlite3
```

- [ ] **Step 2 : Écrire le test qui échoue**

Créer `src/test-harness/BetterSqliteDriver.test.ts` :

```ts
// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { BetterSqliteDriver } from "./BetterSqliteDriver";

let driver: BetterSqliteDriver;

afterEach(() => driver?.close());

describe("BetterSqliteDriver", () => {
	it("executes DDL and returns rows from select", async () => {
		driver = new BetterSqliteDriver();
		await driver.execute("CREATE TABLE t (id TEXT PRIMARY KEY, n INTEGER)");
		const res = await driver.execute("INSERT INTO t (id, n) VALUES (?, ?)", [
			"a",
			1,
		]);
		expect(res.rowsAffected).toBe(1);
		const rows = await driver.select<{ id: string; n: number }>(
			"SELECT id, n FROM t WHERE id = ?",
			["a"],
		);
		expect(rows).toEqual([{ id: "a", n: 1 }]);
	});

	it("enforces foreign keys so migration behaviour matches production", async () => {
		driver = new BetterSqliteDriver();
		const rows = await driver.select<{ foreign_keys: number }>(
			"PRAGMA foreign_keys",
		);
		expect(rows[0]?.foreign_keys).toBe(1);
	});
});
```

- [ ] **Step 3 : Lancer le test et vérifier qu'il échoue**

Run: `pnpm vitest run src/test-harness/BetterSqliteDriver.test.ts`
Expected: FAIL — `Failed to resolve import "./BetterSqliteDriver"`.

- [ ] **Step 4 : Implémenter le driver**

Créer `src/test-harness/BetterSqliteDriver.ts` :

```ts
import Database from "better-sqlite3";
import type { DbDriver, QueryResult } from "@/db/driver";

/**
 * Real SQLite behind the DbDriver interface, for tests that must exercise
 * actual SQL: migrations, triggers, CHECK constraints. The production driver
 * wraps tauri-plugin-sql, which cannot run outside a Tauri process.
 */
export class BetterSqliteDriver implements DbDriver {
	private db: Database.Database;

	constructor(filename = ":memory:") {
		this.db = new Database(filename);
		// Match tauri-plugin-sql, which enables FK enforcement per connection.
		this.db.pragma("foreign_keys = ON");
	}

	execute(query: string, bindValues: unknown[] = []): Promise<QueryResult> {
		const info = this.db.prepare(query).run(...(bindValues as never[]));
		return Promise.resolve({
			rowsAffected: info.changes,
			lastInsertId: Number(info.lastInsertRowid),
		});
	}

	select<T>(query: string, bindValues: unknown[] = []): Promise<T[]> {
		const rows = this.db.prepare(query).all(...(bindValues as never[]));
		return Promise.resolve(rows as T[]);
	}

	close(): void {
		this.db.close();
	}
}
```

- [ ] **Step 5 : Lancer le test et vérifier qu'il passe**

Run: `pnpm vitest run src/test-harness/BetterSqliteDriver.test.ts`
Expected: PASS (2 tests).

Si le premier test échoue sur `PRAGMA foreign_keys` renvoyant `undefined` : `better-sqlite3` retourne les PRAGMA via `.pragma()` et non `.all()`. Dans ce cas, remplacer l'assertion par `expect(driver["db"].pragma("foreign_keys", { simple: true })).toBe(1)` — mais tenter d'abord la version ci-dessus, `prepare("PRAGMA foreign_keys").all()` fonctionne sur better-sqlite3 ≥ 9.

- [ ] **Step 6 : Commit**

```bash
git add package.json pnpm-lock.yaml src/test-harness/BetterSqliteDriver.ts src/test-harness/BetterSqliteDriver.test.ts
git commit -m "test: :white_check_mark: add real SQLite driver for migration tests"
```

---

## Task 2 : Découpage des migrations compatible triggers

**Files:**
- Create: `src/db/migrations/split-statements.ts`
- Create: `src/db/migrations/split-statements.test.ts`

**Interfaces:**
- Produces: `export function splitStatements(sql: string): string[]`

- [ ] **Step 1 : Écrire le test qui échoue**

Créer `src/db/migrations/split-statements.test.ts` :

```ts
import { describe, expect, it } from "vitest";
import { splitStatements } from "./split-statements";

describe("splitStatements", () => {
	it("splits plain statements on semicolons", () => {
		expect(splitStatements("CREATE TABLE a (id TEXT); CREATE TABLE b (id TEXT);"))
			.toEqual(["CREATE TABLE a (id TEXT)", "CREATE TABLE b (id TEXT)"]);
	});

	it("drops empty fragments and trims whitespace", () => {
		expect(splitStatements("\n  SELECT 1;\n\n  ;\n")).toEqual(["SELECT 1"]);
	});

	it("keeps a trigger body intact despite inner semicolons", () => {
		const sql = `
CREATE TRIGGER trg AFTER INSERT ON tasks
BEGIN
  INSERT INTO sync_outbox (entity_type, entity_id) VALUES ('task', NEW.id);
  UPDATE meta SET n = n + 1;
END;
CREATE INDEX idx ON tasks(id);`;
		const out = splitStatements(sql);
		expect(out).toHaveLength(2);
		expect(out[0]).toContain("CREATE TRIGGER trg");
		expect(out[0]).toContain("UPDATE meta SET n = n + 1;");
		expect(out[0].endsWith("END")).toBe(true);
		expect(out[1]).toBe("CREATE INDEX idx ON tasks(id)");
	});

	it("ignores semicolons inside string literals", () => {
		expect(splitStatements("INSERT INTO t VALUES ('a;b');")).toEqual([
			"INSERT INTO t VALUES ('a;b')",
		]);
	});
});
```

- [ ] **Step 2 : Lancer le test et vérifier qu'il échoue**

Run: `pnpm vitest run src/db/migrations/split-statements.test.ts`
Expected: FAIL — `Failed to resolve import "./split-statements"`.

- [ ] **Step 3 : Implémenter**

Créer `src/db/migrations/split-statements.ts` :

```ts
/**
 * Split a migration file into executable statements.
 *
 * A naive split on ";" breaks CREATE TRIGGER: its BEGIN…END body contains
 * semicolons that belong to the trigger, not to the migration. This scanner
 * tracks single-quoted literals and BEGIN…END nesting so trigger bodies stay
 * whole.
 */
export function splitStatements(sql: string): string[] {
	const statements: string[] = [];
	let current = "";
	let inString = false;
	let blockDepth = 0;

	for (let i = 0; i < sql.length; i++) {
		const char = sql[i];

		if (char === "'") {
			// Doubled quotes ('') are an escaped quote inside a literal, not a close.
			if (inString && sql[i + 1] === "'") {
				current += "''";
				i++;
				continue;
			}
			inString = !inString;
			current += char;
			continue;
		}

		if (!inString) {
			const ahead = sql.slice(i);
			if (/^\bBEGIN\b/i.test(ahead)) blockDepth++;
			else if (/^\bEND\b/i.test(ahead) && blockDepth > 0) blockDepth--;

			if (char === ";" && blockDepth === 0) {
				const trimmed = current.trim();
				if (trimmed) statements.push(trimmed);
				current = "";
				continue;
			}
		}

		current += char;
	}

	const tail = current.trim();
	if (tail) statements.push(tail);
	return statements;
}
```

- [ ] **Step 4 : Lancer le test et vérifier qu'il passe**

Run: `pnpm vitest run src/db/migrations/split-statements.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5 : Commit**

```bash
git add src/db/migrations/split-statements.ts src/db/migrations/split-statements.test.ts
git commit -m "fix: :bug: keep trigger bodies intact when splitting migrations"
```

---

## Task 3 : Extraire et fiabiliser le moteur de migration

**Files:**
- Create: `src/db/migrations/run-migrations.ts`
- Create: `src/db/migrations/run-migrations.test.ts`
- Modify: `src/App.tsx:116-147`

**Interfaces:**
- Consumes: `splitStatements` (Task 2), `DbDriver`, `BetterSqliteDriver` (Task 1).
- Produces: `export async function runMigrations(db: DbDriver, migrations: string[]): Promise<void>`

- [ ] **Step 1 : Écrire le test qui échoue**

Créer `src/db/migrations/run-migrations.test.ts` :

```ts
// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { BetterSqliteDriver } from "@/test-harness/BetterSqliteDriver";
import { runMigrations } from "./run-migrations";

let driver: BetterSqliteDriver;
afterEach(() => driver?.close());

async function userVersion(d: BetterSqliteDriver): Promise<number> {
	const rows = await d.select<{ user_version: number }>("PRAGMA user_version");
	return rows[0]?.user_version ?? 0;
}

describe("runMigrations", () => {
	it("applies every migration and advances user_version", async () => {
		driver = new BetterSqliteDriver();
		await runMigrations(driver, [
			"CREATE TABLE a (id TEXT PRIMARY KEY);",
			"CREATE TABLE b (id TEXT PRIMARY KEY);",
		]);
		expect(await userVersion(driver)).toBe(2);
	});

	it("skips migrations already applied", async () => {
		driver = new BetterSqliteDriver();
		await runMigrations(driver, ["CREATE TABLE a (id TEXT PRIMARY KEY);"]);
		// Re-running with the same list must not fail on "table a already exists".
		await runMigrations(driver, ["CREATE TABLE a (id TEXT PRIMARY KEY);"]);
		expect(await userVersion(driver)).toBe(1);
	});

	it("tolerates duplicate-column errors from legacy re-runs", async () => {
		driver = new BetterSqliteDriver();
		await driver.execute("CREATE TABLE a (id TEXT PRIMARY KEY, extra TEXT)");
		await runMigrations(driver, ["ALTER TABLE a ADD COLUMN extra TEXT;"]);
		expect(await userVersion(driver)).toBe(1);
	});

	it("throws on a real error instead of advancing user_version", async () => {
		driver = new BetterSqliteDriver();
		await expect(
			runMigrations(driver, ["CREATE TABLE (((;"]),
		).rejects.toThrow();
		expect(await userVersion(driver)).toBe(0);
	});
});
```

- [ ] **Step 2 : Lancer le test et vérifier qu'il échoue**

Run: `pnpm vitest run src/db/migrations/run-migrations.test.ts`
Expected: FAIL — `Failed to resolve import "./run-migrations"`.

- [ ] **Step 3 : Implémenter**

Créer `src/db/migrations/run-migrations.ts` :

```ts
import type { DbDriver } from "@/db/driver";
import { splitStatements } from "./split-statements";

/**
 * Errors that are safe to ignore: legacy databases whose user_version was never
 * advanced re-run ALTER TABLE statements whose column already exists. Anything
 * else must abort so user_version is not advanced over a half-applied schema.
 */
function isIgnorable(message: string): boolean {
	return /duplicate column name/i.test(message);
}

export async function runMigrations(
	db: DbDriver,
	migrations: string[],
): Promise<void> {
	const versionRows = await db.select<{ user_version: number }>(
		"PRAGMA user_version",
	);
	const applied = versionRows[0]?.user_version ?? 0;

	for (let version = applied; version < migrations.length; version++) {
		for (const statement of splitStatements(migrations[version])) {
			try {
				// oxlint-disable-next-line react-doctor/async-await-in-loop -- intentional: migration statements are ordered DDL that must run sequentially; parallelizing would race the SQLite lock and corrupt schema order
				await db.execute(statement);
			} catch (err) {
				if (!isIgnorable(String(err))) {
					throw new Error(
						`Migration ${version + 1} failed on statement: ${statement}\n${String(err)}`,
					);
				}
			}
		}
		await db.execute(`PRAGMA user_version = ${version + 1}`);
	}
}
```

- [ ] **Step 4 : Lancer le test et vérifier qu'il passe**

Run: `pnpm vitest run src/db/migrations/run-migrations.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5 : Brancher `App.tsx` sur le nouveau moteur**

Dans `src/App.tsx`, remplacer le corps de `init()` (lignes 116-147) par :

```ts
async function init() {
	try {
		const db = await Database.load("sqlite:usagi.db");
		await runMigrations(createDriver(db), [
			migrationSql,
			migration002,
			migration003,
			migration004,
			migration005,
			migration006,
		]);
		setRepository(createRepository(db));
		setReady(true);
	} catch (err) {
		setError(String(err));
	}
}
```

Ajouter l'import : `import { runMigrations } from "@/db/migrations/run-migrations";`

`createDriver` est l'adaptateur Tauri→`DbDriver` déjà utilisé par `createRepository` dans `src/db/index.ts`. S'il n'y est pas exporté séparément, l'en extraire et l'exporter — `createRepository` doit continuer de l'utiliser, sans duplication.

- [ ] **Step 6 : Vérifier la non-régression complète**

Run: `pnpm test:run`
Expected: PASS — l'intégralité de la suite existante.

Run: `pnpm build`
Expected: succès de `tsc` puis de `vite build`.

- [ ] **Step 7 : Commit**

```bash
git add src/db/migrations/run-migrations.ts src/db/migrations/run-migrations.test.ts src/App.tsx src/db/index.ts
git commit -m "refactor: :recycle: extract migration runner and fail loudly on real errors"
```

---

## Task 4 : Migration 007 — colonnes de synchronisation

**Files:**
- Create: `src/db/migrations/007_sync_columns.sql`
- Create: `src/db/migrations/migrations.test.ts`
- Modify: `src/App.tsx` (import + tableau)

**Interfaces:**
- Consumes: `runMigrations` (Task 3), `BetterSqliteDriver` (Task 1).
- Produces: colonnes `field_updated_at TEXT` et `purged_at TEXT` sur `tasks`, `projects`, `tags`, `project_groups`.

- [ ] **Step 1 : Écrire le test qui échoue**

Créer `src/db/migrations/migrations.test.ts` :

```ts
// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { BetterSqliteDriver } from "@/test-harness/BetterSqliteDriver";
import { ALL_MIGRATIONS } from "./index";
import { runMigrations } from "./run-migrations";

let driver: BetterSqliteDriver;
afterEach(() => driver?.close());

async function columns(d: BetterSqliteDriver, table: string): Promise<string[]> {
	const rows = await d.select<{ name: string }>(`PRAGMA table_info(${table})`);
	return rows.map((r) => r.name);
}

const SYNCED_TABLES = ["tasks", "projects", "tags", "project_groups"];

describe("migrations", () => {
	it("applies the full chain on a fresh database", async () => {
		driver = new BetterSqliteDriver();
		await expect(runMigrations(driver, ALL_MIGRATIONS)).resolves.toBeUndefined();
	});

	it("adds field_updated_at and purged_at to every synced table", async () => {
		driver = new BetterSqliteDriver();
		await runMigrations(driver, ALL_MIGRATIONS);
		for (const table of SYNCED_TABLES) {
			const cols = await columns(driver, table);
			expect(cols, `${table}.field_updated_at`).toContain("field_updated_at");
			expect(cols, `${table}.purged_at`).toContain("purged_at");
		}
	});

	it("keeps sort_order so the migration stays reversible", async () => {
		driver = new BetterSqliteDriver();
		await runMigrations(driver, ALL_MIGRATIONS);
		expect(await columns(driver, "tasks")).toContain("sort_order");
	});

	it("preserves existing rows through the migration", async () => {
		driver = new BetterSqliteDriver();
		// Stop before 007 to seed a pre-migration database.
		await runMigrations(driver, ALL_MIGRATIONS.slice(0, 6));
		await driver.execute(
			"INSERT INTO tasks (id, title, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
			["t1", "Legacy task", 3, "2026-01-01T00:00:00Z", "2026-01-01T00:00:00Z"],
		);
		await runMigrations(driver, ALL_MIGRATIONS);
		const rows = await driver.select<{ title: string; purged_at: string | null }>(
			"SELECT title, purged_at FROM tasks WHERE id = ?",
			["t1"],
		);
		expect(rows[0]).toEqual({ title: "Legacy task", purged_at: null });
	});
});
```

- [ ] **Step 2 : Créer le module d'index des migrations**

Créer `src/db/migrations/index.ts` — il devient la source unique de la liste, pour que `App.tsx` et les tests ne puissent pas diverger :

```ts
import m001 from "./001_initial.sql?raw";
import m002 from "./002_add_description.sql?raw";
import m003 from "./003_settings.sql?raw";
import m004 from "./004_tags_project_scope.sql?raw";
import m005 from "./005_project_groups.sql?raw";
import m006 from "./006_extend_priority.sql?raw";
import m007 from "./007_sync_columns.sql?raw";

/** Ordered migration list. Append only — the index is the schema version. */
export const ALL_MIGRATIONS = [m001, m002, m003, m004, m005, m006, m007];
```

- [ ] **Step 3 : Lancer le test et vérifier qu'il échoue**

Run: `pnpm vitest run src/db/migrations/migrations.test.ts`
Expected: FAIL — `Failed to resolve import "./007_sync_columns.sql?raw"`.

- [ ] **Step 4 : Écrire la migration**

Créer `src/db/migrations/007_sync_columns.sql` :

```sql
-- Sync groundwork. Additive only: no column is dropped or renamed, so this
-- migration is safe to ship ahead of the sync engine and can be rolled back by
-- reverting the client.
--
-- field_updated_at holds a JSON map of {column: {t: iso8601, d: device_id}},
-- the basis for field-level last-writer-wins merging.
--
-- purged_at marks a permanently deleted row that must survive as a tombstone so
-- the deletion can propagate. It is distinct from deleted_at, which means
-- "archived" and is user-reversible.
ALTER TABLE tasks          ADD COLUMN field_updated_at TEXT;
ALTER TABLE tasks          ADD COLUMN purged_at        TEXT;

ALTER TABLE projects       ADD COLUMN field_updated_at TEXT;
ALTER TABLE projects       ADD COLUMN purged_at        TEXT;

ALTER TABLE tags           ADD COLUMN field_updated_at TEXT;
ALTER TABLE tags           ADD COLUMN purged_at        TEXT;

ALTER TABLE project_groups ADD COLUMN field_updated_at TEXT;
ALTER TABLE project_groups ADD COLUMN purged_at        TEXT;

CREATE INDEX IF NOT EXISTS idx_tasks_purged_at          ON tasks(purged_at);
CREATE INDEX IF NOT EXISTS idx_projects_purged_at       ON projects(purged_at);
CREATE INDEX IF NOT EXISTS idx_tags_purged_at           ON tags(purged_at);
CREATE INDEX IF NOT EXISTS idx_project_groups_purged_at ON project_groups(purged_at);
```

- [ ] **Step 5 : Lancer le test et vérifier qu'il passe**

Run: `pnpm vitest run src/db/migrations/migrations.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6 : Faire consommer l'index par `App.tsx`**

Remplacer dans `src/App.tsx` les six imports `migration00X` (lignes 8-14) et le tableau littéral par :

```ts
import { ALL_MIGRATIONS } from "@/db/migrations";
```

et dans `init()` : `await runMigrations(createDriver(db), ALL_MIGRATIONS);`

- [ ] **Step 7 : Vérifier la suite complète**

Run: `pnpm test:run && pnpm build`
Expected: PASS puis build réussi.

- [ ] **Step 8 : Commit**

```bash
git add src/db/migrations/007_sync_columns.sql src/db/migrations/index.ts src/db/migrations/migrations.test.ts src/App.tsx
git commit -m "feat: :sparkles: add field_updated_at and purged_at sync columns"
```

---

## Task 5 : Migration 008 — clé d'ordonnancement fractionnaire

`sort_order INTEGER` force à renuméroter toutes les lignes à chaque réordonnancement, ce qui garantit un conflit sur chaque tâche entre deux appareils. Une clé fractionnaire ramène un déplacement à une seule ligne modifiée. La colonne est **ajoutée à côté** de `sort_order`, qui reste alimentée — le rollback reste possible.

**Files:**
- Create: `src/db/migrations/008_sort_key.sql`
- Create: `src/db/backfill-sort-keys.ts`
- Create: `src/db/backfill-sort-keys.test.ts`
- Modify: `src/db/migrations/index.ts`
- Modify: `package.json` (dependencies)

**Interfaces:**
- Consumes: `DbDriver`, `runMigrations` (Task 3).
- Produces: `export async function backfillSortKeys(db: DbDriver): Promise<void>`, colonne `sort_key TEXT` sur `tasks`, `projects`, `project_groups`.

- [ ] **Step 1 : Installer la dépendance**

```bash
pnpm add fractional-indexing
```

- [ ] **Step 2 : Écrire le test qui échoue**

Créer `src/db/backfill-sort-keys.test.ts` :

```ts
// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { BetterSqliteDriver } from "@/test-harness/BetterSqliteDriver";
import { backfillSortKeys } from "./backfill-sort-keys";
import { ALL_MIGRATIONS } from "./migrations";
import { runMigrations } from "./migrations/run-migrations";

let driver: BetterSqliteDriver;
afterEach(() => driver?.close());

async function seedTask(d: BetterSqliteDriver, id: string, order: number) {
	await d.execute(
		"INSERT INTO tasks (id, title, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
		[id, id, order, "2026-01-01T00:00:00Z", "2026-01-01T00:00:00Z"],
	);
}

describe("backfillSortKeys", () => {
	it("assigns keys that sort in the same order as sort_order", async () => {
		driver = new BetterSqliteDriver();
		await runMigrations(driver, ALL_MIGRATIONS);
		await seedTask(driver, "c", 2);
		await seedTask(driver, "a", 0);
		await seedTask(driver, "b", 1);

		await backfillSortKeys(driver);

		const rows = await driver.select<{ id: string }>(
			"SELECT id FROM tasks ORDER BY sort_key",
		);
		expect(rows.map((r) => r.id)).toEqual(["a", "b", "c"]);
	});

	it("never leaves a null sort_key", async () => {
		driver = new BetterSqliteDriver();
		await runMigrations(driver, ALL_MIGRATIONS);
		await seedTask(driver, "a", 0);
		await backfillSortKeys(driver);
		const rows = await driver.select<{ n: number }>(
			"SELECT COUNT(*) AS n FROM tasks WHERE sort_key IS NULL",
		);
		expect(rows[0]?.n).toBe(0);
	});

	it("is idempotent and leaves already-keyed rows untouched", async () => {
		driver = new BetterSqliteDriver();
		await runMigrations(driver, ALL_MIGRATIONS);
		await seedTask(driver, "a", 0);
		await seedTask(driver, "b", 1);
		await backfillSortKeys(driver);
		const first = await driver.select<{ id: string; sort_key: string }>(
			"SELECT id, sort_key FROM tasks ORDER BY id",
		);
		await backfillSortKeys(driver);
		const second = await driver.select<{ id: string; sort_key: string }>(
			"SELECT id, sort_key FROM tasks ORDER BY id",
		);
		expect(second).toEqual(first);
	});

	it("handles an empty table without throwing", async () => {
		driver = new BetterSqliteDriver();
		await runMigrations(driver, ALL_MIGRATIONS);
		await expect(backfillSortKeys(driver)).resolves.toBeUndefined();
	});
});
```

- [ ] **Step 3 : Lancer le test et vérifier qu'il échoue**

Run: `pnpm vitest run src/db/backfill-sort-keys.test.ts`
Expected: FAIL — `Failed to resolve import "./backfill-sort-keys"`.

- [ ] **Step 4 : Écrire la migration**

Créer `src/db/migrations/008_sort_key.sql` :

```sql
-- Fractional index key, replacing integer sort_order for ordering.
--
-- Reordering with integers renumbers every row, so two offline devices conflict
-- on every task. A fractional key changes exactly one row per move, which
-- removes the conflict structurally rather than arbitrating it.
--
-- sort_order is deliberately kept and still written, so this release can be
-- rolled back. It is dropped in a later release, once sync has shipped.
--
-- Values are backfilled by backfillSortKeys(), which runs right after the
-- migration chain: fractional keys cannot be generated in pure SQL.
ALTER TABLE tasks          ADD COLUMN sort_key TEXT;
ALTER TABLE projects       ADD COLUMN sort_key TEXT;
ALTER TABLE project_groups ADD COLUMN sort_key TEXT;

CREATE INDEX IF NOT EXISTS idx_tasks_sort_key          ON tasks(sort_key);
CREATE INDEX IF NOT EXISTS idx_projects_sort_key       ON projects(sort_key);
CREATE INDEX IF NOT EXISTS idx_project_groups_sort_key ON project_groups(sort_key);
```

Ajouter à `src/db/migrations/index.ts` :

```ts
import m008 from "./008_sort_key.sql?raw";
export const ALL_MIGRATIONS = [m001, m002, m003, m004, m005, m006, m007, m008];
```

- [ ] **Step 5 : Écrire le backfill**

Créer `src/db/backfill-sort-keys.ts` :

```ts
import { generateNKeysBetween } from "fractional-indexing";
import type { DbDriver } from "./driver";

const ORDERED_TABLES = ["tasks", "projects", "project_groups"] as const;

/**
 * Fill sort_key for rows that have none, preserving the order sort_order gave
 * them. Runs after every migration pass: it is idempotent, so rows keyed by an
 * earlier run keep their value and stay stable across devices.
 */
export async function backfillSortKeys(db: DbDriver): Promise<void> {
	for (const table of ORDERED_TABLES) {
		// oxlint-disable-next-line react-doctor/async-await-in-loop -- intentional: each table is a separate ordered backfill; concurrency would interleave writes on one SQLite connection
		const rows = await db.select<{ id: string }>(
			`SELECT id FROM ${table} WHERE sort_key IS NULL ORDER BY sort_order ASC, created_at ASC, id ASC`,
		);
		if (rows.length === 0) continue;

		// Anchor after the highest existing key so a partial backfill stays ordered.
		const maxRows = await db.select<{ max_key: string | null }>(
			`SELECT MAX(sort_key) AS max_key FROM ${table}`,
		);
		const after = maxRows[0]?.max_key ?? null;
		const keys = generateNKeysBetween(after, null, rows.length);

		for (let i = 0; i < rows.length; i++) {
			// oxlint-disable-next-line react-doctor/async-await-in-loop -- intentional: ordered writes on a single SQLite connection
			await db.execute(`UPDATE ${table} SET sort_key = ? WHERE id = ?`, [
				keys[i],
				rows[i].id,
			]);
		}
	}
}
```

- [ ] **Step 6 : Lancer le test et vérifier qu'il passe**

Run: `pnpm vitest run src/db/backfill-sort-keys.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 7 : Appeler le backfill après les migrations**

Dans `src/App.tsx`, `init()` :

```ts
const driver = createDriver(db);
await runMigrations(driver, ALL_MIGRATIONS);
await backfillSortKeys(driver);
```

Ajouter : `import { backfillSortKeys } from "@/db/backfill-sort-keys";`

- [ ] **Step 8 : Vérifier la suite complète**

Run: `pnpm test:run && pnpm build`
Expected: PASS puis build réussi.

- [ ] **Step 9 : Commit**

```bash
git add package.json pnpm-lock.yaml src/db/migrations/008_sort_key.sql src/db/migrations/index.ts src/db/backfill-sort-keys.ts src/db/backfill-sort-keys.test.ts src/App.tsx
git commit -m "feat: :sparkles: add fractional sort_key alongside sort_order"
```

---

## Task 6 : Migration 009 — outbox et triggers

**Files:**
- Create: `src/db/migrations/009_sync_outbox.sql`
- Create: `src/db/migrations/outbox.test.ts`
- Modify: `src/db/migrations/index.ts`

**Interfaces:**
- Produces: tables `sync_outbox(entity_type, entity_id, dirtied_at)` et `sync_state(key, value)`, plus 12 triggers nommés `trg_<table>_outbox_<ins|upd|del>`.

- [ ] **Step 1 : Écrire le test qui échoue**

Créer `src/db/migrations/outbox.test.ts` :

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

async function outbox(): Promise<{ entity_type: string; entity_id: string }[]> {
	return driver.select("SELECT entity_type, entity_id FROM sync_outbox ORDER BY entity_id");
}

async function insertTask(id: string) {
	await driver.execute(
		"INSERT INTO tasks (id, title, sort_order, created_at, updated_at) VALUES (?, ?, 0, ?, ?)",
		[id, id, "2026-01-01T00:00:00Z", "2026-01-01T00:00:00Z"],
	);
}

describe("sync_outbox triggers", () => {
	it("records an insert", async () => {
		await insertTask("t1");
		expect(await outbox()).toEqual([{ entity_type: "task", entity_id: "t1" }]);
	});

	it("records an update", async () => {
		await insertTask("t1");
		await driver.execute("DELETE FROM sync_outbox");
		await driver.execute("UPDATE tasks SET title = ? WHERE id = ?", ["new", "t1"]);
		expect(await outbox()).toEqual([{ entity_type: "task", entity_id: "t1" }]);
	});

	it("records a hard delete using the old row id", async () => {
		await insertTask("t1");
		await driver.execute("DELETE FROM sync_outbox");
		await driver.execute("DELETE FROM tasks WHERE id = ?", ["t1"]);
		expect(await outbox()).toEqual([{ entity_type: "task", entity_id: "t1" }]);
	});

	it("deduplicates repeated writes to one row", async () => {
		await insertTask("t1");
		await driver.execute("UPDATE tasks SET title = 'a' WHERE id = 't1'");
		await driver.execute("UPDATE tasks SET title = 'b' WHERE id = 't1'");
		expect(await outbox()).toHaveLength(1);
	});

	it("covers projects, tags and project_groups too", async () => {
		await driver.execute(
			"INSERT INTO projects (id, name, sort_order, created_at, updated_at) VALUES ('p1','P',0,'x','x')",
		);
		await driver.execute(
			"INSERT INTO tags (id, name, created_at, updated_at) VALUES ('g1','G','x','x')",
		);
		await driver.execute(
			"INSERT INTO project_groups (id, name, color, sort_order, created_at, updated_at) VALUES ('pg1','PG','#fff',0,'x','x')",
		);
		const types = (await outbox()).map((r) => r.entity_type).sort();
		expect(types).toEqual(["project", "project_group", "tag"]);
	});

	it("stamps dirtied_at as an ISO 8601 UTC timestamp", async () => {
		await insertTask("t1");
		const rows = await driver.select<{ dirtied_at: string }>(
			"SELECT dirtied_at FROM sync_outbox",
		);
		expect(rows[0]?.dirtied_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
	});
});
```

- [ ] **Step 2 : Lancer le test et vérifier qu'il échoue**

Run: `pnpm vitest run src/db/migrations/outbox.test.ts`
Expected: FAIL — `no such table: sync_outbox`.

- [ ] **Step 3 : Écrire la migration**

Créer `src/db/migrations/009_sync_outbox.sql`. Les triggers sont volontairement répétitifs : SQLite n'a ni trigger générique ni table paramétrable.

```sql
-- Dirty-set of rows awaiting push, plus sync engine key/value state.
--
-- Triggers rather than repository instrumentation: the marking then shares the
-- writing transaction, so a crash cannot lose a change, and every future write
-- path is covered without touching sqlite-repository.ts.
--
-- This is a dirty set, not an operation log: PRIMARY KEY + INSERT OR REPLACE
-- collapses repeated writes to one row. The engine reads current row state at
-- push time, which makes push idempotent.
--
-- NOTE for the sync engine: applying a remote change fires these triggers too.
-- The engine must clear the outbox rows it caused, inside the same transaction,
-- except where the merge produced state the server does not yet have.
--
-- NOTE for future migrations: a table rebuild (see 006) drops its triggers.
-- Any migration rebuilding a synced table must recreate them.
CREATE TABLE IF NOT EXISTS sync_outbox (
  entity_type TEXT NOT NULL,
  entity_id   TEXT NOT NULL,
  dirtied_at  TEXT NOT NULL,
  PRIMARY KEY (entity_type, entity_id)
);

CREATE TABLE IF NOT EXISTS sync_state (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TRIGGER IF NOT EXISTS trg_tasks_outbox_ins AFTER INSERT ON tasks
BEGIN
  INSERT OR REPLACE INTO sync_outbox (entity_type, entity_id, dirtied_at)
  VALUES ('task', NEW.id, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
END;

CREATE TRIGGER IF NOT EXISTS trg_tasks_outbox_upd AFTER UPDATE ON tasks
BEGIN
  INSERT OR REPLACE INTO sync_outbox (entity_type, entity_id, dirtied_at)
  VALUES ('task', NEW.id, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
END;

CREATE TRIGGER IF NOT EXISTS trg_tasks_outbox_del AFTER DELETE ON tasks
BEGIN
  INSERT OR REPLACE INTO sync_outbox (entity_type, entity_id, dirtied_at)
  VALUES ('task', OLD.id, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
END;

CREATE TRIGGER IF NOT EXISTS trg_projects_outbox_ins AFTER INSERT ON projects
BEGIN
  INSERT OR REPLACE INTO sync_outbox (entity_type, entity_id, dirtied_at)
  VALUES ('project', NEW.id, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
END;

CREATE TRIGGER IF NOT EXISTS trg_projects_outbox_upd AFTER UPDATE ON projects
BEGIN
  INSERT OR REPLACE INTO sync_outbox (entity_type, entity_id, dirtied_at)
  VALUES ('project', NEW.id, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
END;

CREATE TRIGGER IF NOT EXISTS trg_projects_outbox_del AFTER DELETE ON projects
BEGIN
  INSERT OR REPLACE INTO sync_outbox (entity_type, entity_id, dirtied_at)
  VALUES ('project', OLD.id, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
END;

CREATE TRIGGER IF NOT EXISTS trg_tags_outbox_ins AFTER INSERT ON tags
BEGIN
  INSERT OR REPLACE INTO sync_outbox (entity_type, entity_id, dirtied_at)
  VALUES ('tag', NEW.id, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
END;

CREATE TRIGGER IF NOT EXISTS trg_tags_outbox_upd AFTER UPDATE ON tags
BEGIN
  INSERT OR REPLACE INTO sync_outbox (entity_type, entity_id, dirtied_at)
  VALUES ('tag', NEW.id, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
END;

CREATE TRIGGER IF NOT EXISTS trg_tags_outbox_del AFTER DELETE ON tags
BEGIN
  INSERT OR REPLACE INTO sync_outbox (entity_type, entity_id, dirtied_at)
  VALUES ('tag', OLD.id, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
END;

CREATE TRIGGER IF NOT EXISTS trg_project_groups_outbox_ins AFTER INSERT ON project_groups
BEGIN
  INSERT OR REPLACE INTO sync_outbox (entity_type, entity_id, dirtied_at)
  VALUES ('project_group', NEW.id, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
END;

CREATE TRIGGER IF NOT EXISTS trg_project_groups_outbox_upd AFTER UPDATE ON project_groups
BEGIN
  INSERT OR REPLACE INTO sync_outbox (entity_type, entity_id, dirtied_at)
  VALUES ('project_group', NEW.id, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
END;

CREATE TRIGGER IF NOT EXISTS trg_project_groups_outbox_del AFTER DELETE ON project_groups
BEGIN
  INSERT OR REPLACE INTO sync_outbox (entity_type, entity_id, dirtied_at)
  VALUES ('project_group', OLD.id, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
END;
```

Ajouter à `src/db/migrations/index.ts` :

```ts
import m009 from "./009_sync_outbox.sql?raw";
export const ALL_MIGRATIONS = [m001, m002, m003, m004, m005, m006, m007, m008, m009];
```

- [ ] **Step 4 : Lancer le test et vérifier qu'il passe**

Run: `pnpm vitest run src/db/migrations/outbox.test.ts`
Expected: PASS (6 tests).

Ce test valide en même temps la Task 2 de bout en bout : sans le découpage compatible triggers, aucun de ces `CREATE TRIGGER` ne s'exécuterait.

- [ ] **Step 5 : Vérifier la suite complète**

Run: `pnpm test:run && pnpm build`
Expected: PASS puis build réussi.

- [ ] **Step 6 : Commit**

```bash
git add src/db/migrations/009_sync_outbox.sql src/db/migrations/index.ts src/db/migrations/outbox.test.ts
git commit -m "feat: :sparkles: add sync outbox fed by SQLite triggers"
```

---

## Task 7 : Maintien de `field_updated_at` dans le repository

**Files:**
- Create: `src/db/field-timestamps.ts`
- Create: `src/db/field-timestamps.test.ts`
- Modify: `src/db/sqlite-repository.ts` (`createTask` 461-488, `updateTask` 490-531)

**Interfaces:**
- Produces:
  - `export interface FieldStamp { t: string; d: string }`
  - `export type FieldStamps = Record<string, FieldStamp>`
  - `export function stampFields(existing: string | null, fields: string[], now: string, deviceId: string): string`

- [ ] **Step 1 : Écrire le test qui échoue**

Créer `src/db/field-timestamps.test.ts` :

```ts
import { describe, expect, it } from "vitest";
import { type FieldStamps, stampFields } from "./field-timestamps";

const NOW = "2026-08-20T10:00:00.000Z";
const DEV = "device-a";

function parse(json: string): FieldStamps {
	return JSON.parse(json) as FieldStamps;
}

describe("stampFields", () => {
	it("creates a map from nothing", () => {
		expect(parse(stampFields(null, ["title"], NOW, DEV))).toEqual({
			title: { t: NOW, d: DEV },
		});
	});

	it("adds fields without dropping existing ones", () => {
		const before = JSON.stringify({ title: { t: "2026-01-01T00:00:00.000Z", d: "device-b" } });
		expect(parse(stampFields(before, ["priority"], NOW, DEV))).toEqual({
			title: { t: "2026-01-01T00:00:00.000Z", d: "device-b" },
			priority: { t: NOW, d: DEV },
		});
	});

	it("overwrites the stamp of a re-edited field", () => {
		const before = JSON.stringify({ title: { t: "2026-01-01T00:00:00.000Z", d: "device-b" } });
		expect(parse(stampFields(before, ["title"], NOW, DEV))).toEqual({
			title: { t: NOW, d: DEV },
		});
	});

	it("recovers from corrupt JSON rather than throwing", () => {
		expect(parse(stampFields("{not json", ["title"], NOW, DEV))).toEqual({
			title: { t: NOW, d: DEV },
		});
	});

	it("returns the existing map untouched when no field changed", () => {
		const before = JSON.stringify({ title: { t: NOW, d: DEV } });
		expect(parse(stampFields(before, [], NOW, DEV))).toEqual({
			title: { t: NOW, d: DEV },
		});
	});
});
```

- [ ] **Step 2 : Lancer le test et vérifier qu'il échoue**

Run: `pnpm vitest run src/db/field-timestamps.test.ts`
Expected: FAIL — `Failed to resolve import "./field-timestamps"`.

- [ ] **Step 3 : Implémenter**

Créer `src/db/field-timestamps.ts` :

```ts
/** When a field was last written, and by which device. */
export interface FieldStamp {
	t: string;
	d: string;
}

export type FieldStamps = Record<string, FieldStamp>;

/**
 * Merge new field stamps into the stored map.
 *
 * The device id is carried per field, not per row: it breaks ties when two
 * devices write the same field at the same instant, and a row-level id would
 * name the last pusher rather than the author of that field.
 */
export function stampFields(
	existing: string | null,
	fields: string[],
	now: string,
	deviceId: string,
): string {
	let stamps: FieldStamps = {};
	if (existing) {
		try {
			const parsed: unknown = JSON.parse(existing);
			if (parsed && typeof parsed === "object") stamps = parsed as FieldStamps;
		} catch {
			// Corrupt map: rebuild from this write rather than losing the row.
		}
	}
	for (const field of fields) stamps[field] = { t: now, d: deviceId };
	return JSON.stringify(stamps);
}
```

- [ ] **Step 4 : Lancer le test et vérifier qu'il passe**

Run: `pnpm vitest run src/db/field-timestamps.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5 : Écrire le test d'intégration repository**

Ajouter à `src/db/sqlite-repository.test.ts` :

```ts
describe("SqliteRepository — field timestamps", () => {
	it("createTask stamps every column it writes", async () => {
		const db = makeDb({
			select: vi.fn().mockResolvedValue([]),
		});
		const repo = new SqliteRepository(db);
		await repo.createTask({ title: "T" }).catch(() => undefined);
		const insert = (db.execute as ReturnType<typeof vi.fn>).mock.calls[0];
		expect(insert[0]).toContain("field_updated_at");
		const json = (insert[1] as unknown[]).find(
			(p) => typeof p === "string" && p.startsWith("{"),
		) as string;
		expect(Object.keys(JSON.parse(json))).toContain("title");
	});

	it("updateTask stamps only the patched columns", async () => {
		const db = makeDb({
			select: vi.fn().mockResolvedValue([
				{ field_updated_at: null },
			]),
		});
		const repo = new SqliteRepository(db);
		await repo.updateTask("t1", { priority: "high" }).catch(() => undefined);
		const update = (db.execute as ReturnType<typeof vi.fn>).mock.calls.find(
			(c) => String(c[0]).startsWith("UPDATE tasks SET"),
		);
		const json = (update?.[1] as unknown[]).find(
			(p) => typeof p === "string" && p.startsWith("{"),
		) as string;
		const keys = Object.keys(JSON.parse(json));
		expect(keys).toContain("priority");
		expect(keys).not.toContain("title");
	});
});
```

- [ ] **Step 6 : Lancer le test et vérifier qu'il échoue**

Run: `pnpm vitest run src/db/sqlite-repository.test.ts -t "field timestamps"`
Expected: FAIL — la colonne `field_updated_at` n'apparaît pas dans le SQL généré.

- [ ] **Step 7 : Modifier `createTask` et `updateTask`**

Dans `src/db/sqlite-repository.ts`, ajouter en haut : `import { stampFields } from "./field-timestamps";`

Ajouter un identifiant d'appareil au repository. En attendant que le moteur de sync le persiste (plan 4), une constante locale suffit — elle n'est lue par personne tant que la sync n'existe pas :

```ts
// Placeholder until the sync engine persists a real device id in sync_state.
// Only used to break write-time ties; unread until sync ships.
const LOCAL_DEVICE_ID = "local";
```

`createTask` — remplacer l'INSERT (lignes 464-476) par :

```ts
const stamped = stampFields(
	null,
	["title", "description", "project_id", "priority", "due_date", "tags"],
	now,
	LOCAL_DEVICE_ID,
);
await this.db.execute(
	"INSERT INTO tasks (id, title, description, project_id, priority, due_date, sort_order, created_at, updated_at, field_updated_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?)",
	[
		id,
		input.title,
		input.description ?? null,
		input.projectId ?? null,
		input.priority ?? "none",
		input.dueDate ?? null,
		now,
		now,
		stamped,
	],
);
```

`updateTask` — la méthode construit déjà `sets`/`params` à partir des clés présentes dans le patch. Collecter en parallèle les noms de colonnes touchées, puis les estampiller. Insérer avant `params.push(id)` (ligne 517) :

```ts
const touched: string[] = [];
if ("title" in patch) touched.push("title");
if ("description" in patch) touched.push("description");
if ("projectId" in patch) touched.push("project_id");
if ("priority" in patch) touched.push("priority");
if ("dueDate" in patch) touched.push("due_date");
if ("tagIds" in patch) touched.push("tags");

const prior = await this.db.select<{ field_updated_at: string | null }>(
	"SELECT field_updated_at FROM tasks WHERE id = ?",
	[id],
);
sets.push("field_updated_at = ?");
params.push(
	stampFields(prior[0]?.field_updated_at ?? null, touched, now, LOCAL_DEVICE_ID),
);
```

Les noms poussés dans `touched` sont les **noms de colonnes SQL** (`project_id`, `due_date`), pas les noms TypeScript — le protocole de sync les compare aux colonnes, pas aux propriétés.

- [ ] **Step 8 : Lancer le test et vérifier qu'il passe**

Run: `pnpm vitest run src/db/sqlite-repository.test.ts`
Expected: PASS — y compris les tests existants qui comptent les appels à `execute`. Si l'un d'eux échoue sur un nombre d'appels, c'est le `select` ajouté dans `updateTask` : ajuster l'assertion, pas l'implémentation.

- [ ] **Step 9 : Commit**

```bash
git add src/db/field-timestamps.ts src/db/field-timestamps.test.ts src/db/sqlite-repository.ts src/db/sqlite-repository.test.ts
git commit -m "feat: :sparkles: track per-field write timestamps on tasks"
```

---

## Task 8 : Purge au lieu de suppression physique

`deleteTask` (lignes 577-580) supprime physiquement la ligne. Une ligne effacée ne peut pas propager sa suppression. Elle devient un tombstone : `purged_at` renseigné, contenu vidé, ligne conservée.

**Files:**
- Modify: `src/db/sqlite-repository.ts` (`deleteTask` 577-580, plus tous les `SELECT` sur `tasks`)
- Modify: `src/db/sqlite-repository.test.ts`

**Interfaces:**
- Consumes: colonne `purged_at` (Task 4).
- Produces: comportement inchangé côté UI — les lignes purgées sont invisibles.

- [ ] **Step 1 : Écrire le test qui échoue**

Ajouter à `src/db/sqlite-repository.test.ts` :

```ts
describe("SqliteRepository — purge", () => {
	it("deleteTask writes a tombstone instead of removing the row", async () => {
		const db = makeDb();
		const repo = new SqliteRepository(db);
		await repo.deleteTask("t1");
		const calls = (db.execute as ReturnType<typeof vi.fn>).mock.calls;
		expect(calls.some((c) => String(c[0]).includes("DELETE FROM tasks"))).toBe(false);
		const purge = calls.find((c) => String(c[0]).includes("purged_at"));
		expect(purge).toBeDefined();
		expect(purge?.[1]).toContain("t1");
	});

	it("deleteTask clears content so the tombstone leaks nothing", async () => {
		const db = makeDb();
		const repo = new SqliteRepository(db);
		await repo.deleteTask("t1");
		const purge = (db.execute as ReturnType<typeof vi.fn>).mock.calls.find((c) =>
			String(c[0]).includes("purged_at"),
		);
		expect(String(purge?.[0])).toContain("title = ''");
		expect(String(purge?.[0])).toContain("description = NULL");
	});

	it("getTasks filters out purged rows", async () => {
		const db = makeDb();
		const repo = new SqliteRepository(db);
		await repo.getTasks();
		const select = (db.select as ReturnType<typeof vi.fn>).mock.calls[0];
		expect(String(select[0])).toContain("purged_at IS NULL");
	});
});
```

- [ ] **Step 2 : Lancer le test et vérifier qu'il échoue**

Run: `pnpm vitest run src/db/sqlite-repository.test.ts -t "purge"`
Expected: FAIL — `deleteTask` émet encore `DELETE FROM tasks`.

- [ ] **Step 3 : Réécrire `deleteTask`**

```ts
async deleteTask(id: string): Promise<void> {
	const now = new Date().toISOString();
	// Keep the row as a tombstone so the deletion can propagate; blank the
	// content so a purged task leaks nothing once synced.
	await this.db.execute("DELETE FROM task_tags WHERE task_id = ?", [id]);
	await this.db.execute(
		"UPDATE tasks SET purged_at = ?, updated_at = ?, title = '', description = NULL WHERE id = ?",
		[now, now, id],
	);
}
```

- [ ] **Step 4 : Ajouter `purged_at IS NULL` à toutes les lectures de `tasks`**

Parcourir `src/db/sqlite-repository.ts` et ajouter la condition à chaque requête lisant `tasks` : `getTasks`, `getTask`, `getArchivedTasks`, `_attachTags` (via la jointure), les requêtes de comptage, et `isTagUsedInProjectTasks`.

Repérer les emplacements :

```bash
grep -n "FROM tasks" src/db/sqlite-repository.ts
```

Traiter **chaque** occurrence. Une lecture oubliée fera apparaître des tâches vides dans l'UI — c'est le risque principal de cette tâche.

- [ ] **Step 5 : Lancer la suite complète**

Run: `pnpm test:run`
Expected: PASS. Les tests existants qui comptent les appels à `execute` pour `deleteTask` doivent être mis à jour : l'ancien comportement était deux `DELETE`, le nouveau est un `DELETE` plus un `UPDATE`.

- [ ] **Step 6 : Vérification manuelle**

Run: `pnpm tauri dev`

Vérifier, sur une base existante : les tâches s'affichent normalement, la suppression définitive fait bien disparaître la tâche de la liste **et** de la vue Archives, et un redémarrage de l'app ne la fait pas réapparaître.

- [ ] **Step 7 : Commit**

```bash
git add src/db/sqlite-repository.ts src/db/sqlite-repository.test.ts
git commit -m "feat: :sparkles: turn permanent task deletion into a tombstone"
```

---

## Task 9 : `reorderTasks` écrit `sort_key`

**Files:**
- Modify: `src/db/sqlite-repository.ts` (`reorderTasks` 598-606)
- Modify: `src/db/sqlite-repository.test.ts`

**Interfaces:**
- Consumes: `sort_key` (Task 5), `generateNKeysBetween` de `fractional-indexing`.

- [ ] **Step 1 : Écrire le test qui échoue**

Ajouter à `src/db/sqlite-repository.test.ts` :

```ts
describe("SqliteRepository — reorder", () => {
	it("writes both sort_key and sort_order during the transition release", async () => {
		const db = makeDb();
		const repo = new SqliteRepository(db);
		await repo.reorderTasks(["a", "b", "c"]);
		const calls = (db.execute as ReturnType<typeof vi.fn>).mock.calls;
		expect(calls).toHaveLength(3);
		expect(String(calls[0][0])).toContain("sort_key = ?");
		expect(String(calls[0][0])).toContain("sort_order = ?");
	});

	it("assigns strictly increasing sort_key values", async () => {
		const db = makeDb();
		const repo = new SqliteRepository(db);
		await repo.reorderTasks(["a", "b", "c"]);
		const keys = (db.execute as ReturnType<typeof vi.fn>).mock.calls.map(
			(c) => (c[1] as unknown[])[0] as string,
		);
		expect(keys).toEqual([...keys].sort());
		expect(new Set(keys).size).toBe(3);
	});
});
```

- [ ] **Step 2 : Lancer le test et vérifier qu'il échoue**

Run: `pnpm vitest run src/db/sqlite-repository.test.ts -t "reorder"`
Expected: FAIL — le SQL ne contient pas `sort_key`.

- [ ] **Step 3 : Implémenter**

```ts
async reorderTasks(orderedIds: string[]): Promise<void> {
	const now = new Date().toISOString();
	// sort_order is still written so this release can be rolled back; it is
	// dropped once sync has shipped and sort_key is the sole ordering source.
	const keys = generateNKeysBetween(null, null, orderedIds.length);
	for (let i = 0; i < orderedIds.length; i++) {
		await this.db.execute(
			"UPDATE tasks SET sort_key = ?, sort_order = ?, updated_at = ? WHERE id = ?",
			[keys[i], i, now, orderedIds[i]],
		);
	}
}
```

Ajouter l'import : `import { generateNKeysBetween } from "fractional-indexing";`

Cette implémentation réécrit toutes les lignes, comme avant — le gain en nombre d'écritures viendra du plan 4, quand le drag-and-drop appellera une méthode « déplacer une tâche entre deux voisines ». L'objectif ici est seulement que `sort_key` soit alimentée et cohérente.

- [ ] **Step 4 : Lancer le test et vérifier qu'il passe**

Run: `pnpm vitest run src/db/sqlite-repository.test.ts`
Expected: PASS.

- [ ] **Step 5 : Commit**

```bash
git add src/db/sqlite-repository.ts src/db/sqlite-repository.test.ts
git commit -m "feat: :sparkles: write fractional sort_key on task reorder"
```

---

## Task 10 : Validation de bout en bout et release

**Files:**
- Modify: `src/assets/changelog.json`

- [ ] **Step 1 : Test de migration sur une base réaliste**

Ajouter l'import manquant en tête de `src/db/migrations/migrations.test.ts` :

```ts
import { backfillSortKeys } from "@/db/backfill-sort-keys";
```

Puis ajouter le test :

```ts
it("migrates a populated legacy database without losing data", async () => {
	driver = new BetterSqliteDriver();
	await runMigrations(driver, ALL_MIGRATIONS.slice(0, 6));
	await driver.execute(
		"INSERT INTO projects (id, name, sort_order, created_at, updated_at) VALUES ('p1','Work',0,'x','x')",
	);
	for (let i = 0; i < 50; i++) {
		await driver.execute(
			"INSERT INTO tasks (id, title, project_id, sort_order, created_at, updated_at) VALUES (?, ?, 'p1', ?, 'x', 'x')",
			[`t${i}`, `Task ${i}`, i],
		);
	}
	await runMigrations(driver, ALL_MIGRATIONS);
	await backfillSortKeys(driver);

	const rows = await driver.select<{ n: number }>("SELECT COUNT(*) AS n FROM tasks");
	expect(rows[0]?.n).toBe(50);
	const ordered = await driver.select<{ id: string }>(
		"SELECT id FROM tasks ORDER BY sort_key LIMIT 3",
	);
	expect(ordered.map((r) => r.id)).toEqual(["t0", "t1", "t2"]);
});
```

Run: `pnpm vitest run src/db/migrations/migrations.test.ts`
Expected: PASS.

- [ ] **Step 2 : Vérifier l'absence de régression comportementale**

Run: `pnpm test:run`
Expected: PASS — l'intégralité de la suite.

Run: `pnpm test:e2e` (nécessite `pnpm dev` dans un autre terminal)
Expected: PASS.

Run: `pnpm build`
Expected: succès.

- [ ] **Step 3 : Vérification manuelle sur une vraie base**

Sauvegarder d'abord la base réelle :

```bash
cp ~/.local/share/usagi/usagi.db ~/.local/share/usagi/usagi.db.bak
```

Run: `pnpm tauri dev`

Vérifier : l'app démarre sans erreur de migration ; les tâches, projets, groupes et tags s'affichent tous ; l'ordre des tâches est **identique** à celui d'avant migration ; créer, éditer, archiver, désarchiver et supprimer une tâche fonctionne ; le glisser-déposer conserve l'ordre après redémarrage.

Vérifier ensuite que l'outbox se remplit :

```bash
sqlite3 ~/.local/share/usagi/usagi.db "SELECT COUNT(*) FROM sync_outbox;"
```

Attendu : un nombre non nul après les manipulations ci-dessus.

- [ ] **Step 4 : Mettre à jour le changelog**

Ce lot est presque entièrement interne, mais un changement **est** visible : la suppression définitive conserve désormais une ligne masquée, donc la base ne rétrécit plus. Ajouter dans `src/assets/changelog.json`, section `"version": "Unreleased"` :

```json
{
	"category": "features",
	"en": "Groundwork for multi-device sync: the local database is now sync-ready. No change to how the app works.",
	"fr": "Fondations pour la synchronisation multi-appareils : la base locale est désormais prête à être synchronisée. Aucun changement dans le fonctionnement de l'app."
}
```

- [ ] **Step 5 : Lancer react-doctor et le lint (obligatoire, CLAUDE.md)**

```bash
nvm use 22.22.2
rm -rf ~/.npm/_npx
pnpm run doctor
pnpm run lint:fix
```

Ne corriger que les diagnostics introduits par ce plan.

- [ ] **Step 6 : Commit final**

```bash
git add src/assets/changelog.json
git commit -m "chore: :bookmark: prepare sync groundwork release"
```

- [ ] **Step 7 : Publier sur le canal bêta avant le canal stable**

Le projet dispose d'un canal bêta (`docs/superpowers/specs/2026-06-17-beta-release-channel-design.md`). Cette release touche le schéma de **tous** les utilisateurs : la passer d'abord en bêta, la laisser vivre quelques jours, puis promouvoir en stable.

---

## Notes pour les plans suivants

- **Écho de sync :** les triggers de la Task 6 se déclenchent aussi quand le moteur applique une modification distante. Le plan 4 doit purger les entrées d'outbox qu'il a lui-même provoquées, dans la même transaction — sauf lorsque la fusion a produit un état que le serveur ne possède pas encore.
- **`LOCAL_DEVICE_ID`** (Task 7) est un placeholder. Le plan 4 le remplace par l'identifiant persisté dans `sync_state`.
- **`sort_order`** est conservée par ce plan. Sa suppression est une migration à part, à faire une fois la sync livrée et stabilisée.
- **Reconstruction de table :** toute future migration qui reconstruit une table synchronisée (comme le fait 006) doit recréer ses triggers, sous peine de désactiver silencieusement la sync pour cette table.
- **CSP :** `tauri.conf.json:21` limite `connect-src` à `'self' https://github.com`. Le plan 5 devra l'élargir à l'URL de serveur choisie par l'utilisateur.
