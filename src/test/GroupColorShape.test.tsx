// src/test/GroupColorShape.test.tsx
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GroupColorShape } from "@/components/ui/GroupColorShape";
import { useSettingsStore } from "@/store/settings";

vi.mock("@/store/settings", () => ({
	useSettingsStore: vi.fn(),
}));

const mockSettings = useSettingsStore as unknown as ReturnType<typeof vi.fn>;

describe("GroupColorShape — mode normal", () => {
	it("rend un span cercle CSS avec la bonne couleur de fond", () => {
		mockSettings.mockReturnValue(false);
		const { container } = render(<GroupColorShape color="#ef4444" size={8} />);
		const span = container.querySelector("span");
		expect(span).toBeTruthy();
		// happy-dom does not normalize hex colors to rgb; #ef4444 = rgb(239,68,68)
		expect(span?.style.backgroundColor).toBe("#ef4444");
	});

	it("applique la className passée en prop", () => {
		mockSettings.mockReturnValue(false);
		const { container } = render(
			<GroupColorShape color="#3b82f6" className="shrink-0" />,
		);
		expect(container.querySelector(".shrink-0")).toBeTruthy();
	});
});

describe("GroupColorShape — mode daltonien", () => {
	it("rend un svg avec aria-hidden", () => {
		mockSettings.mockReturnValue(true);
		const { container } = render(<GroupColorShape color="#ef4444" size={8} />);
		const svg = container.querySelector("svg");
		expect(svg).toBeTruthy();
		expect(svg?.getAttribute("aria-hidden")).toBe("true");
	});

	it("le svg a les bonnes dimensions", () => {
		mockSettings.mockReturnValue(true);
		const { container } = render(<GroupColorShape color="#3b82f6" size={20} />);
		const svg = container.querySelector("svg");
		expect(svg?.getAttribute("width")).toBe("20");
		expect(svg?.getAttribute("height")).toBe("20");
		expect(svg?.getAttribute("viewBox")).toBe("0 0 10 10");
	});

	it("la forme fill correspond à la couleur passée", () => {
		mockSettings.mockReturnValue(true);
		const { container } = render(<GroupColorShape color="#84cc16" size={8} />);
		const path = container.querySelector("path, polygon, circle, rect");
		expect(path?.getAttribute("fill")).toBe("#84cc16");
	});
});
