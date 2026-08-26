/** The tabs SettingsDialog renders, in display order. Shared with the UI store
 * so a caller (the sync status banner) can ask for a specific one. */
export const SETTINGS_TABS = [
	"general",
	"customization",
	"notifications",
	"sync",
	"data",
	"changelog",
] as const;

export type SettingsTab = (typeof SETTINGS_TABS)[number];
