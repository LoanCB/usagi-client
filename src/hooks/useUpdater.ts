import { getVersion } from "@tauri-apps/api/app";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { createContext, useCallback, useContext, useState } from "react";

const BETA_ENDPOINT =
	"https://github.com/LoanCB/usagi-client/releases/latest/download/latest-beta.json";

function isNewer(candidate: string, current: string): boolean {
	const normalize = (v: string) => v.replace(/-.*$/, "").split(".").map(Number);
	const a = normalize(candidate);
	const b = normalize(current);
	for (let i = 0; i < Math.max(a.length, b.length); i++) {
		const diff = (a[i] ?? 0) - (b[i] ?? 0);
		if (diff !== 0) return diff > 0;
	}
	return false;
}

export type UpdateStatus =
	| "idle"
	| "checking"
	| "available"
	| "downloading"
	| "ready"
	| "error";

export interface UpdaterState {
	status: UpdateStatus;
	update: Update | null;
	betaVersion: string | null;
	progress: number;
	error: string | null;
	checkForUpdate: (channel?: "stable" | "beta") => Promise<void>;
	downloadAndInstall: () => Promise<void>;
	dismiss: () => void;
	relaunchApp: () => Promise<void>;
}

export function useUpdater(): UpdaterState {
	const [status, setStatus] = useState<UpdateStatus>("idle");
	const [update, setUpdate] = useState<Update | null>(null);
	const [betaVersion, setBetaVersion] = useState<string | null>(null);
	const [progress, setProgress] = useState(0);
	const [error, setError] = useState<string | null>(null);

	const checkForUpdate = useCallback(async (channel?: "stable" | "beta") => {
		if (import.meta.env.MODE !== "production") return;
		setStatus("checking");
		setError(null);
		setUpdate(null);
		setBetaVersion(null);
		try {
			if (channel === "beta") {
				const [manifest, currentVersion] = await Promise.all([
					fetch(BETA_ENDPOINT).then((r) => {
						if (!r.ok) throw new Error(`HTTP ${r.status}`);
						return r.json() as Promise<{ version: string }>;
					}),
					getVersion(),
				]);
				if (isNewer(manifest.version, currentVersion)) {
					setBetaVersion(manifest.version);
					setStatus("available");
				} else {
					setStatus("idle");
				}
			} else {
				const available = await check();
				if (available) {
					setUpdate(available);
					setStatus("available");
				} else {
					setStatus("idle");
				}
			}
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			console.error("[updater] checkForUpdate failed:", message);
			setError(message);
			setStatus("error");
		}
	}, []);

	const downloadAndInstall = useCallback(async () => {
		if (!update) {
			setError("No update available");
			setStatus("error");
			return;
		}
		setStatus("downloading");
		setProgress(0);
		setError(null);
		try {
			let received = 0;
			let total = 0;
			await update.downloadAndInstall((event) => {
				if (event.event === "Started") {
					total = event.data.contentLength ?? 0;
				} else if (event.event === "Progress") {
					received += event.data.chunkLength;
					if (total > 0) setProgress(Math.round((received / total) * 100));
				} else if (event.event === "Finished") {
					setProgress(100);
					setStatus("ready");
				}
			});
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			console.error("[updater] downloadAndInstall failed:", message);
			setError(message);
			setStatus("error");
		}
	}, [update]);

	const dismiss = useCallback(() => {
		setStatus("idle");
		setUpdate(null);
		setBetaVersion(null);
		setProgress(0);
		setError(null);
	}, []);

	const relaunchApp = useCallback(async () => {
		await relaunch();
	}, []);

	return {
		status,
		update,
		betaVersion,
		progress,
		error,
		checkForUpdate,
		downloadAndInstall,
		dismiss,
		relaunchApp,
	};
}

export const UpdaterContext = createContext<UpdaterState | null>(null);

export function useUpdaterContext(): UpdaterState {
	const ctx = useContext(UpdaterContext);
	if (!ctx)
		throw new Error(
			"useUpdaterContext must be used inside UpdaterContext.Provider",
		);
	return ctx;
}
