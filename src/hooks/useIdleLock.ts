import { useEffect } from "react";

const ACTIVITY_EVENTS = ["pointerdown", "keydown", "wheel", "touchstart"];

/** Calls `onIdle` once `minutes` pass without input; 0 disables the timer. */
export function useIdleLock(minutes: number, onIdle: () => void) {
	useEffect(() => {
		if (minutes <= 0) return;
		const delay = minutes * 60_000;
		let timer = setTimeout(onIdle, delay);
		function reset() {
			clearTimeout(timer);
			timer = setTimeout(onIdle, delay);
		}
		for (const ev of ACTIVITY_EVENTS) {
			window.addEventListener(ev, reset, { passive: true, capture: true });
		}
		return () => {
			clearTimeout(timer);
			for (const ev of ACTIVITY_EVENTS) {
				window.removeEventListener(ev, reset, { capture: true });
			}
		};
	}, [minutes, onIdle]);
}
