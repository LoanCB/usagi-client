import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { createContext, useCallback, useContext, useState } from "react";

export type UpdateStatus =
	| "idle"
	| "available"
	| "downloading"
	| "ready"
	| "error";

export interface UpdaterState {
	status: UpdateStatus;
	update: Update | null;
	progress: number;
	checkForUpdate: () => Promise<void>;
	downloadAndInstall: () => Promise<void>;
	dismiss: () => void;
	relaunchApp: () => Promise<void>;
}

export function useUpdater(): UpdaterState {
	const [status, setStatus] = useState<UpdateStatus>("idle");
	const [update, setUpdate] = useState<Update | null>(null);
	const [progress, setProgress] = useState(0);

	const checkForUpdate = useCallback(async () => {
		if (import.meta.env.MODE !== "production") return;
		try {
			const available = await check();
			if (available) {
				setUpdate(available);
				setStatus("available");
			}
		} catch {
			setStatus("error");
		}
	}, []);

	const downloadAndInstall = useCallback(async () => {
		if (!update) {
			setStatus("error");
			return;
		}
		setStatus("downloading");
		setProgress(0);
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
		} catch {
			setStatus("error");
		}
	}, [update]);

	const dismiss = useCallback(() => {
		setStatus("idle");
		setUpdate(null);
		setProgress(0);
	}, []);

	const relaunchApp = useCallback(async () => {
		await relaunch();
	}, []);

	return {
		status,
		update,
		progress,
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
