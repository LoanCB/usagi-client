import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@/i18n";
import { CalendarStatusFilter } from "@/components/calendar/CalendarStatusFilter";

describe("CalendarStatusFilter", () => {
  it("trigger shows 'All statuses' when value is undefined", () => {
    render(<CalendarStatusFilter value={undefined} onChange={vi.fn()} />);
    expect(
      screen.getByRole("button", { name: /status filter/i }),
    ).toHaveTextContent("All statuses");
  });

  it("trigger shows 'Not done' when value is pending", () => {
    render(<CalendarStatusFilter value="pending" onChange={vi.fn()} />);
    expect(
      screen.getByRole("button", { name: /status filter/i }),
    ).toHaveTextContent("Not done");
  });

  it("trigger shows 'Overdue' when value is overdue", () => {
    render(<CalendarStatusFilter value="overdue" onChange={vi.fn()} />);
    expect(
      screen.getByRole("button", { name: /status filter/i }),
    ).toHaveTextContent("Overdue");
  });

  it("trigger shows 'Completed' when value is completed", () => {
    render(<CalendarStatusFilter value="completed" onChange={vi.fn()} />);
    expect(
      screen.getByRole("button", { name: /status filter/i }),
    ).toHaveTextContent("Completed");
  });

  it("opens popover and lists all 4 options on trigger click", async () => {
    const user = userEvent.setup();
    render(<CalendarStatusFilter value={undefined} onChange={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /status filter/i }));
    expect(screen.getAllByText("All statuses")).toHaveLength(2); // trigger + popover
    expect(screen.getAllByText("Not done")).toHaveLength(1);
    expect(screen.getByText("Overdue")).toBeInTheDocument();
    expect(screen.getByText("Completed")).toBeInTheDocument();
  });

  it("calls onChange(undefined) when 'All statuses' is clicked", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<CalendarStatusFilter value="pending" onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: /status filter/i }));
    const allButtons = screen.getAllByText("All statuses");
    await user.click(allButtons[allButtons.length - 1]);
    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it("calls onChange('pending') when 'Not done' is clicked", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<CalendarStatusFilter value={undefined} onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: /status filter/i }));
    await user.click(screen.getByText("Not done"));
    expect(onChange).toHaveBeenCalledWith("pending");
  });

  it("calls onChange('overdue') when 'Overdue' is clicked", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<CalendarStatusFilter value={undefined} onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: /status filter/i }));
    await user.click(screen.getByText("Overdue"));
    expect(onChange).toHaveBeenCalledWith("overdue");
  });

  it("calls onChange('completed') when 'Completed' is clicked", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<CalendarStatusFilter value={undefined} onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: /status filter/i }));
    await user.click(screen.getByText("Completed"));
    expect(onChange).toHaveBeenCalledWith("completed");
  });

  it("shows checkmark next to active option", async () => {
    const user = userEvent.setup();
    render(<CalendarStatusFilter value={undefined} onChange={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /status filter/i }));
    const allStatusesRow = screen
      .getAllByText("All statuses")[1]
      .closest("button");
    expect(allStatusesRow).toHaveClass("bg-accent");
  });
});
