import type { TFunction } from "i18next";
import { TagNameTakenError } from "@/db/tag-errors";

export function tagErrorMessage(t: TFunction, e: unknown): string {
	if (e instanceof TagNameTakenError) return t("tag.nameTaken");
	return t("tag.saveFailed", {
		detail: e instanceof Error ? e.message : String(e),
	});
}
