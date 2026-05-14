import { beforeEach, describe, expect, it } from "vitest";
import { useUIStore } from "./ui";

beforeEach(() => {
	useUIStore.setState({
		sidebarCollapsed: false,
		selectedProjectId: undefined,
		selectedTaskId: null,
		activeFilters: {},
	});
});

describe("setSidebarCollapsed", () => {
	it("updates sidebarCollapsed to true", () => {
		useUIStore.getState().setSidebarCollapsed(true);
		expect(useUIStore.getState().sidebarCollapsed).toBe(true);
	});

	it("updates sidebarCollapsed to false", () => {
		useUIStore.setState({ sidebarCollapsed: true });
		useUIStore.getState().setSidebarCollapsed(false);
		expect(useUIStore.getState().sidebarCollapsed).toBe(false);
	});
});

describe("setSelectedProject", () => {
	it("updates selectedProjectId", () => {
		useUIStore.getState().setSelectedProject("proj-1");
		expect(useUIStore.getState().selectedProjectId).toBe("proj-1");
	});

	it("resets selectedTaskId to null", () => {
		useUIStore.setState({ selectedTaskId: "task-1" });
		useUIStore.getState().setSelectedProject("proj-1");
		expect(useUIStore.getState().selectedTaskId).toBeNull();
	});

	it("resets activeFilters to empty object", () => {
		useUIStore.setState({ activeFilters: { priority: "high" } });
		useUIStore.getState().setSelectedProject("proj-1");
		expect(useUIStore.getState().activeFilters).toEqual({});
	});

	it("accepts null for Inbox view", () => {
		useUIStore.getState().setSelectedProject(null);
		expect(useUIStore.getState().selectedProjectId).toBeNull();
	});

	it("accepts undefined for all-tasks view", () => {
		useUIStore.getState().setSelectedProject(undefined);
		expect(useUIStore.getState().selectedProjectId).toBeUndefined();
	});
});

describe("setSelectedTask", () => {
	it("updates selectedTaskId", () => {
		useUIStore.getState().setSelectedTask("task-42");
		expect(useUIStore.getState().selectedTaskId).toBe("task-42");
	});

	it("clears selectedTaskId when set to null", () => {
		useUIStore.setState({ selectedTaskId: "task-1" });
		useUIStore.getState().setSelectedTask(null);
		expect(useUIStore.getState().selectedTaskId).toBeNull();
	});
});

describe("setFilters", () => {
	it("merges partial filters over existing activeFilters", () => {
		useUIStore.setState({ activeFilters: { priority: "high" } });
		useUIStore.getState().setFilters({ completed: true });
		expect(useUIStore.getState().activeFilters).toEqual({
			priority: "high",
			completed: true,
		});
	});

	it("overwrites an existing key", () => {
		useUIStore.setState({ activeFilters: { priority: "high" } });
		useUIStore.getState().setFilters({ priority: "low" });
		expect(useUIStore.getState().activeFilters.priority).toBe("low");
	});
});
