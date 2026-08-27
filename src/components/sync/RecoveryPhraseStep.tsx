import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { pickConfirmationPositions } from "./recovery-confirmation";

export interface RecoveryPhraseStepProps {
	phrase: string;
	onConfirmed: () => void;
	random?: () => number;
}

const WORDS_TO_CONFIRM = 3;

export function RecoveryPhraseStep({
	phrase,
	onConfirmed,
	random,
}: RecoveryPhraseStepProps) {
	const { t } = useTranslation();
	const words = useMemo(() => phrase.trim().split(/\s+/), [phrase]);
	// A recovery phrase may legitimately repeat a word, so the word itself is not
	// a usable identity — its position is, and that position is also what the user
	// is asked to confirm. Naming it here keeps it out of the JSX as a bare index.
	const numbered = useMemo(
		() => words.map((word, index) => ({ position: index + 1, word })),
		[words],
	);
	// Drawn once per mount: re-drawing on every keystroke would move the target
	// while the user types into it.
	const positions = useMemo(
		() => pickConfirmationPositions(words.length, WORDS_TO_CONFIRM, random),
		[words.length, random],
	);

	const [confirming, setConfirming] = useState(false);
	const [answers, setAnswers] = useState<Record<number, string>>({});
	const [wrong, setWrong] = useState(false);
	const [copied, setCopied] = useState(false);

	async function handleCopy() {
		try {
			await navigator.clipboard.writeText(phrase);
			setCopied(true);
		} catch {
			// Clipboard access can be refused; the words are on screen anyway.
		}
	}

	function handleConfirm() {
		const ok = positions.every(
			(position) =>
				(answers[position] ?? "").trim().toLowerCase() ===
				words[position - 1].toLowerCase(),
		);
		if (!ok) {
			setWrong(true);
			return;
		}
		onConfirmed();
	}

	if (!confirming) {
		return (
			<div className="flex flex-col gap-3">
				<p className="text-sm font-medium">{t("sync.recovery.title")}</p>
				<p className="text-xs text-muted-foreground">
					{t("sync.recovery.intro")}
				</p>
				<ol className="grid grid-cols-3 gap-x-4 gap-y-1 rounded-md border border-border p-3 text-xs">
					{numbered.map(({ position, word }) => (
						<li key={position} className="flex gap-2">
							<span className="w-5 shrink-0 text-right text-muted-foreground">
								{position}
							</span>
							<span className="font-mono">{word}</span>
						</li>
					))}
				</ol>
				<div className="flex justify-between gap-2">
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={handleCopy}
					>
						{copied ? t("sync.recovery.copied") : t("sync.recovery.copy")}
					</Button>
					<Button type="button" onClick={() => setConfirming(true)}>
						{t("sync.recovery.continue")}
					</Button>
				</div>
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-3">
			<p className="text-sm font-medium">{t("sync.recovery.confirmTitle")}</p>
			<p className="text-xs text-muted-foreground">
				{t("sync.recovery.confirmIntro")}
			</p>
			{positions.map((position) => (
				<div key={position} className="flex flex-col gap-1.5">
					<label className="text-sm" htmlFor={`recovery-word-${position}`}>
						{t("sync.recovery.wordLabel", { position })}
					</label>
					<Input
						id={`recovery-word-${position}`}
						autoComplete="off"
						value={answers[position] ?? ""}
						onChange={(e) => {
							setAnswers((prev) => ({ ...prev, [position]: e.target.value }));
							setWrong(false);
						}}
					/>
				</div>
			))}
			{wrong && (
				<p className="text-xs text-destructive">
					{t("sync.recovery.wrongWords")}
				</p>
			)}
			<div className="flex justify-between gap-2">
				<Button
					type="button"
					variant="ghost"
					size="sm"
					onClick={() => {
						setConfirming(false);
						setWrong(false);
					}}
				>
					{t("sync.recovery.back")}
				</Button>
				<Button type="button" onClick={handleConfirm}>
					{t("sync.recovery.confirm")}
				</Button>
			</div>
		</div>
	);
}
