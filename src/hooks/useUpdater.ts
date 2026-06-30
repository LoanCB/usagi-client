import { Channel, invoke } from "@tauri-apps/api/core";
import { relaunch } from "@tauri-apps/plugin-process";
import { createContext, use, useCallback, useState } from "react";

const STABLE_ENDPOINT =
	"https://github.com/LoanCB/usagi-client/releases/latest/download/latest.json";
const BETA_ENDPOINT =
	"https://github.com/LoanCB/usagi-client/releases/download/latest-beta/latest-beta.json";

interface UpdateInfo {
	version: string;
	current_version: string;
	notes: string | null;
}

type DownloadEvent =
	| { event: "Started"; data: { contentLength: number | null } }
	| { event: "Progress"; data: { chunkLength: number } }
	| { event: "Finished" };

export interface AvailableUpdate {
	version: string;
	isBeta: boolean;
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
	available: AvailableUpdate | null;
	progress: number;
	error: string | null;
	checkForUpdate: (betaEnabled: boolean) => Promise<void>;
	downloadAndInstall: () => Promise<void>;
	dismiss: () => void;
	relaunchApp: () => Promise<void>;
}

export function useUpdater(): UpdaterState {
	const [status, setStatus] = useState<UpdateStatus>("idle");
	const [available, setAvailable] = useState<AvailableUpdate | null>(null);
	const [progress, setProgress] = useState(0);
	const [error, setError] = useState<string | null>(null);

	const checkForUpdate = useCallback(async (betaEnabled: boolean) => {
		if (import.meta.env.MODE !== "production") return;
		setStatus("checking");
		setError(null);
		setAvailable(null);
		try {
			// "Beta + stable, beta prioritized": when beta is on, query both
			// channels in parallel. The stable and beta manifests use
			// intentionally non-comparable version formats (stable is mangled for
			// WiX, e.g. "26.2.0"; beta is full CalVer, e.g. "2026.1.1-beta9"), so
			// we do NOT compare versions across channels — Rust already decided
			// each is newer than the installed version. Beta simply wins when both
			// have an update.
			//
			// The channels are independent: a manifest that 404s or fails to parse
			// on one channel must NOT sink the other. (This happens during the
			// rollout of per-format manifests — a stable release predating the fix
			// has no latest-deb.json, so a .deb install's stable check 404s while
			// its beta check succeeds.) We fire both concurrently, settle them
			// independently, and surface an error only if *every* channel we
			// queried failed. Only channels we use are queried, so each settled
			// result maps to a real network call.
			const betaPromise = betaEnabled
				? invoke<UpdateInfo | null>("check_update", {
						endpoints: [BETA_ENDPOINT],
					})
				: null;
			const stablePromise = invoke<UpdateInfo | null>("check_update", {
				endpoints: [STABLE_ENDPOINT],
			});

			const [betaResult, stableResult] = await Promise.allSettled([
				betaPromise ?? Promise.resolve(null),
				stablePromise,
			]);

			const queried = betaPromise ? [betaResult, stableResult] : [stableResult];
			const beta = betaResult?.status === "fulfilled" ? betaResult.value : null;
			const stable =
				stableResult.status === "fulfilled" ? stableResult.value : null;

			if (beta) {
				setAvailable({ version: beta.version, isBeta: true });
				setStatus("available");
			} else if (stable) {
				setAvailable({ version: stable.version, isBeta: false });
				setStatus("available");
			} else if (queried.every((r) => r.status === "rejected")) {
				// Every channel we queried failed — report the first failure.
				const firstRejection = queried.find(
					(r): r is PromiseRejectedResult => r.status === "rejected",
				);
				const reason = firstRejection?.reason;
				const message =
					reason instanceof Error ? reason.message : String(reason);
				console.error("[updater] checkForUpdate failed:", message);
				setError(message);
				setStatus("error");
			} else {
				// At least one channel responded successfully with "no update".
				setStatus("idle");
			}
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			console.error("[updater] checkForUpdate failed:", message);
			setError(message);
			setStatus("error");
		}
	}, []);

	const downloadAndInstall = useCallback(async () => {
		if (!available) {
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
			const onEvent = new Channel<DownloadEvent>();
			onEvent.onmessage = (message) => {
				if (message.event === "Started") {
					total = message.data.contentLength ?? 0;
				} else if (message.event === "Progress") {
					received += message.data.chunkLength;
					if (total > 0) setProgress(Math.round((received / total) * 100));
				} else if (message.event === "Finished") {
					setProgress(100);
					setStatus("ready");
				}
			};
			await invoke("install_update", {
				endpoints: [available.isBeta ? BETA_ENDPOINT : STABLE_ENDPOINT],
				onEvent,
			});
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			console.error("[updater] downloadAndInstall failed:", message);
			setError(message);
			setStatus("error");
		}
	}, [available]);

	const dismiss = useCallback(() => {
		setStatus("idle");
		setAvailable(null);
		setProgress(0);
		setError(null);
	}, []);

	const relaunchApp = useCallback(async () => {
		await relaunch();
	}, []);

	return {
		status,
		available,
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
	const ctx = use(UpdaterContext);
	if (!ctx)
		throw new Error(
			"useUpdaterContext must be used inside UpdaterContext.Provider",
		);
	return ctx;
}
