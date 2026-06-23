import { GroupColorShape } from "@/components/ui/GroupColorShape";
import { getShapeForColor } from "@/lib/group-shapes";
import { useSettingsStore } from "@/store/settings";

interface ColorPickerProps {
	colors: readonly string[];
	selectedColor: string;
	onSelect: (color: string) => void;
}

export function ColorPicker({
	colors,
	selectedColor,
	onSelect,
}: ColorPickerProps) {
	const colorblindMode = useSettingsStore((s) => s.colorblindMode);
	const btnSize = colorblindMode ? "h-6 w-6" : "h-5 w-5";

	return (
		<div className="flex gap-1.5 flex-wrap">
			{colors.map((c) => (
				<button
					key={c}
					type="button"
					onClick={() => onSelect(c)}
					className={`${btnSize} flex items-center justify-center transition-transform hover:scale-110 focus:outline-none rounded-full`}
					style={{
						outline: selectedColor === c ? `2px solid ${c}` : undefined,
						outlineOffset: selectedColor === c ? "2px" : undefined,
					}}
					aria-label={colorblindMode ? `${c} ${getShapeForColor(c)}` : c}
				>
					<GroupColorShape color={c} size={colorblindMode ? 14 : 16} />
				</button>
			))}
		</div>
	);
}
