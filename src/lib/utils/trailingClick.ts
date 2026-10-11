const MOUSE_EVENTS = ['mousedown', 'mouseup', 'click'] as const;
const WINDOW_MS = 400;

let stop: (() => void) | null = null;

/** After a drag iOS can still send the mouse events of a click, aimed at where the finger went
 *  down. Something else may sit there by then, and a mousedown on it takes focus, and with it
 *  the keyboard. Swallows them until the next touch or a short timeout. */
export function swallowTrailingClick() {
	stop?.();
	const swallow = (event: Event) => {
		event.preventDefault();
		event.stopPropagation();
	};
	const end = () => {
		clearTimeout(timer);
		for (const type of MOUSE_EVENTS) window.removeEventListener(type, swallow, true);
		window.removeEventListener('touchstart', end, true);
		stop = null;
	};
	const timer = setTimeout(end, WINDOW_MS);
	for (const type of MOUSE_EVENTS) window.addEventListener(type, swallow, true);
	window.addEventListener('touchstart', end, { capture: true, passive: true });
	stop = end;
}
