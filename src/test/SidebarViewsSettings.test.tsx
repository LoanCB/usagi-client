import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@/i18n";
import { vi } from "vitest";
import { SettingsDialog } from "@/components/layout/SettingsDialog";
import { useSettingsStore } from "@/store/settings";

vi.mock("@/store/repository", () => ({
	getRepository: vi.fn(() => ({
		setSetting: vi.fn().mockResolvedValue(undefined),
		getSettings: vi.fn().mockResolvedValue({}),
	})),
}));

vi.mock("@/hooks/useUpdater", () => ({
	useUpdaterContext: () => ({
		status: "idle",
		checkForUpdate: vi.fn(),
	}),
	UpdaterContext: {
		Provider: ({ children }: { children: React.ReactNode }) => children,
	},
}));

vi.mock("@tauri-apps/api/app", () => ({
	getVersion: vi.fn().mockResolvedValue("1.0.0"),
}));

function renderDialog() {
	return render(
		<SettingsDialog>
			<button type="button">Open</button>
		</SettingsDialog>,
	);
}

async function openDialog() {
	const user = userEvent.setup();
	renderDialog();
	await user.click(screen.getByRole("button", { name: /open/i }));
	// The sidebar views switches live under the Customization tab, not the
	// default General tab.
	await user.click(
		screen.getByRole("tab", { name: /customization|customisation/i }),
	);
	return user;
}

// The Customization tab renders a second "Tags" switch (quick-add tags), so
// scope switch queries to the Sidebar views section via its heading.
function sidebarViewsSection() {
	const heading = screen.getByText(/^sidebar views$|^vues de la sidebar$/i);
	// biome-ignore lint/style/noNonNullAssertion: the heading always has a parent section
	return within(heading.parentElement!);
}

beforeEach(() => {
	useSettingsStore.setState({
		calendarVisible: true,
		archivesVisible: true,
		tagsVisible: true,
		setCalendarVisible: vi.fn(),
		setArchivesVisible: vi.fn(),
		setTagsVisible: vi.fn(),
		notificationsEnabled: false,
		notificationTimes: [],
		parallaxEnabled: false,
		glassmorphismEnabled: false,
		setNotificationsEnabled: vi.fn(),
		setNotificationTimes: vi.fn(),
		setParallaxEnabled: vi.fn(),
		setGlassmorphismEnabled: vi.fn(),
	});
});

describe("SettingsDialog — sidebar views section", () => {
	it("renders the section heading", async () => {
		await openDialog();
		expect(
			screen.getByText(/sidebar views|vues de la sidebar/i),
		).toBeInTheDocument();
	});

	it("renders three checked switches by default", async () => {
		await openDialog();
		const section = sidebarViewsSection();
		const calendarSw = section.getByRole("switch", {
			name: /calendar|calendrier/i,
		});
		const archivesSw = section.getByRole("switch", { name: /^archives$/i });
		const tagsSw = section.getByRole("switch", { name: /^tags$/i });
		expect(calendarSw).toBeChecked();
		expect(archivesSw).toBeChecked();
		expect(tagsSw).toBeChecked();
	});

	it("calls setCalendarVisible(repo, false) when Calendar switch is toggled", async () => {
		const setCalendarVisible = vi.fn();
		useSettingsStore.setState({ calendarVisible: true, setCalendarVisible });
		const user = await openDialog();
		await user.click(
			screen.getByRole("switch", { name: /calendar|calendrier/i }),
		);
		expect(setCalendarVisible).toHaveBeenCalledWith(expect.anything(), false);
	});

	it("calls setArchivesVisible(repo, false) when Archives switch is toggled", async () => {
		const setArchivesVisible = vi.fn();
		useSettingsStore.setState({ archivesVisible: true, setArchivesVisible });
		const user = await openDialog();
		await user.click(screen.getByRole("switch", { name: /^archives$/i }));
		expect(setArchivesVisible).toHaveBeenCalledWith(expect.anything(), false);
	});

	it("calls setTagsVisible(repo, false) when Tags switch is toggled", async () => {
		const setTagsVisible = vi.fn();
		useSettingsStore.setState({ tagsVisible: true, setTagsVisible });
		const user = await openDialog();
		await user.click(
			sidebarViewsSection().getByRole("switch", { name: /^tags$/i }),
		);
		expect(setTagsVisible).toHaveBeenCalledWith(expect.anything(), false);
	});
});
