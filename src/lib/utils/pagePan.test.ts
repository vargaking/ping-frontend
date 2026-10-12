import { describe, expect, it } from 'vitest';
import { dragVerdict, DRAG_SLOP, type ScrollBox } from './pagePan';

function box(overrides: Partial<ScrollBox> = {}): ScrollBox {
	return {
		overflowX: 'visible',
		overflowY: 'auto',
		scrollLeft: 0,
		scrollTop: 100,
		scrollWidth: 300,
		scrollHeight: 1000,
		clientWidth: 300,
		clientHeight: 400,
		...overrides
	};
}

function sideways(overrides: Partial<ScrollBox>): ScrollBox {
	return box({
		overflowX: 'auto',
		overflowY: 'visible',
		scrollLeft: 100,
		scrollWidth: 1000,
		clientWidth: 300,
		...overrides
	});
}

const atTop = { scrollTop: 0 };
const atBottom = { scrollTop: 600 };

describe('dragVerdict', () => {
	it.each([
		[0, 0],
		[DRAG_SLOP - 1, 0],
		[0, -(DRAG_SLOP - 1)],
		[2, 2]
	])('waits while the finger has barely moved (%i, %i)', (dx, dy) => {
		expect(dragVerdict([], dx, dy)).toBe('pending');
	});

	it.each([
		['with room both ways, finger down', {}, 0, 20, 'scrolls'],
		['with room both ways, finger up', {}, 0, -20, 'scrolls'],
		['at the top, finger down', atTop, 0, 20, 'pans'],
		['at the top, finger up', atTop, 0, -20, 'scrolls'],
		['at the bottom, finger down', atBottom, 0, 20, 'scrolls'],
		['at the bottom, finger up', atBottom, 0, -20, 'pans'],
		['one pixel short of the bottom', { scrollTop: 599 }, 0, -20, 'pans'],
		['two pixels short of the bottom', { scrollTop: 598 }, 0, -20, 'scrolls'],
		['without overflow', { scrollHeight: 400, scrollTop: 0 }, 0, 20, 'pans'],
		['without overflow, finger up', { scrollHeight: 400, scrollTop: 0 }, 0, -20, 'pans'],
		['with overflow hidden', { overflowY: 'hidden' }, 0, 20, 'pans'],
		['with overflow visible', { overflowY: 'visible' }, 0, -20, 'pans'],
		['with overflow scroll', { overflowY: 'scroll' }, 0, 20, 'scrolls'],
		['with overflow overlay', { overflowY: 'overlay' }, 0, 20, 'scrolls']
	] as const)('a list %s', (_name, overrides, dx, dy, expected) => {
		expect(dragVerdict([box(overrides)], dx, dy)).toBe(expected);
	});

	it.each([
		['a vertical-only list pans', box(), 20, 0, 'pans'],
		['a horizontal scroller with room scrolls', sideways({}), 20, 0, 'scrolls'],
		[
			'a horizontal scroller at its start pans to the right',
			sideways({ scrollLeft: 0 }),
			20,
			0,
			'pans'
		],
		[
			'a horizontal scroller at its start scrolls to the left',
			sideways({ scrollLeft: 0 }),
			-20,
			0,
			'scrolls'
		],
		[
			'a horizontal scroller at its end pans to the left',
			sideways({ scrollLeft: 700 }),
			-20,
			0,
			'pans'
		],
		['a horizontal scroller ignores a vertical drag', sideways({}), 0, 20, 'pans'],
		['a mostly vertical drag goes to the vertical list', box(), 5, 20, 'scrolls'],
		['a mostly horizontal drag skips the vertical list', box(), 20, 5, 'pans'],
		['a diagonal drag still goes to the vertical list', box(), 8, 6, 'scrolls'],
		['a diagonal drag still goes to the horizontal scroller', sideways({}), 6, 8, 'scrolls'],
		['a diagonal drag pans when neither way has room', box(atTop), 8, 6, 'pans']
	])('%s', (_name, scroller, dx, dy, expected) => {
		expect(dragVerdict([scroller], dx, dy)).toBe(expected);
	});

	it('lets an outer scroller take the drag behind one that cannot', () => {
		const stuck = box({ scrollHeight: 400, scrollTop: 0 });
		expect(dragVerdict([stuck, box()], 0, 20)).toBe('scrolls');
		expect(dragVerdict([stuck, box(atTop)], 0, 20)).toBe('pans');
	});

	it('pans when nothing is under the finger', () => {
		expect(dragVerdict([], 0, 20)).toBe('pans');
	});
});
