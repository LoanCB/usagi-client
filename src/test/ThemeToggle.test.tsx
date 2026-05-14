import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@/i18n";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { ThemeProvider } from "@/theme/ThemeProvider";

function renderWithTheme(
	ui: React.ReactElement,
	defaultMode: "light" | "dark" | "system" = "light",
) {
	localStorage.setItem("theme-mode", defaultMode);
	return render(<ThemeProvider defaultMode={defaultMode}>{ui}</ThemeProvider>);
}

beforeEach(() => {
	localStorage.clear();
});

describe("ThemeToggle (expanded)", () => {
	it("renders three mode buttons", () => {
		renderWithTheme(<ThemeToggle collapsed={false} />);
		expect(screen.getByRole("button", { name: /light/i })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: /system/i })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: /dark/i })).toBeInTheDocument();
	});

	it("highlights the active mode", () => {
		renderWithTheme(<ThemeToggle collapsed={false} />, "dark");
		expect(screen.getByRole("button", { name: /dark/i })).toHaveClass(
			"bg-primary",
		);
		expect(screen.getByRole("button", { name: /light/i })).not.toHaveClass(
			"bg-primary",
		);
	});

	it("calls setMode when a button is clicked", async () => {
		const user = userEvent.setup();
		renderWithTheme(<ThemeToggle collapsed={false} />, "light");
		await user.click(screen.getByRole("button", { name: /dark/i }));
		expect(localStorage.getItem("theme-mode")).toBe("dark");
	});
});

describe("ThemeToggle (collapsed)", () => {
	it("renders a single button with no text label", () => {
		renderWithTheme(<ThemeToggle collapsed={true} />);
		expect(screen.getByRole("button")).toBeInTheDocument();
		expect(screen.queryByText(/light|dark|system/i)).not.toBeInTheDocument();
	});

	it("cycles mode on click: light → dark → system → light", async () => {
		const user = userEvent.setup();
		renderWithTheme(<ThemeToggle collapsed={true} />, "light");
		const btn = screen.getByRole("button");
		await user.click(btn);
		expect(localStorage.getItem("theme-mode")).toBe("dark");
		await user.click(btn);
		expect(localStorage.getItem("theme-mode")).toBe("system");
		await user.click(btn);
		expect(localStorage.getItem("theme-mode")).toBe("light");
	});
});
