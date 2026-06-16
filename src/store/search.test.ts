import { beforeEach, describe, expect, it } from "vitest";
import { useSearchStore } from "@/store/search";

beforeEach(() => {
	useSearchStore.setState({ isOpen: false });
});

describe("useSearchStore", () => {
	it("starts closed", () => {
		expect(useSearchStore.getState().isOpen).toBe(false);
	});

	it("open() sets isOpen to true", () => {
		useSearchStore.getState().open();
		expect(useSearchStore.getState().isOpen).toBe(true);
	});

	it("close() sets isOpen to false", () => {
		useSearchStore.setState({ isOpen: true });
		useSearchStore.getState().close();
		expect(useSearchStore.getState().isOpen).toBe(false);
	});

	it("toggle() opens when closed", () => {
		useSearchStore.getState().toggle();
		expect(useSearchStore.getState().isOpen).toBe(true);
	});

	it("toggle() closes when open", () => {
		useSearchStore.setState({ isOpen: true });
		useSearchStore.getState().toggle();
		expect(useSearchStore.getState().isOpen).toBe(false);
	});
});
