import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import "@/i18n";
import { SetupScreen } from "./SetupScreen";

async function fill(
	user: ReturnType<typeof userEvent.setup>,
	password: string,
) {
	await user.type(
		screen.getByLabelText(/^password$|^mot de passe$/i),
		password,
	);
	await user.type(screen.getByLabelText(/confirm/i), password);
	await user.click(screen.getByRole("button", { name: /protect|protéger/i }));
}

function setup() {
	const onPassword = vi.fn();
	render(
		<SetupScreen
			legacy={false}
			busy={false}
			error={null}
			onPassword={onPassword}
			onNoPassword={vi.fn()}
		/>,
	);
	return onPassword;
}

describe("SetupScreen password strength", () => {
	it("submits a strong password without asking for confirmation", async () => {
		const user = userEvent.setup();
		const onPassword = setup();
		await fill(user, "Str0ng-pass");
		expect(onPassword).toHaveBeenCalledWith("Str0ng-pass");
		expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
	});

	it("accepts a dash-separated passphrase", async () => {
		const user = userEvent.setup();
		const onPassword = setup();
		await fill(user, "correct-horse-battery");
		expect(onPassword).toHaveBeenCalledWith("correct-horse-battery");
	});

	it("warns about a weak password and only submits once confirmed", async () => {
		const user = userEvent.setup();
		const onPassword = setup();
		await fill(user, "weak");
		expect(await screen.findByRole("dialog")).toBeInTheDocument();
		expect(onPassword).not.toHaveBeenCalled();
		await user.click(
			screen.getByRole("button", { name: /use anyway|utiliser quand même/i }),
		);
		expect(onPassword).toHaveBeenCalledWith("weak");
	});

	it("drops a weak password when the user chooses another", async () => {
		const user = userEvent.setup();
		const onPassword = setup();
		await fill(user, "weak");
		await user.click(
			await screen.findByRole("button", {
				name: /choose another|en choisir un autre/i,
			}),
		);
		expect(onPassword).not.toHaveBeenCalled();
	});
});
