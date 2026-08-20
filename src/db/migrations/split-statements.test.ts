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
