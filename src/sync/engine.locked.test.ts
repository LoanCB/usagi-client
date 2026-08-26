// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { ALL_MIGRATIONS } from "@/db/migrations";
import { runMigrations } from "@/db/migrations/run-migrations";
import { BetterSqliteDriver } from "@/test-harness/BetterSqliteDriver";
import {
	FAKE_SERVER_INFO,
	makeDevice,
	syncMerging,
} from "@/test-harness/engine";
import { FakeRecordCipher } from "@/test-harness/FakeRecordCipher";
import { FakeSyncServer } from "@/test-harness/FakeSyncServer";
import { SyncEngine } from "./engine";
import { ReauthRequiredError } from "./types";

describe("engine — verrouillage du coffre", () => {
	let server: FakeSyncServer;

	beforeEach(() => {
		server = new FakeSyncServer();
	});

	it("ne pull rien, ne quarantaine rien et n'avance pas le curseur quand le coffre est fermé", async () => {
		// Un appareil source pousse un enregistrement réel sur le serveur.
		const source = await makeDevice(server);
		await source.repo.createProject({ name: "Projet distant" });
		await syncMerging(source);

		// L'appareil cible démarre coffre fermé, comme après un redémarrage.
		let unlocked = false;
		const target = await makeDevice(server, {
			isUnlocked: async () => unlocked,
		});

		await target.engine.syncNow();

		expect(target.engine.getStatus()).toBe("locked");
		expect(await target.repo.getProjects()).toHaveLength(0);
		const quarantined = await target.driver.select<{ n: number }>(
			"SELECT COUNT(*) AS n FROM sync_quarantine",
		);
		expect(quarantined[0].n).toBe(0);
		const cursor = await target.driver.select<{ value: string }>(
			"SELECT value FROM sync_state WHERE key = 'cursor'",
		);
		expect(cursor).toHaveLength(0);

		// Déverrouillage : le cycle suivant rattrape tout, sans intervention.
		unlocked = true;
		await syncMerging(target);
		expect(target.engine.getStatus()).toBe("idle");
		expect(await target.repo.getProjects()).toHaveLength(1);
	});

	it("ne pousse rien et ne lève pas quand le coffre est fermé", async () => {
		let unlocked = false;
		const device = await makeDevice(server, {
			isUnlocked: async () => unlocked,
		});
		await device.repo.createProject({ name: "Écrit hors ligne" });

		// Le mode d'échec avant correction : cipher.encrypt lève Locked dans
		// pushPhase, l'erreur remonte et syncNow la relance.
		await expect(device.engine.syncNow()).resolves.toBeUndefined();
		expect(device.engine.getStatus()).toBe("locked");
		expect(server.dump()).toHaveLength(0);

		// L'outbox est intacte : rien n'a été consommé ni perdu.
		const outbox = await device.driver.select<{ n: number }>(
			"SELECT COUNT(*) AS n FROM sync_outbox",
		);
		expect(outbox[0].n).toBeGreaterThan(0);

		unlocked = true;
		await syncMerging(device);
		expect(server.dump()).toHaveLength(1);
	});
	it("ne remplace pas « reconnexion requise » par « verrouillé »", async () => {
		// Séquence réelle d'une révocation (§7) : le serveur refuse le jeton, le
		// moteur passe en reauth-required, init.ts verrouille alors le coffre — et
		// le tick suivant du scheduler trouve un coffre fermé.
		const driver = new BetterSqliteDriver();
		await runMigrations(driver, ALL_MIGRATIONS);
		let unlocked = true;
		const engine = new SyncEngine({
			db: driver,
			transport: {
				pull: () => Promise.reject(new ReauthRequiredError("revoked")),
				push: () => Promise.reject(new ReauthRequiredError("revoked")),
			},
			cipher: new FakeRecordCipher(),
			getServerInfo: async () => FAKE_SERVER_INFO,
			isUnlocked: async () => unlocked,
		});
		// Ce que fait init.ts sur ce statut.
		engine.onStatus((s) => {
			if (s === "reauth-required") unlocked = false;
		});

		await engine.syncNow();
		expect(engine.getStatus()).toBe("reauth-required");

		// Le tick suivant ne doit pas dégrader l'état : dire « déverrouillez pour
		// reprendre » enverrait l'utilisateur saisir un mot de passe qui ne peut
		// rien ranimer, et masquerait le seul bouton qui le sortirait de là.
		await engine.syncNow();
		expect(engine.getStatus()).toBe("reauth-required");
		driver.close();
	});
});
