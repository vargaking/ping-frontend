import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LONG_PRESS_MS, LongPress } from './longPress';

function setup() {
	const held = vi.fn();
	const holding: boolean[] = [];
	const press = new LongPress(held, (h) => holding.push(h));
	return { press, held, holding };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('LongPress', () => {
	it('fires at the press point after the hold time', () => {
		const { press, held, holding } = setup();
		press.start({ x: 10, y: 20 });
		expect(holding).toEqual([true]);

		vi.advanceTimersByTime(LONG_PRESS_MS - 1);
		expect(held).not.toHaveBeenCalled();
		vi.advanceTimersByTime(1);
		expect(held).toHaveBeenCalledWith({ x: 10, y: 20 });
		expect(holding).toEqual([true]);
	});

	it('opens well before the 700 ms the menu primitive waits', () => {
		expect(LONG_PRESS_MS).toBeGreaterThanOrEqual(350);
		expect(LONG_PRESS_MS).toBeLessThanOrEqual(400);
	});

	it('tolerates a small wobble', () => {
		const { press, held } = setup();
		press.start({ x: 0, y: 0 });
		press.move({ x: 6, y: 7 });
		vi.advanceTimersByTime(LONG_PRESS_MS);
		expect(held).toHaveBeenCalledOnce();
	});

	it('gives up once the finger moves more than 10 px', () => {
		const { press, held, holding } = setup();
		press.start({ x: 0, y: 0 });
		press.move({ x: 0, y: 11 });
		vi.advanceTimersByTime(LONG_PRESS_MS);
		expect(held).not.toHaveBeenCalled();
		expect(holding).toEqual([true, false]);
	});

	it('gives up when the finger lifts early', () => {
		const { press, held, holding } = setup();
		press.start({ x: 0, y: 0 });
		vi.advanceTimersByTime(100);
		press.cancel();
		vi.advanceTimersByTime(LONG_PRESS_MS);
		expect(held).not.toHaveBeenCalled();
		expect(holding).toEqual([true, false]);
	});

	it('leaves the pressed state alone when the finger lifts after the hold fired', () => {
		const { press, holding } = setup();
		press.start({ x: 0, y: 0 });
		vi.advanceTimersByTime(LONG_PRESS_MS);
		press.cancel();
		press.move({ x: 50, y: 50 });
		expect(holding).toEqual([true]);
	});
});
