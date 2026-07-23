import { Sparkles, Wrench, Zap } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { localizeEntry } from "@/lib/changelog";
import type { ChangeCategory, ChangelogVersion } from "@/types/changelog";

interface ChangelogListProps {
	readonly versions: readonly ChangelogVersion[];
}

// Display order + the icon signature that distinguishes each category.
const CATEGORIES: {
	key: ChangeCategory;
	icon: React.ElementType;
	labelKey: "changelog.features" | "changelog.fixes" | "changelog.performance";
	iconClass: string;
}[] = [
	{
		key: "features",
		icon: Sparkles,
		labelKey: "changelog.features",
		iconClass: "text-primary",
	},
	{
		key: "fixes",
		icon: Wrench,
		labelKey: "changelog.fixes",
		iconClass: "text-muted-foreground",
	},
	{
		key: "performance",
		icon: Zap,
		labelKey: "changelog.performance",
		iconClass: "text-amber-500",
	},
];

export function ChangelogList({ versions }: ChangelogListProps) {
	const { t, i18n } = useTranslation();
	const lang = i18n.language;

	const dateFormatter = useMemo(
		() =>
			new Intl.DateTimeFormat(lang, {
				day: "numeric",
				month: "long",
				year: "numeric",
			}),
		[lang],
	);

	if (versions.length === 0) {
		return (
			<p className="text-sm text-muted-foreground py-4">
				{t("changelog.empty")}
			</p>
		);
	}

	return (
		<div className="flex flex-col gap-6">
			{versions.map((version) => (
				<section key={version.version} className="flex flex-col gap-3">
					<div className="flex items-baseline justify-between gap-2">
						<h3 className="text-sm font-semibold text-foreground">
							{version.tag ?? t("changelog.latestVersion")}
						</h3>
						{version.date && (
							<span className="text-xs text-muted-foreground">
								{dateFormatter.format(new Date(version.date))}
							</span>
						)}
					</div>

					{CATEGORIES.map(({ key, icon: Icon, labelKey, iconClass }) => {
						const entries = version.changes[key];
						if (!entries || entries.length === 0) return null;
						return (
							<div key={key} className="flex flex-col gap-1.5">
								<div className="flex items-center gap-1.5">
									<Icon className={`h-3.5 w-3.5 ${iconClass}`} />
									<span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
										{t(labelKey)}
									</span>
								</div>
								<ul className="flex flex-col gap-1">
									{entries.map((entry) => (
										<li
											key={entry.en}
											className="flex gap-2 text-sm text-foreground/90"
										>
											<span
												className="text-muted-foreground/40 select-none"
												aria-hidden
											>
												•
											</span>
											<span>{localizeEntry(entry, lang)}</span>
										</li>
									))}
								</ul>
							</div>
						);
					})}
				</section>
			))}
		</div>
	);
}
