import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import "@/i18n";
import { SignInForm } from "./SignInForm";

const email = () => screen.getByLabelText(/email|adresse e-mail/i);
const password = () => screen.getByLabelText(/password|mot de passe/i);
// Matches both the idle and in-flight labels ("Sign in" / "Signing in…" and their
// French equivalents) so the query still finds the same button while busy=true.
const submit = () =>
	screen.getByRole("button", {
		name: /^sign in$|^se connecter$|^signing in|^connexion/i,
	});

describe("SignInForm", () => {
	it("n'active la soumission qu'avec les deux champs remplis", async () => {
		const user = userEvent.setup();
		render(<SignInForm onSubmit={vi.fn()} />);
		expect(submit()).toBeDisabled();
		await user.type(email(), "a@example.com");
		expect(submit()).toBeDisabled();
		await user.type(password(), "hunter2hunter2");
		expect(submit()).toBeEnabled();
	});

	it("transmet les identifiants saisis", async () => {
		const user = userEvent.setup();
		const onSubmit = vi.fn(async () => {});
		render(<SignInForm onSubmit={onSubmit} />);
		await user.type(email(), "a@example.com");
		await user.type(password(), "hunter2hunter2");
		await user.click(submit());
		expect(onSubmit).toHaveBeenCalledWith({
			email: "a@example.com",
			password: "hunter2hunter2",
		});
	});

	it("masque le mot de passe", async () => {
		render(<SignInForm onSubmit={vi.fn()} />);
		expect(password()).toHaveAttribute("type", "password");
	});

	it("affiche une erreur explicite quand la connexion échoue", async () => {
		const user = userEvent.setup();
		render(
			<SignInForm
				onSubmit={vi.fn(async () => {
					throw new Error("401");
				})}
			/>,
		);
		await user.type(email(), "a@example.com");
		await user.type(password(), "wrong-password");
		await user.click(submit());
		expect(
			await screen.findByText(/wrong email or password|incorrect/i),
		).toBeInTheDocument();
	});

	it("ne soumet pas deux fois pendant que la requête est en vol", async () => {
		const user = userEvent.setup();
		let resolve: () => void = () => {};
		const onSubmit = vi.fn(
			() =>
				new Promise<void>((r) => {
					resolve = r;
				}),
		);
		render(<SignInForm onSubmit={onSubmit} />);
		await user.type(email(), "a@example.com");
		await user.type(password(), "hunter2hunter2");
		await user.click(submit());
		expect(submit()).toBeDisabled();
		await user.click(submit());
		expect(onSubmit).toHaveBeenCalledTimes(1);
		resolve();
	});

	it("efface l'erreur de connexion dès que l'utilisateur modifie un champ", async () => {
		const user = userEvent.setup();
		const onSubmit = vi.fn(async () => {
			throw new Error("401");
		});
		render(<SignInForm onSubmit={onSubmit} />);
		await user.type(email(), "a@example.com");
		await user.type(password(), "wrong-password");
		await user.click(submit());
		expect(
			await screen.findByText(/wrong email or password|incorrect/i),
		).toBeInTheDocument();

		await user.type(password(), "x");
		expect(
			screen.queryByText(/wrong email or password|incorrect/i),
		).not.toBeInTheDocument();
	});
});
