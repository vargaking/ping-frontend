export type ScrollBox = {
	overflowX: string;
	overflowY: string;
	scrollLeft: number;
	scrollTop: number;
	scrollWidth: number;
	scrollHeight: number;
	clientWidth: number;
	clientHeight: number;
};

/** How far a finger moves before the drag's direction is trusted. Under the distance at which iOS starts to scroll. */
export const DRAG_SLOP = 8;
/** A drag counts along an axis once that part is at least half the other, so a diagonal start is judged on both. */
const AXIS_SHARE = 0.5;

export type DragVerdict = 'pending' | 'scrolls' | 'pans';

const SCROLLABLE = /^(auto|scroll|overlay)$/;

function takesDrag(box: ScrollBox, vertical: boolean, towardsStart: boolean): boolean {
	const overflow = vertical ? box.overflowY : box.overflowX;
	if (!SCROLLABLE.test(overflow)) return false;
	const offset = vertical ? box.scrollTop : box.scrollLeft;
	const visible = vertical ? box.clientHeight : box.clientWidth;
	const total = vertical ? box.scrollHeight : box.scrollWidth;
	return towardsStart ? offset > 0 : offset + visible < total - 1;
}

/** Whether a one-finger drag scrolls one of the boxes under the finger (innermost first) or would pan the page. */
export function dragVerdict(boxes: ScrollBox[], dx: number, dy: number): DragVerdict {
	if (Math.hypot(dx, dy) < DRAG_SLOP) return 'pending';
	const vertical = Math.abs(dy) >= Math.abs(dx) * AXIS_SHARE;
	const horizontal = Math.abs(dx) >= Math.abs(dy) * AXIS_SHARE;
	const scrolls = boxes.some(
		(box) =>
			(vertical && takesDrag(box, true, dy > 0)) || (horizontal && takesDrag(box, false, dx > 0))
	);
	return scrolls ? 'scrolls' : 'pans';
}

type Gesture = { startX: number; startY: number; path: Element[]; verdict: DragVerdict };

function scrollBox(element: Element): ScrollBox {
	const { overflowX, overflowY } = getComputedStyle(element);
	const { scrollLeft, scrollTop, scrollWidth, scrollHeight, clientWidth, clientHeight } = element;
	return {
		// A text field scrolls its text sideways whatever its computed overflow says.
		overflowX: element instanceof HTMLInputElement ? 'auto' : overflowX,
		overflowY,
		scrollLeft,
		scrollTop,
		scrollWidth,
		scrollHeight,
		clientWidth,
		clientHeight
	};
}

/** While `active()` is true, stops one-finger drags that nothing under the finger can scroll. Returns the detach function. */
export function attachPagePanGuard(active: () => boolean): () => void {
	let gesture: Gesture | null = null;

	function onStart(event: TouchEvent) {
		gesture = null;
		if (event.touches.length !== 1) return;
		const path = event.composedPath().filter((target) => target instanceof Element);
		if (path.some((element) => element.matches('input[type="range"]'))) return;
		const touch = event.touches[0];
		gesture = { startX: touch.clientX, startY: touch.clientY, path, verdict: 'pending' };
	}

	function onMove(event: TouchEvent) {
		const g = gesture;
		if (!g) return;
		if (event.touches.length !== 1) {
			gesture = null;
			return;
		}
		if (g.verdict === 'pending') {
			if (!active()) {
				gesture = null;
				return;
			}
			const touch = event.touches[0];
			g.verdict = dragVerdict(
				g.path.map(scrollBox),
				touch.clientX - g.startX,
				touch.clientY - g.startY
			);
		}
		if (g.verdict === 'pans' && event.cancelable) event.preventDefault();
	}

	function onEnd() {
		gesture = null;
	}

	document.addEventListener('touchstart', onStart, { passive: true });
	document.addEventListener('touchmove', onMove, { passive: false });
	document.addEventListener('touchend', onEnd, { passive: true });
	document.addEventListener('touchcancel', onEnd, { passive: true });
	return () => {
		document.removeEventListener('touchstart', onStart);
		document.removeEventListener('touchmove', onMove);
		document.removeEventListener('touchend', onEnd);
		document.removeEventListener('touchcancel', onEnd);
	};
}
