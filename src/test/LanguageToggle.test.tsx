import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@/i18n";
import { LanguageToggle } from "@/components/layout/LanguageToggle";
import i18n from "@/i18n";

beforeEach(async () => {
	await i18n.changeLanguage("fr");
});

describe("LanguageToggle (expanded)", () => {
	it("renders both language buttons", () => {
		render(<LanguageToggle collapsed={false} />);
		expect(
			screen.getByRole("button", { name: "Français" }),
		).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "English" })).toBeInTheDocument();
	});

	it("highlights the active language", () => {
		render(<LanguageToggle collapsed={false} />);
		expect(screen.getByRole("button", { name: "Français" })).toHaveClass(
			"bg-accent",
		);
		expect(screen.getByRole("button", { name: "English" })).not.toHaveClass(
			"bg-accent",
		);
	});

	it("changes language when EN is clicked", async () => {
		const user = userEvent.setup();
		render(<LanguageToggle collapsed={false} />);
		await user.click(screen.getByRole("button", { name: "English" }));
		expect(i18n.language.startsWith("en")).toBe(true);
	});
});

describe("LanguageToggle (collapsed)", () => {
	it("shows only the current language code, no buttons", () => {
		render(<LanguageToggle collapsed={true} />);
		expect(screen.getByText("fr")).toBeInTheDocument();
		expect(screen.queryByRole("button")).not.toBeInTheDocument();
	});
});
