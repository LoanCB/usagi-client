import { describe, expect, it } from "vitest";
import { normalizeServerUrl } from "./server-url";

describe("normalizeServerUrl", () => {
	it("accepte https et retire le slash final", () => {
		expect(normalizeServerUrl("https://sync.example.com/")).toEqual({
			url: "https://sync.example.com",
			error: null,
			insecureWarning: false,
		});
	});

	it("ajoute https:// quand le schéma est absent", () => {
		expect(normalizeServerUrl("sync.example.com")).toEqual({
			url: "https://sync.example.com",
			error: null,
			insecureWarning: false,
		});
	});

	it("conserve un port et un chemin de base", () => {
		expect(normalizeServerUrl("https://sync.example.com:8443/usagi")).toEqual({
			url: "https://sync.example.com:8443/usagi",
			error: null,
			insecureWarning: false,
		});
	});

	it("refuse http sur un hôte public", () => {
		expect(normalizeServerUrl("http://sync.example.com")).toEqual({
			url: null,
			error: "insecure",
			insecureWarning: false,
		});
	});

	it.each([
		"http://localhost:3000",
		"http://127.0.0.1:3000",
		"http://nas.local",
		"http://NAS.LOCAL",
	])("tolère http sur un hôte local (%s) en avertissant", (raw) => {
		const result = normalizeServerUrl(raw);
		expect(result.error).toBeNull();
		expect(result.url).not.toBeNull();
		expect(result.insecureWarning).toBe(true);
	});

	it("n'avertit pas quand un hôte local est joint en https", () => {
		expect(normalizeServerUrl("https://localhost:3000")).toEqual({
			url: "https://localhost:3000",
			error: null,
			insecureWarning: false,
		});
	});

	it("ne prend pas un sous-domaine trompeur pour un hôte local", () => {
		// "localhost.attacker.com" n'est PAS localhost.
		expect(normalizeServerUrl("http://localhost.attacker.com").error).toBe(
			"insecure",
		);
		// ".local" doit être un suffixe de label, pas une sous-chaîne.
		expect(normalizeServerUrl("http://not-local.example.com").error).toBe(
			"insecure",
		);
	});

	it.each(["", "   "])("signale une saisie vide (%p)", (raw) => {
		expect(normalizeServerUrl(raw)).toEqual({
			url: null,
			error: "empty",
			insecureWarning: false,
		});
	});

	it.each([
		"ftp://sync.example.com",
		"https://",
		"h ttp://x",
		"://",
	])("signale une URL malformée (%s)", (raw) => {
		const result = normalizeServerUrl(raw);
		expect(result.url).toBeNull();
		expect(result.error).toBe("malformed");
	});
});
