import { describe, expect, it } from 'vitest';
import {
	EDGE_GUARD,
	inEdgeZone,
	lockDirection,
	paneOffset,
	settlesOpen,
	velocity
} from './navSwipe';

describe('inEdgeZone', () => {
	it('keeps the screen edges for the system', () => {
		expect(inEdgeZone(5, 390)).toBe(true);
		expect(inEdgeZone(EDGE_GUARD - 1, 390)).toBe(true);
		expect(inEdgeZone(390 - EDGE_GUARD + 1, 390)).toBe(true);
		expect(inEdgeZone(385, 390)).toBe(true);
	});

	it('allows everything in between', () => {
		expect(inEdgeZone(EDGE_GUARD, 390)).toBe(false);
		expect(inEdgeZone(200, 390)).toBe(false);
		expect(inEdgeZone(390 - EDGE_GUARD, 390)).toBe(false);
	});
});

describe('lockDirection', () => {
	it('waits until the finger has moved a little', () => {
		expect(lockDirection(6, 1, false)).toBe('pending');
		expect(lockDirection(0, 0, true)).toBe('pending');
	});

	it('locks a mostly horizontal drag towards the other pane', () => {
		expect(lockDirection(12, 3, false)).toBe('swipe');
		expect(lockDirection(-12, 3, true)).toBe('swipe');
	});

	it('leaves vertical and diagonal drags alone', () => {
		expect(lockDirection(2, 14, false)).toBe('ignore');
		expect(lockDirection(10, 8, false)).toBe('ignore');
		expect(lockDirection(12, 8, false)).toBe('ignore');
		expect(lockDirection(15, 10, false)).toBe('ignore');
	});

	it('needs the horizontal part to beat the vertical one by half again', () => {
		expect(lockDirection(15, 9, false)).toBe('swipe');
		expect(lockDirection(15, 10, false)).toBe('ignore');
	});

	it('ignores a drag the wrong way for the current pane', () => {
		expect(lockDirection(-14, 1, false)).toBe('ignore');
		expect(lockDirection(14, 1, true)).toBe('ignore');
	});
});

describe('paneOffset', () => {
	it('follows the finger from closed', () => {
		expect(paneOffset(false, 0, 390)).toBe(-390);
		expect(paneOffset(false, 100, 390)).toBe(-290);
	});

	it('follows the finger from open', () => {
		expect(paneOffset(true, 0, 390)).toBe(0);
		expect(paneOffset(true, -100, 390)).toBe(-100);
	});

	it('stays inside the screen', () => {
		expect(paneOffset(false, 600, 390)).toBe(0);
		expect(paneOffset(false, -50, 390)).toBe(-390);
		expect(paneOffset(true, 80, 390)).toBe(0);
		expect(paneOffset(true, -600, 390)).toBe(-390);
	});
});

describe('velocity', () => {
	it('is zero without movement', () => {
		expect(velocity([])).toBe(0);
		expect(velocity([{ x: 100, t: 0 }])).toBe(0);
	});

	it('measures the last stretch only', () => {
		const samples = [
			{ x: 0, t: 0 },
			{ x: 10, t: 300 },
			{ x: 20, t: 400 },
			{ x: 60, t: 440 }
		];
		expect(velocity(samples)).toBeCloseTo(1);
	});

	it('is negative when moving left', () => {
		expect(
			velocity([
				{ x: 200, t: 0 },
				{ x: 180, t: 50 }
			])
		).toBeCloseTo(-0.4);
	});
});

describe('settlesOpen', () => {
	it('opens past 40% of the width', () => {
		expect(settlesOpen(false, 160, 390, 0)).toBe(true);
		expect(settlesOpen(false, 150, 390, 0)).toBe(false);
	});

	it('closes past 40% of the width', () => {
		expect(settlesOpen(true, -160, 390, 0)).toBe(false);
		expect(settlesOpen(true, -150, 390, 0)).toBe(true);
	});

	it('opens on a quick flick even over a short distance', () => {
		expect(settlesOpen(false, 40, 390, 0.6)).toBe(true);
		expect(settlesOpen(false, 40, 390, 0.3)).toBe(false);
	});

	it('closes on a quick flick left', () => {
		expect(settlesOpen(true, -40, 390, -0.6)).toBe(false);
		expect(settlesOpen(true, -40, 390, -0.3)).toBe(true);
	});

	it('stays put when the finger comes back or flicks the other way', () => {
		expect(settlesOpen(false, 200, 390, -0.6)).toBe(true);
		expect(settlesOpen(false, 20, 390, -0.9)).toBe(false);
		expect(settlesOpen(true, -20, 390, 0.9)).toBe(true);
	});
});
