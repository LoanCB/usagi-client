interface ResizeHandleProps {
  onMouseDown: (e: React.MouseEvent) => void;
  isDragging: boolean;
}

export function ResizeHandle({ onMouseDown, isDragging }: ResizeHandleProps) {
  return (
    <div
      onMouseDown={onMouseDown}
      className={[
        "w-1 shrink-0 h-full cursor-col-resize transition-colors duration-150",
        isDragging ? "bg-border" : "bg-transparent hover:bg-border",
      ].join(" ")}
    />
  );
}
