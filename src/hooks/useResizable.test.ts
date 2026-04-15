import { renderHook, act, fireEvent } from '@testing-library/react';
import { useResizable } from './useResizable';

const OPTIONS = {
  storageKey: 'test-resize-width',
  defaultWidth: 320,
  minWidth: 240,
  maxWidth: 600,
};

beforeEach(() => {
  localStorage.clear();
});

describe('useResizable', () => {
  it('initializes with defaultWidth when localStorage is empty', () => {
    const { result } = renderHook(() => useResizable(OPTIONS));
    expect(result.current.width).toBe(320);
  });

  it('initializes from localStorage when a stored value exists', () => {
    localStorage.setItem('test-resize-width', '450');
    const { result } = renderHook(() => useResizable(OPTIONS));
    expect(result.current.width).toBe(450);
  });

  it('falls back to defaultWidth when localStorage contains an invalid value', () => {
    localStorage.setItem('test-resize-width', 'not-a-number');
    const { result } = renderHook(() => useResizable(OPTIONS));
    expect(result.current.width).toBe(320);
  });

  it('isDragging is false initially', () => {
    const { result } = renderHook(() => useResizable(OPTIONS));
    expect(result.current.isDragging).toBe(false);
  });

  it('sets isDragging to true on mousedown and false on mouseup', () => {
    const { result } = renderHook(() => useResizable(OPTIONS));

    act(() => {
      result.current.onMouseDown({ clientX: 500 } as React.MouseEvent);
    });
    expect(result.current.isDragging).toBe(true);

    act(() => {
      fireEvent.mouseUp(document);
    });
    expect(result.current.isDragging).toBe(false);
  });

  it('updates width on mousemove during drag', () => {
    const { result } = renderHook(() => useResizable(OPTIONS));

    act(() => {
      result.current.onMouseDown({ clientX: 500 } as React.MouseEvent);
    });

    act(() => {
      fireEvent.mouseMove(document, { clientX: 460 });
    });

    // dragging left by 40px → width increases by 40px: 320 + 40 = 360
    expect(result.current.width).toBe(360);
  });

  it('clamps width to minWidth', () => {
    const { result } = renderHook(() => useResizable(OPTIONS));

    act(() => {
      result.current.onMouseDown({ clientX: 500 } as React.MouseEvent);
    });

    act(() => {
      fireEvent.mouseMove(document, { clientX: 600 }); // dragging right → shrinks below min
    });

    expect(result.current.width).toBe(240);
  });

  it('clamps width to maxWidth', () => {
    const { result } = renderHook(() => useResizable(OPTIONS));

    act(() => {
      result.current.onMouseDown({ clientX: 500 } as React.MouseEvent);
    });

    act(() => {
      fireEvent.mouseMove(document, { clientX: 0 }); // dragging far left → exceeds max
    });

    expect(result.current.width).toBe(600);
  });

  it('persists width to localStorage on mouseup', () => {
    const { result } = renderHook(() => useResizable(OPTIONS));

    act(() => {
      result.current.onMouseDown({ clientX: 500 } as React.MouseEvent);
    });
    act(() => {
      fireEvent.mouseMove(document, { clientX: 460 });
    });
    act(() => {
      fireEvent.mouseUp(document);
    });

    expect(localStorage.getItem('test-resize-width')).toBe('360');
  });

  it('does not update width on mousemove when not dragging', () => {
    const { result } = renderHook(() => useResizable(OPTIONS));

    act(() => {
      fireEvent.mouseMove(document, { clientX: 460 });
    });

    expect(result.current.width).toBe(320);
  });
});
