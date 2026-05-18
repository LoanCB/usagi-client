import { render, screen } from "@testing-library/react";
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
	return user;
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
		const calendarSw = screen.getByRole("switch", {
			name: /calendar|calendrier/i,
		});
		const archivesSw = screen.getByRole("switch", { name: /^archives$/i });
		const tagsSw = screen.getByRole("switch", { name: /^tags$/i });
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
		await user.click(screen.getByRole("switch", { name: /^tags$/i }));
		expect(setTagsVisible).toHaveBeenCalledWith(expect.anything(), false);
	});
});
