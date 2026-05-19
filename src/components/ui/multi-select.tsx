import { Check, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";

export interface MultiSelectOption {
	value: string;
	label: string;
}

interface MultiSelectProps {
	options: MultiSelectOption[];
	value: string[] | null;
	onChange: (value: string[] | null) => void;
	allLabel: string;
	itemsLabel?: string;
}

export function MultiSelect({
	options,
	value,
	onChange,
	allLabel,
	itemsLabel,
}: MultiSelectProps) {
	function triggerLabel(): string {
		if (value === null) return allLabel;
		if (value.length === 0) return allLabel;
		if (value.length === 1) {
			return options.find((o) => o.value === value[0])?.label ?? value[0];
		}
		if (value.length === 2) {
			return value
				.map((v) => options.find((o) => o.value === v)?.label ?? v)
				.join(", ");
		}
		return itemsLabel ? `${value.length} ${itemsLabel}` : String(value.length);
	}

	function handleToggle(optionValue: string) {
		if (value === null) {
			onChange([optionValue]);
			return;
		}
		const next = value.includes(optionValue)
			? value.filter((v) => v !== optionValue)
			: [...value, optionValue];
		onChange(next.length === 0 ? null : next);
	}

	return (
		<Popover>
			<PopoverTrigger
				render={
					<Button variant="outline" size="sm" className="gap-1.5 font-normal">
						<span className="line-clamp-1 max-w-48">{triggerLabel()}</span>
						<ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
					</Button>
				}
			/>
			<PopoverContent className="w-52 p-1" align="start">
				<button
					type="button"
					onClick={() => onChange(null)}
					className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent"
				>
					<span className="flex-1 text-left">{allLabel}</span>
					{value === null && <Check className="size-3.5 shrink-0" />}
				</button>
				<div className="my-1 h-px bg-border" />
				{options.map((option) => {
					const checked = value?.includes(option.value);
					return (
						<button
							key={option.value}
							type="button"
							onClick={() => handleToggle(option.value)}
							className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent"
						>
							<span className="flex-1 text-left">{option.label}</span>
							{checked && <Check className="size-3.5 shrink-0" />}
						</button>
					);
				})}
			</PopoverContent>
		</Popover>
	);
}
