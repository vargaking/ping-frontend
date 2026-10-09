import { phoneState } from '$lib/states/phoneState.svelte';
import { HOLD_CANCEL_EVENT } from './longPress';
import { inEdgeZone, lockDirection, startsOnSomethingElse, type Lock } from './navSwipe';

/** The row never follows the finger further than this. */
export const MAX_OFFSET = 64;
/** Letting go from here on starts the reply. */
export const REPLY_THRESHOLD = 56;
const CLICK_SUPPRESS_MS = 400;

/** How far the finger has moved to the left, never negative. */
function leftwards(dx: number): number {
	return Math.max(0, -dx);
}

/** Where the row sits while dragging, as a translation (zero or negative). */
export function rowOffset(dx: number): number {
	return -Math.min(MAX_OFFSET, leftwards(dx));
}

export function reachesThreshold(dx: number): boolean {
	return leftwards(dx) >= REPLY_THRESHOLD;
}

/** 0 to 1: how visible the reply icon is, full once the threshold is reached. */
export function iconProgress(dx: number): number {
	return Math.min(1, leftwards(dx) / REPLY_THRESHOLD);
}

/** Inline media controls scrub sideways on their own. */
const MEDIA_CONTROLS = 'video, audio';

type Gesture = {
	target: EventTarget | null;
	startX: number;
	startY: number;
	lock: Lock;
	armed: boolean;
	dragging: boolean;
};

/** Phones only: swiping a message row to the left starts a reply to it.
 *  Touch events, as in `attachNavSwipe`: passive start, and a non-passive move that only stops
 *  the browser's scrolling once the drag is known to be a horizontal swipe. It never takes a
 *  rightward drag, which the navigation swipe owns, so one drag never does both. */
export function attachReplySwipe(row: HTMLElement, onReply: () => void): () => void {
	let gesture: Gesture | null = null;
	let suppressClickUntil = 0;
	const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

	function blocked(target: EventTarget | null): boolean {
		return (
			startsOnSomethingElse(target, row) ||
			(target instanceof Element && target.closest(MEDIA_CONTROLS) !== null)
		);
	}

	function onStart(event: TouchEvent) {
		if (event.touches.length > 1) return cancel();
		const touch = event.touches[0];
		gesture = null;
		if (!phoneState.phone || !phoneState.touch || phoneState.navCoversContent) return;
		if (inEdgeZone(touch.clientX, window.innerWidth)) return;
		if (blocked(event.target)) return;
		gesture = {
			target: event.target,
			startX: touch.clientX,
			startY: touch.clientY,
			lock: 'pending',
			armed: false,
			dragging: false
		};
	}

	function onMove(event: TouchEvent) {
		const g = gesture;
		if (!g || g.lock === 'ignore') return;
		if (event.touches.length > 1) return cancel();
		const touch = event.touches[0];
		const dx = touch.clientX - g.startX;
		if (g.lock === 'pending') {
			g.lock = lockDirection(dx, touch.clientY - g.startY, 'left');
			// A hold that opened the menu or selected text mid-drag owns the touch.
			if (g.lock === 'swipe' && blocked(g.target)) g.lock = 'ignore';
			if (g.lock !== 'swipe') return;
			row.dispatchEvent(new CustomEvent(HOLD_CANCEL_EVENT));
			if (!reducedMotion()) {
				g.dragging = true;
				row.style.transition = 'none';
			}
		}
		event.preventDefault();
		const armed = reachesThreshold(dx);
		if (armed && !g.armed) navigator.vibrate?.(10);
		g.armed = armed;
		if (!g.dragging) return;
		row.style.translate = `${rowOffset(dx)}px 0`;
		row.style.setProperty('--swipe-distance', `${-rowOffset(dx)}px`);
		row.style.setProperty('--swipe-progress', String(iconProgress(dx)));
		row.toggleAttribute('data-armed', armed);
	}

	function onEnd(event: TouchEvent) {
		const g = gesture;
		gesture = null;
		if (!g || g.lock !== 'swipe') return;
		event.preventDefault();
		suppressClickUntil = event.timeStamp + CLICK_SUPPRESS_MS;
		const dx = (event.changedTouches[0]?.clientX ?? g.startX) - g.startX;
		if (g.dragging) reset();
		if (reachesThreshold(dx)) onReply();
	}

	function cancel() {
		const g = gesture;
		gesture = null;
		if (g?.dragging) reset();
	}

	/** The row's own transition slides it back. */
	function reset() {
		row.style.transition = '';
		row.style.translate = '';
		row.style.removeProperty('--swipe-distance');
		row.style.removeProperty('--swipe-progress');
		row.removeAttribute('data-armed');
	}

	function onClick(event: MouseEvent) {
		if (event.timeStamp > suppressClickUntil) return;
		event.preventDefault();
		event.stopPropagation();
	}

	row.addEventListener('touchstart', onStart, { passive: true });
	row.addEventListener('touchmove', onMove, { passive: false });
	row.addEventListener('touchend', onEnd, { passive: false });
	row.addEventListener('touchcancel', cancel);
	row.addEventListener('click', onClick, true);
	return () => {
		row.removeEventListener('touchstart', onStart);
		row.removeEventListener('touchmove', onMove);
		row.removeEventListener('touchend', onEnd);
		row.removeEventListener('touchcancel', cancel);
		row.removeEventListener('click', onClick, true);
		reset();
	};
}
