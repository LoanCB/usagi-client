import { describe, expect, it, vi } from "vitest";
import { automaticBackupName, readBackupText } from "./backup-file";

describe("backup files", () => {
	it("names automatic backups with the sealed extension", () => {
		expect(automaticBackupName(new Date("2026-09-28T10:11:12.345Z"))).toBe(
			"bunly-before-replace-2026-09-28T10-11-12.bunlybak",
		);
	});

	it("opens a sealed backup through the vault", async () => {
		const open = vi.fn(async () => '{"version":1}');
		await expect(readBackupText("/x/a.bunlybak", "blob", open)).resolves.toBe(
			'{"version":1}',
		);
		expect(open).toHaveBeenCalledWith("blob");
	});

	it("passes a plain JSON export through untouched", async () => {
		const open = vi.fn();
		await expect(readBackupText("/x/a.json", "{}", open)).resolves.toBe("{}");
		expect(open).not.toHaveBeenCalled();
	});
});
