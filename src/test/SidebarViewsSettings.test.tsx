import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@/i18n";
import { SettingsDialog } from "@/components/layout/SettingsDialog";
import { useSettingsStore } from "@/store/settings";
import { getRepository } from "@/store/repository";
import { vi } from "vitest";

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

  it("renders three checked checkboxes by default", async () => {
    await openDialog();
    const calendarCb = screen.getByRole("checkbox", { name: /calendar|calendrier/i });
    const archivesCb = screen.getByRole("checkbox", { name: /^archives$/i });
    const tagsCb = screen.getByRole("checkbox", { name: /^tags$/i });
    expect(calendarCb).toBeChecked();
    expect(archivesCb).toBeChecked();
    expect(tagsCb).toBeChecked();
  });

  it("calls setCalendarVisible(repo, false) when Calendar checkbox is unchecked", async () => {
    const setCalendarVisible = vi.fn();
    useSettingsStore.setState({ calendarVisible: true, setCalendarVisible });
    const user = await openDialog();
    const calendarLabel = screen.getByText(/^(Calendar|Calendrier)$/i);
    await user.click(calendarLabel);
    expect(setCalendarVisible).toHaveBeenCalledWith(expect.anything(), false);
  });

  it("calls setArchivesVisible(repo, false) when Archives checkbox is unchecked", async () => {
    const setArchivesVisible = vi.fn();
    useSettingsStore.setState({ archivesVisible: true, setArchivesVisible });
    const user = await openDialog();
    const archivesLabel = screen.getByText(/^Archives$/i);
    await user.click(archivesLabel);
    expect(setArchivesVisible).toHaveBeenCalledWith(expect.anything(), false);
  });

  it("calls setTagsVisible(repo, false) when Tags checkbox is unchecked", async () => {
    const setTagsVisible = vi.fn();
    useSettingsStore.setState({ tagsVisible: true, setTagsVisible });
    const user = await openDialog();
    const tagsLabel = screen.getByText(/^Tags$/i);
    await user.click(tagsLabel);
    expect(setTagsVisible).toHaveBeenCalledWith(expect.anything(), false);
  });
});
