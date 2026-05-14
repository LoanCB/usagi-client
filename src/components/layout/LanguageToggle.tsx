import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

interface LanguageToggleProps {
	readonly collapsed: boolean;
}

export function LanguageToggle({ collapsed }: LanguageToggleProps) {
	const { i18n } = useTranslation();
	const current = i18n.language.startsWith("fr") ? "fr" : "en";

	if (collapsed) {
		return (
			<div className="px-2 py-2 flex justify-center border-t border-border">
				<span className="text-xs font-medium text-muted-foreground uppercase">
					{current}
				</span>
			</div>
		);
	}

	return (
		<div className="flex gap-1 px-2 py-2 border-t border-border">
			{(["fr", "en"] as const).map((lang) => (
				<button
					key={lang}
					type="button"
					onClick={() => i18n.changeLanguage(lang)}
					aria-label={lang === "fr" ? "Français" : "English"}
					aria-pressed={current === lang}
					className={cn(
						"flex-1 text-xs py-1 rounded-md transition-colors uppercase font-medium",
						current === lang
							? "bg-primary text-primary-foreground"
							: "text-muted-foreground hover:text-foreground",
					)}
				>
					{lang}
				</button>
			))}
		</div>
	);
}
