import { describe, expect, it } from 'vitest';
import { lockDirection } from './navSwipe';
import {
	MAX_OFFSET,
	REPLY_THRESHOLD,
	iconProgress,
	reachesThreshold,
	rowOffset
} from './replySwipe';

describe('rowOffset', () => {
	it('follows the finger to the left', () => {
		expect(rowOffset(0)).toBe(-0);
		expect(rowOffset(-30)).toBe(-30);
	});

	it('stops at the maximum', () => {
		expect(rowOffset(-MAX_OFFSET)).toBe(-MAX_OFFSET);
		expect(rowOffset(-200)).toBe(-MAX_OFFSET);
		expect(MAX_OFFSET).toBe(64);
	});

	it('does not follow a drag back past where it started', () => {
		expect(rowOffset(25)).toBe(-0);
	});
});

describe('reachesThreshold', () => {
	it('is reached at 56 px and not before', () => {
		expect(REPLY_THRESHOLD).toBe(56);
		expect(reachesThreshold(-55.9)).toBe(false);
		expect(reachesThreshold(-56)).toBe(true);
		expect(reachesThreshold(-300)).toBe(true);
	});

	it('is not reached by a drag to the right', () => {
		expect(reachesThreshold(80)).toBe(false);
	});
});

describe('iconProgress', () => {
	it('fades in up to the threshold', () => {
		expect(iconProgress(0)).toBe(0);
		expect(iconProgress(-28)).toBeCloseTo(0.5);
		expect(iconProgress(-REPLY_THRESHOLD)).toBe(1);
		expect(iconProgress(-MAX_OFFSET)).toBe(1);
		expect(iconProgress(40)).toBe(0);
	});
});

describe('direction lock', () => {
	it('is the navigation lock, wanting a leftward drag', () => {
		expect(lockDirection(-4, 1, 'left')).toBe('pending');
		expect(lockDirection(-12, 3, 'left')).toBe('swipe');
		expect(lockDirection(-3, 14, 'left')).toBe('ignore');
		expect(lockDirection(12, 3, 'left')).toBe('ignore');
	});
});
