import { useTranslation } from "react-i18next";
import { getRepository } from "@/store/repository";
import { useSettingsStore } from "@/store/settings";
import { AUTO_LOCK_OPTIONS } from "./auto-lock-options";

/** Needs a password vault: a keychain vault has nothing to ask for. */
export function AutoLockSetting({ disabled }: { disabled: boolean }) {
	const { t } = useTranslation();
	const minutes = useSettingsStore((s) => s.autoLockMinutes);
	const setMinutes = useSettingsStore((s) => s.setAutoLockMinutes);
	return (
		<div className="flex max-w-sm flex-col gap-1.5 border-t border-border pt-4 text-sm">
			<label htmlFor="security-auto-lock" className="font-medium">
				{t("vault.autoLockTitle")}
			</label>
			<select
				id="security-auto-lock"
				className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm disabled:opacity-50"
				disabled={disabled}
				value={minutes}
				onChange={(e) =>
					void setMinutes(getRepository(), Number(e.target.value))
				}
			>
				{AUTO_LOCK_OPTIONS.map((m) => (
					<option key={m} value={m}>
						{m === 0
							? t("vault.autoLockNever")
							: t("vault.autoLockMinutes", { count: m })}
					</option>
				))}
			</select>
			<p className="text-xs text-muted-foreground">
				{disabled ? t("vault.autoLockNeedsPassword") : t("vault.autoLockHint")}
			</p>
		</div>
	);
}
