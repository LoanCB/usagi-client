import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import "@/i18n";
import { RecoveryPhraseStep } from "./RecoveryPhraseStep";

const WORDS = Array.from({ length: 24 }, (_, i) => `word${i + 1}`);
const PHRASE = WORDS.join(" ");

/** Constant generator ⇒ positions 1, 2, 3 (see pickConfirmationPositions). */
const FIXED = () => 0;

describe("RecoveryPhraseStep", () => {
	it("affiche les 24 mots", () => {
		render(
			<RecoveryPhraseStep
				phrase={PHRASE}
				onConfirmed={vi.fn()}
				random={FIXED}
			/>,
		);
		for (const word of WORDS) {
			expect(screen.getByText(word)).toBeInTheDocument();
		}
	});

	it("ne confirme pas tant que l'utilisateur n'a pas déclaré avoir noté la clé", async () => {
		const onConfirmed = vi.fn();
		const user = userEvent.setup();
		render(
			<RecoveryPhraseStep
				phrase={PHRASE}
				onConfirmed={onConfirmed}
				random={FIXED}
			/>,
		);
		expect(screen.queryByLabelText(/word 1|mot 1/i)).not.toBeInTheDocument();
		await user.click(
			screen.getByRole("button", {
				name: /written them down|je les ai notés/i,
			}),
		);
		expect(onConfirmed).not.toHaveBeenCalled();
		expect(screen.getByLabelText(/word 1|mot 1/i)).toBeInTheDocument();
	});

	it("refuse une ressaisie erronée et ne confirme pas", async () => {
		const onConfirmed = vi.fn();
		const user = userEvent.setup();
		render(
			<RecoveryPhraseStep
				phrase={PHRASE}
				onConfirmed={onConfirmed}
				random={FIXED}
			/>,
		);
		await user.click(
			screen.getByRole("button", {
				name: /written them down|je les ai notés/i,
			}),
		);
		await user.type(screen.getByLabelText(/word 1|mot 1/i), "word1");
		await user.type(screen.getByLabelText(/word 2|mot 2/i), "nope");
		await user.type(screen.getByLabelText(/word 3|mot 3/i), "word3");
		await user.click(
			screen.getByRole("button", { name: /^confirm$|^confirmer$/i }),
		);
		expect(onConfirmed).not.toHaveBeenCalled();
		expect(
			screen.getByText(/do not match|ne correspondent pas/i),
		).toBeInTheDocument();
	});

	it("confirme sur une ressaisie exacte, en tolérant casse et espaces", async () => {
		const onConfirmed = vi.fn();
		const user = userEvent.setup();
		render(
			<RecoveryPhraseStep
				phrase={PHRASE}
				onConfirmed={onConfirmed}
				random={FIXED}
			/>,
		);
		await user.click(
			screen.getByRole("button", {
				name: /written them down|je les ai notés/i,
			}),
		);
		await user.type(screen.getByLabelText(/word 1|mot 1/i), " WORD1 ");
		await user.type(screen.getByLabelText(/word 2|mot 2/i), "word2");
		await user.type(screen.getByLabelText(/word 3|mot 3/i), "Word3");
		await user.click(
			screen.getByRole("button", { name: /^confirm$|^confirmer$/i }),
		);
		expect(onConfirmed).toHaveBeenCalledTimes(1);
	});

	it("permet de revoir la clé avant de confirmer", async () => {
		const user = userEvent.setup();
		render(
			<RecoveryPhraseStep
				phrase={PHRASE}
				onConfirmed={vi.fn()}
				random={FIXED}
			/>,
		);
		await user.click(
			screen.getByRole("button", {
				name: /written them down|je les ai notés/i,
			}),
		);
		await user.click(
			screen.getByRole("button", {
				name: /show the key again|afficher à nouveau/i,
			}),
		);
		expect(screen.getByText("word24")).toBeInTheDocument();
	});
});
