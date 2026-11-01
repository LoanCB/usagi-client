import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "@/i18n";
import { TagNameTakenError } from "@/db/tag-errors";
import { PRESET_COLORS } from "@/lib/colors";
import { useTagStore } from "@/store/tags";
import type { Tag } from "@/types";
import { ProjectTagsEditor } from "./ProjectTagsEditor";

const repo = vi.hoisted(() => ({}));
vi.mock("@/store/repository", () => ({ getRepository: () => repo }));

const createTag = vi.fn();
const updateTag = vi.fn();
const deleteTag = vi.fn();

const tag = (over: Partial<Tag>): Tag => ({
	id: "t1",
	name: "Urgent",
	color: "#ff0000",
	projectId: "p1",
	...over,
});

beforeEach(() => {
	vi.clearAllMocks();
	useTagStore.setState({
		tags: [
			tag({}),
			tag({ id: "t2", name: "Other project", projectId: "p2" }),
			tag({ id: "t3", name: "Generic", projectId: null }),
		],
		createTag,
		updateTag,
		deleteTag,
	});
});

describe("ProjectTagsEditor", () => {
	it("lists only the tags of the project", () => {
		render(<ProjectTagsEditor projectId="p1" />);
		expect(screen.getByText("Urgent")).toBeInTheDocument();
		expect(screen.queryByText("Other project")).not.toBeInTheDocument();
		expect(screen.queryByText("Generic")).not.toBeInTheDocument();
	});

	it("adds a tag to the project with Enter, without submitting the form", async () => {
		const user = userEvent.setup();
		const onSubmit = vi.fn((e: { preventDefault(): void }) =>
			e.preventDefault(),
		);
		render(
			<form onSubmit={onSubmit}>
				<ProjectTagsEditor projectId="p1" />
			</form>,
		);
		await user.type(screen.getByPlaceholderText(/tag name/i), " Later {Enter}");
		await waitFor(() =>
			expect(createTag).toHaveBeenCalledWith(
				repo,
				expect.objectContaining({ name: "Later", projectId: "p1" }),
			),
		);
		expect(onSubmit).not.toHaveBeenCalled();
	});

	it("adds a tag with the + button and the chosen color", async () => {
		const user = userEvent.setup();
		render(<ProjectTagsEditor projectId="p1" />);
		await user.type(screen.getByPlaceholderText(/tag name/i), "Later");
		const swatches = screen.getAllByRole("button");
		await user.click(swatches[swatches.length - 1]);
		await user.click(screen.getByRole("button", { name: /^new tag$/i }));
		await waitFor(() => expect(createTag).toHaveBeenCalledTimes(1));
		const input = createTag.mock.calls[0][1];
		expect(input.name).toBe("Later");
		expect(input.color).toBe(PRESET_COLORS[PRESET_COLORS.length - 1]);
	});

	it("says why a tag could not be added", async () => {
		const user = userEvent.setup();
		createTag.mockRejectedValueOnce(new TagNameTakenError("Urgent"));
		render(<ProjectTagsEditor projectId="p1" />);
		await user.type(screen.getByPlaceholderText(/tag name/i), "Urgent{Enter}");
		expect(await screen.findByRole("alert")).toHaveTextContent(
			/already exists/i,
		);
		expect(screen.getByPlaceholderText(/tag name/i)).toHaveValue("Urgent");
	});

	it("renames a tag", async () => {
		const user = userEvent.setup();
		render(<ProjectTagsEditor projectId="p1" />);
		await user.click(screen.getByRole("button", { name: /edit tag urgent/i }));
		const input = screen.getByDisplayValue("Urgent");
		await user.clear(input);
		await user.type(input, "Soon{Enter}");
		await waitFor(() =>
			expect(updateTag).toHaveBeenCalledWith(repo, "t1", {
				name: "Soon",
				color: "#ff0000",
			}),
		);
	});

	it("deletes a tag", async () => {
		const user = userEvent.setup();
		render(<ProjectTagsEditor projectId="p1" />);
		await user.click(
			screen.getByRole("button", { name: /delete tag urgent/i }),
		);
		expect(deleteTag).toHaveBeenCalledWith(repo, "t1");
	});
});
