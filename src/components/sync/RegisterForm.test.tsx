import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import "@/i18n";
import { RegisterForm } from "./RegisterForm";

const PHRASE = Array.from({ length: 24 }, (_, i) => `word${i + 1}`).join(" ");
const FIXED = () => 0;

const email = () => screen.getByLabelText(/email|adresse e-mail/i);
const password = () => screen.getByLabelText(/^password$|^mot de passe$/i);
const submit = () =>
	screen.getByRole("button", { name: /^create account$|^créer un compte$/i });

describe("RegisterForm", () => {
	it("crée le compte puis montre la clé de récupération", async () => {
		const user = userEvent.setup();
		const onSubmit = vi.fn(async () => PHRASE);
		render(
			<RegisterForm onSubmit={onSubmit} onComplete={vi.fn()} random={FIXED} />,
		);
		await user.type(email(), "a@example.com");
		await user.type(password(), "correct horse battery staple");
		await user.click(submit());
		expect(onSubmit).toHaveBeenCalledWith({
			email: "a@example.com",
			password: "correct horse battery staple",
		});
		expect(await screen.findByText("word24")).toBeInTheDocument();
	});

	it("transmet le jeton d'invitation quand il est renseigné", async () => {
		const user = userEvent.setup();
		const onSubmit = vi.fn(async () => PHRASE);
		render(
			<RegisterForm onSubmit={onSubmit} onComplete={vi.fn()} random={FIXED} />,
		);
		await user.type(email(), "a@example.com");
		await user.type(password(), "correct horse battery staple");
		await user.type(
			screen.getByLabelText(/invite token|jeton d'invitation/i),
			"inv-123",
		);
		await user.click(submit());
		expect(onSubmit).toHaveBeenCalledWith({
			email: "a@example.com",
			password: "correct horse battery staple",
			inviteToken: "inv-123",
		});
	});

	it("ne termine qu'après confirmation de la clé", async () => {
		const user = userEvent.setup();
		const onComplete = vi.fn();
		render(
			<RegisterForm
				onSubmit={vi.fn(async () => PHRASE)}
				onComplete={onComplete}
				random={FIXED}
			/>,
		);
		await user.type(email(), "a@example.com");
		await user.type(password(), "correct horse battery staple");
		await user.click(submit());
		await screen.findByText("word24");
		expect(onComplete).not.toHaveBeenCalled();

		await user.click(
			screen.getByRole("button", {
				name: /written them down|je les ai notés/i,
			}),
		);
		await user.type(screen.getByLabelText(/word 1|mot 1/i), "word1");
		await user.type(screen.getByLabelText(/word 2|mot 2/i), "word2");
		await user.type(screen.getByLabelText(/word 3|mot 3/i), "word3");
		await user.click(
			screen.getByRole("button", { name: /^confirm$|^confirmer$/i }),
		);
		expect(onComplete).toHaveBeenCalledTimes(1);
	});

	it("efface la clé de l'écran une fois confirmée", async () => {
		const user = userEvent.setup();
		render(
			<RegisterForm
				onSubmit={vi.fn(async () => PHRASE)}
				onComplete={vi.fn()}
				random={FIXED}
			/>,
		);
		await user.type(email(), "a@example.com");
		await user.type(password(), "correct horse battery staple");
		await user.click(submit());
		await screen.findByText("word24");
		await user.click(
			screen.getByRole("button", {
				name: /written them down|je les ai notés/i,
			}),
		);
		await user.type(screen.getByLabelText(/word 1|mot 1/i), "word1");
		await user.type(screen.getByLabelText(/word 2|mot 2/i), "word2");
		await user.type(screen.getByLabelText(/word 3|mot 3/i), "word3");
		await user.click(
			screen.getByRole("button", { name: /^confirm$|^confirmer$/i }),
		);
		// La phrase ne doit plus être nulle part dans le DOM.
		expect(screen.queryByText("word24")).not.toBeInTheDocument();
	});

	it("affiche une erreur et ne montre aucune clé si l'inscription échoue", async () => {
		const user = userEvent.setup();
		render(
			<RegisterForm
				onSubmit={vi.fn(async () => {
					throw new Error("400");
				})}
				onComplete={vi.fn()}
				random={FIXED}
			/>,
		);
		await user.type(email(), "a@example.com");
		await user.type(password(), "correct horse battery staple");
		await user.click(submit());
		expect(
			await screen.findByText(/could not create|impossible de créer/i),
		).toBeInTheDocument();
		expect(screen.queryByText("word24")).not.toBeInTheDocument();
	});

	it("efface l'erreur d'inscription quand l'utilisateur modifie un champ", async () => {
		const user = userEvent.setup();
		render(
			<RegisterForm
				onSubmit={vi.fn(async () => {
					throw new Error("400");
				})}
				onComplete={vi.fn()}
				random={FIXED}
			/>,
		);
		await user.type(email(), "a@example.com");
		await user.type(password(), "correct horse battery staple");
		await user.click(submit());
		expect(
			await screen.findByText(/could not create|impossible de créer/i),
		).toBeInTheDocument();

		await user.type(password(), "x");
		expect(
			screen.queryByText(/could not create|impossible de créer/i),
		).not.toBeInTheDocument();
	});
});
