// Sets up window.__TAURI_INTERNALS__ so the Tauri JS SDK doesn't throw
// when its modules are imported. Must be imported before any Tauri SDK usage.
window.__TAURI_INTERNALS__ = {
	ipc: {
		postMessage: () => {},
	},
	metadata: {
		currentWindow: { label: "main" },
		windows: [],
		menus: {},
	},
	convertFileSrc: (path: string) => path,
	transformCallback: (_callback: (response: unknown) => void, _once: boolean) =>
		Math.random(),
	invoke: () => Promise.resolve(null),
};
