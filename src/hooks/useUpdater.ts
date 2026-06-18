import { getVersion } from "@tauri-apps/api/app";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { createContext, useCallback, useContext, useState } from "react";

const BETA_ENDPOINT =
	"https://github.com/LoanCB/usagi-client/releases/download/latest-beta/latest-beta.json";

function isNewer(candidate: string, current: string): boolean {
	const parse = (v: string) => {
		const [base, pre] = v.split(/-(?=[a-zA-Z])/);
		const nums = base.split(".").map(Number);
		// pre-release number: "beta3" → 3, no pre-release → Infinity (stable > any beta)
		const preNum = pre ? Number(pre.replace(/\D/g, "") || "0") : Infinity;
		return { nums, preNum };
	};
	const a = parse(candidate);
	const b = parse(current);
	for (let i = 0; i < Math.max(a.nums.length, b.nums.length); i++) {
		const diff = (a.nums[i] ?? 0) - (b.nums[i] ?? 0);
		if (diff !== 0) return diff > 0;
	}
	// Same base version: compare pre-release numbers (Infinity = stable wins)
	return a.preNum > b.preNum;
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
				const gitTag = (
					import.meta.env.VITE_APP_GIT_TAG as string | undefined
				)?.replace(/^v/, "");
				const [manifest, currentVersion] = await Promise.all([
					fetch(BETA_ENDPOINT).then((r) => {
						if (r.status === 404) return null;
						if (!r.ok) throw new Error(`HTTP ${r.status}`);
						return r.json() as Promise<{ version: string }>;
					}),
					gitTag ? Promise.resolve(gitTag) : getVersion(),
				]);
				if (!manifest) {
					setStatus("idle");
					return;
				}
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
