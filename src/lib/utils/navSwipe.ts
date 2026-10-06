import { phoneState } from '$lib/states/phoneState.svelte';

/** A gesture never starts this close to a screen edge: iOS keeps the edge swipe for history. */
export const EDGE_GUARD = 24;
const LOCK_DISTANCE = 10;
const HORIZONTAL_RATIO = 1.5;
const OPEN_FRACTION = 0.4;
/** px per ms */
const FLICK_SPEED = 0.4;
const VELOCITY_WINDOW_MS = 100;
/** Matches the pane's own transition. */
const SETTLE_MS = 200;

export type Lock = 'pending' | 'swipe' | 'ignore';
export type Sample = { x: number; t: number };

export function inEdgeZone(x: number, width: number): boolean {
	return x < EDGE_GUARD || x > width - EDGE_GUARD;
}

/** Decided within the first few pixels: only a mostly horizontal drag towards the other pane is a swipe. */
export function lockDirection(dx: number, dy: number, navOpen: boolean): Lock {
	if (Math.hypot(dx, dy) < LOCK_DISTANCE) return 'pending';
	const horizontal = Math.abs(dx) > HORIZONTAL_RATIO * Math.abs(dy);
	const towardsOtherPane = navOpen ? dx < 0 : dx > 0;
	return horizontal && towardsOtherPane ? 'swipe' : 'ignore';
}

/** Where the pane sits while dragging: 0 is open, -width is closed. */
export function paneOffset(startOpen: boolean, dx: number, width: number): number {
	const from = startOpen ? 0 : -width;
	return Math.min(0, Math.max(-width, from + dx));
}

/** px per ms over the last moments of the drag, positive towards the right. */
export function velocity(samples: Sample[]): number {
	const last = samples.at(-1);
	const first = last && samples.find((s) => last.t - s.t <= VELOCITY_WINDOW_MS);
	if (!last || !first || last.t === first.t) return 0;
	return (last.x - first.x) / (last.t - first.t);
}

/** Whether the navigation ends up open: it changes past 40% of the width or on a flick that way. */
export function settlesOpen(startOpen: boolean, dx: number, width: number, speed: number): boolean {
	const towards = startOpen ? -1 : 1;
	const changes = towards * dx > OPEN_FRACTION * width || towards * speed > FLICK_SPEED;
	return changes ? !startOpen : startOpen;
}

const OWN_TOUCH =
	'input, textarea, select, [contenteditable]:not([contenteditable="false"]), .ProseMirror, [role="slider"], aside[aria-label="Members"]';
const OPEN_LAYER =
	'[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"], [aria-modal="true"], [data-popover-content]';

function scrollsSideways(element: Element): boolean {
	const { overflowX } = getComputedStyle(element);
	return /auto|scroll|overlay/.test(overflowX) && element.scrollWidth - element.clientWidth > 1;
}

/** Touches that belong to something else: fields, sideways scrollers, open layers, a text selection. */
export function startsOnSomethingElse(target: EventTarget | null, root: Element): boolean {
	if (document.querySelector(OPEN_LAYER)) return true;
	if (!window.getSelection()?.isCollapsed) return true;
	if (!(target instanceof Element)) return true;
	if (target.closest(OWN_TOUCH)) return true;
	for (let el: Element | null = target; el && el !== root; el = el.parentElement) {
		if (scrollsSideways(el)) return true;
	}
	return false;
}

type Gesture = {
	startX: number;
	startY: number;
	startOpen: boolean;
	lock: Lock;
	samples: Sample[];
	dragging: boolean;
};

/** Phones only: dragging sideways on the page opens the navigation, and on the navigation closes it.
 *  Touch events rather than pointer events: pointer events are cancelled the moment the browser
 *  claims the touch to scroll, and `touch-action` stops applying at the message list's own scroller,
 *  while a non-passive `touchmove` can reliably stop that scroll once the drag is known to be a swipe. */
export function attachNavSwipe(root: HTMLElement): () => void {
	const pane = () => root.querySelector<HTMLElement>('[data-nav-pane]');
	let gesture: Gesture | null = null;
	let settleTimer: ReturnType<typeof setTimeout> | undefined;
	let suppressClickUntil = 0;
	const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

	function onStart(event: TouchEvent) {
		if (event.touches.length > 1) return cancel();
		const touch = event.touches[0];
		gesture = null;
		if (!phoneState.phone || !phoneState.touch) return;
		if (inEdgeZone(touch.clientX, window.innerWidth)) return;
		if (startsOnSomethingElse(event.target, root)) return;
		clearTimeout(settleTimer);
		gesture = {
			startX: touch.clientX,
			startY: touch.clientY,
			startOpen: phoneState.navOpen,
			lock: 'pending',
			samples: [{ x: touch.clientX, t: event.timeStamp }],
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
			g.lock = lockDirection(dx, touch.clientY - g.startY, g.startOpen);
			if (g.lock !== 'swipe') return;
			if (!reducedMotion()) beginDrag(g);
		}
		event.preventDefault();
		g.samples.push({ x: touch.clientX, t: event.timeStamp });
		if (g.dragging) {
			const element = pane();
			if (element)
				element.style.translate = `${paneOffset(g.startOpen, dx, element.offsetWidth)}px 0`;
		}
	}

	function onEnd(event: TouchEvent) {
		const g = gesture;
		gesture = null;
		if (!g || g.lock !== 'swipe') return;
		event.preventDefault();
		suppressClickUntil = event.timeStamp + 400;
		const dx = (event.changedTouches[0]?.clientX ?? g.startX) - g.startX;
		const width = pane()?.offsetWidth ?? window.innerWidth;
		finish(g, settlesOpen(g.startOpen, dx, width, velocity(g.samples)));
	}

	function cancel() {
		const g = gesture;
		gesture = null;
		if (g?.lock === 'swipe') finish(g, g.startOpen);
	}

	/** The page counts as covered from the first moment of a drag that opens the navigation. */
	function beginDrag(g: Gesture) {
		g.dragging = true;
		phoneState.navMoving = true;
		const element = pane();
		if (element) element.style.transition = 'none';
	}

	function finish(g: Gesture, open: boolean) {
		const element = pane();
		if (g.dragging && element) {
			element.style.transition = '';
			element.style.translate = open ? 'none' : '-100% 0';
			// The class that matches takes over once the state below has rendered.
			requestAnimationFrame(() => (element.style.translate = ''));
		}
		if (open) phoneState.openNav();
		else phoneState.closeNav();
		if (!g.dragging) return;
		// Until it has slid shut again the page stays covered, so nothing counts as read.
		if (open) phoneState.navMoving = false;
		else settleTimer = setTimeout(() => (phoneState.navMoving = false), SETTLE_MS);
	}

	function onClick(event: MouseEvent) {
		if (event.timeStamp > suppressClickUntil) return;
		event.preventDefault();
		event.stopPropagation();
	}

	root.addEventListener('touchstart', onStart, { passive: true });
	root.addEventListener('touchmove', onMove, { passive: false });
	root.addEventListener('touchend', onEnd, { passive: false });
	root.addEventListener('touchcancel', cancel);
	window.addEventListener('click', onClick, true);
	return () => {
		root.removeEventListener('touchstart', onStart);
		root.removeEventListener('touchmove', onMove);
		root.removeEventListener('touchend', onEnd);
		root.removeEventListener('touchcancel', cancel);
		window.removeEventListener('click', onClick, true);
		clearTimeout(settleTimer);
		phoneState.navMoving = false;
		const element = pane();
		if (element) {
			element.style.translate = '';
			element.style.transition = '';
		}
	};
}
