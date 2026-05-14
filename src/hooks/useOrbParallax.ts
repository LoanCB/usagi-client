import { useCallback, useEffect, useRef } from "react";

// Max offset for each orb (in px, as a fraction of the smallest viewport dimension).
// Negative value = drifts opposite to cursor (depth illusion).
const STRENGTHS = [0.08, -0.05, 0.12] as const;
// Lerp factor per frame — lower = lazier, dreamier follow
const LERP = 0.06;

export function useOrbParallax(enabled: boolean) {
	const orbEls = useRef<(HTMLDivElement | null)[]>([null, null, null]);
	const targetRef = useRef({ x: 0, y: 0 });
	const currentRef = useRef([
		{ x: 0, y: 0 },
		{ x: 0, y: 0 },
		{ x: 0, y: 0 },
	]);
	const rafRef = useRef<number>(0);

	// Stable callbacks — created once so React never re-runs ref assignment on re-renders
	const refCallbacks = useRef([
		(el: HTMLDivElement | null) => {
			orbEls.current[0] = el;
		},
		(el: HTMLDivElement | null) => {
			orbEls.current[1] = el;
		},
		(el: HTMLDivElement | null) => {
			orbEls.current[2] = el;
		},
	]);

	const setOrbRef = useCallback(
		(index: 0 | 1 | 2) => refCallbacks.current[index],
		[],
	);

	useEffect(() => {
		if (!enabled) {
			cancelAnimationFrame(rafRef.current);
			orbEls.current.forEach((el) => {
				if (el) el.style.transform = "";
			});
			return;
		}

		function onMouseMove(e: MouseEvent) {
			targetRef.current = {
				x: (e.clientX / window.innerWidth - 0.5) * 2,
				y: (e.clientY / window.innerHeight - 0.5) * 2,
			};
		}

		function tick() {
			const base = Math.min(window.innerWidth, window.innerHeight);
			orbEls.current.forEach((el, i) => {
				if (!el) return;
				const cur = currentRef.current[i];
				const tx = targetRef.current.x * STRENGTHS[i] * base;
				const ty = targetRef.current.y * STRENGTHS[i] * base;
				cur.x += (tx - cur.x) * LERP;
				cur.y += (ty - cur.y) * LERP;
				el.style.transform = `translate(${cur.x.toFixed(1)}px, ${cur.y.toFixed(1)}px)`;
			});
			rafRef.current = requestAnimationFrame(tick);
		}

		window.addEventListener("mousemove", onMouseMove, { passive: true });
		rafRef.current = requestAnimationFrame(tick);

		return () => {
			window.removeEventListener("mousemove", onMouseMove);
			cancelAnimationFrame(rafRef.current);
			orbEls.current.forEach((el) => {
				if (el) el.style.transform = "";
			});
		};
	}, [enabled]);

	return { setOrbRef };
}
