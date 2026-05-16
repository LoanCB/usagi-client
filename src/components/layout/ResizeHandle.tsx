interface ResizeHandleProps {
  onMouseDown: (e: React.MouseEvent) => void;
  onDoubleClick: () => void;
  isDragging: boolean;
}

export function ResizeHandle({
  onMouseDown,
  onDoubleClick,
  isDragging,
}: Readonly<ResizeHandleProps>) {
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: resize handle is intentionally mouse-only
    <div
      onMouseDown={onMouseDown}
      onDoubleClick={onDoubleClick}
      className={[
        "w-1 shrink-0 h-full cursor-col-resize transition-colors duration-150",
        isDragging ? "bg-border" : "bg-transparent hover:bg-border",
      ].join(" ")}
    />
  );
}
