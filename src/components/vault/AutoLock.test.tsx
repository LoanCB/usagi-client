import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "@/i18n";
import { useSettingsStore } from "@/store/settings";
import type { VaultApi, VaultState } from "@/vault";
import { AutoLock } from "./AutoLock";

function api(state: VaultState, over: Partial<VaultApi> = {}): VaultApi {
	return {
		status: vi.fn(async () => ({
			state,
			migrating: false,
			syncBound: false,
			brokenReason: null,
		})),
		unlockPassword: vi.fn(async () => {}),
		...over,
	} as unknown as VaultApi;
}

beforeEach(() => useSettingsStore.setState({ autoLockMinutes: 0 }));

async function idle(minutes: number) {
	await act(async () => {
		await vi.advanceTimersByTimeAsync(minutes * 60_000);
	});
}

describe("AutoLock", () => {
	it("never locks by default", async () => {
		vi.useFakeTimers();
		render(
			<AutoLock api={api("password")}>
				<p>the app</p>
			</AutoLock>,
		);
		await idle(600);
		expect(screen.queryByLabelText(/^password$|^mot de passe$/i)).toBeNull();
		vi.useRealTimers();
	});

	it("locks after the delay and unlocks with the password", async () => {
		vi.useFakeTimers({ shouldAdvanceTime: true });
		useSettingsStore.setState({ autoLockMinutes: 5 });
		const vault = api("password");
		render(
			<AutoLock api={vault}>
				<p>the app</p>
			</AutoLock>,
		);
		await idle(5);
		const field = await screen.findByLabelText(/^password$|^mot de passe$/i);
		await userEvent.type(field, "hunter2");
		await userEvent.click(
			screen.getByRole("button", { name: /^unlock$|^déverrouiller$/i }),
		);
		expect(vault.unlockPassword).toHaveBeenCalledWith("hunter2");
		expect(screen.queryByLabelText(/^password$|^mot de passe$/i)).toBeNull();
		vi.useRealTimers();
	});

	it("stays locked on a wrong password", async () => {
		vi.useFakeTimers({ shouldAdvanceTime: true });
		useSettingsStore.setState({ autoLockMinutes: 1 });
		render(
			<AutoLock
				api={api("password", {
					unlockPassword: vi.fn().mockRejectedValue({ code: "wrong-secret" }),
				})}
			>
				<p>the app</p>
			</AutoLock>,
		);
		await idle(1);
		await userEvent.type(
			await screen.findByLabelText(/^password$|^mot de passe$/i),
			"nope",
		);
		await userEvent.click(
			screen.getByRole("button", { name: /^unlock$|^déverrouiller$/i }),
		);
		expect(
			await screen.findByText(/did not work|n'a pas fonctionné/i),
		).toBeTruthy();
		vi.useRealTimers();
	});

	it("does not lock a keychain vault", async () => {
		vi.useFakeTimers();
		useSettingsStore.setState({ autoLockMinutes: 1 });
		render(
			<AutoLock api={api("keychain")}>
				<p>the app</p>
			</AutoLock>,
		);
		await idle(2);
		expect(screen.queryByLabelText(/^password$|^mot de passe$/i)).toBeNull();
		vi.useRealTimers();
	});
});
