import { describe, expect, it } from "vitest";
import { splitStatements } from "./split-statements";

describe("splitStatements", () => {
	it("splits plain statements on semicolons", () => {
		expect(
			splitStatements("CREATE TABLE a (id TEXT); CREATE TABLE b (id TEXT);"),
		).toEqual(["CREATE TABLE a (id TEXT)", "CREATE TABLE b (id TEXT)"]);
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

	it("keeps a trigger body intact when it contains a CASE expression", () => {
		const sql = `
CREATE TRIGGER trg AFTER UPDATE ON tasks
BEGIN
  UPDATE tasks SET state = CASE WHEN NEW.done = 1 THEN 'done' ELSE 'open' END;
  UPDATE meta SET n = n + 1;
END;
CREATE INDEX idx ON tasks(id);`;
		const out = splitStatements(sql);
		expect(out).toHaveLength(2);
		expect(out[0]).toContain("CREATE TRIGGER trg");
		expect(out[0]).toContain("CASE WHEN NEW.done = 1");
		expect(out[0].endsWith("END")).toBe(true);
		expect(out[1]).toBe("CREATE INDEX idx ON tasks(id)");
	});

	it("splits two sequential trigger blocks into exactly two statements", () => {
		const sql = `
CREATE TRIGGER trg_a AFTER INSERT ON tasks
BEGIN
  INSERT INTO sync_outbox (entity_id) VALUES (NEW.id);
END;
CREATE TRIGGER trg_b AFTER DELETE ON tasks
BEGIN
  DELETE FROM sync_outbox WHERE entity_id = OLD.id;
END;`;
		const out = splitStatements(sql);
		expect(out).toHaveLength(2);
		expect(out[0]).toContain("CREATE TRIGGER trg_a");
		expect(out[0]).not.toContain("trg_b");
		expect(out[1]).toContain("CREATE TRIGGER trg_b");
		expect(out[1].endsWith("END")).toBe(true);
	});

	// "CASE" counts as a block opener, so it must not be recognised inside a
	// longer identifier such as use_case — that would unbalance the depth.
	it("does not treat keywords embedded in identifiers as block markers", () => {
		expect(
			splitStatements("CREATE TABLE t (use_case TEXT); SELECT 1;"),
		).toEqual(["CREATE TABLE t (use_case TEXT)", "SELECT 1"]);
	});

	// Regression: 006_extend_priority.sql opens with "-- SQLite can't alter a
	// CHECK in place", whose apostrophe was read as a string delimiter.
	it("ignores quotes and semicolons inside line comments", () => {
		const sql = `
-- SQLite can't alter a CHECK in place; rebuild instead.
PRAGMA foreign_keys = OFF;
SELECT 1;`;
		const out = splitStatements(sql);
		expect(out).toHaveLength(2);
		expect(out[0]).toContain("PRAGMA foreign_keys = OFF");
		expect(out[1]).toBe("SELECT 1");
	});

	it("ignores quotes and semicolons inside block comments", () => {
		const sql = "/* it's fine; really */ SELECT 1; SELECT 2;";
		expect(splitStatements(sql)).toEqual([
			"/* it's fine; really */ SELECT 1",
			"SELECT 2",
		]);
	});

	it("throws on an unterminated BEGIN block", () => {
		const sql = `
CREATE TRIGGER trg AFTER INSERT ON tasks
BEGIN
  UPDATE meta SET n = n + 1;
CREATE INDEX idx ON tasks(id);`;
		expect(() => splitStatements(sql)).toThrow(/unterminated BEGIN/i);
	});

	it("throws on an unterminated string literal", () => {
		expect(() => splitStatements("INSERT INTO t VALUES ('oops);")).toThrow(
			/unterminated string literal/i,
		);
	});
});
