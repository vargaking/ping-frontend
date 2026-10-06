import { describe, expect, it } from 'vitest';
import { createDismissal } from './dismissal';

const DAY = 24 * 60 * 60 * 1000;

function memoryStorage(initial: Record<string, string> = {}) {
	const data = { ...initial };
	return {
		data,
		getItem: (key: string) => data[key] ?? null,
		setItem: (key: string, value: string) => {
			data[key] = value;
		}
	};
}

describe('createDismissal', () => {
	it('is not snoozed before any dismissal', () => {
		expect(createDismissal('k', memoryStorage()).isSnoozed(0)).toBe(false);
	});

	it('snoozes for a week after a dismissal', () => {
		const dismissal = createDismissal('k', memoryStorage());
		dismissal.dismiss(1000);
		expect(dismissal.isSnoozed(1000 + 7 * DAY - 1)).toBe(true);
		expect(dismissal.isSnoozed(1000 + 7 * DAY)).toBe(false);
	});

	it('stays snoozed after the third dismissal', () => {
		const dismissal = createDismissal('k', memoryStorage());
		dismissal.dismiss(0);
		dismissal.dismiss(10 * DAY);
		dismissal.dismiss(20 * DAY);
		expect(dismissal.isSnoozed(1000 * DAY)).toBe(true);
	});

	it('keeps each key separate', () => {
		const storage = memoryStorage();
		createDismissal('a', storage).dismiss(0);
		expect(createDismissal('b', storage).isSnoozed(1)).toBe(false);
	});

	it('writes the shape the push prompt already stored', () => {
		const storage = memoryStorage();
		createDismissal('notifications:pushPrompt', storage).dismiss(5);
		expect(JSON.parse(storage.data['notifications:pushPrompt'])).toEqual({
			dismissedAt: 5,
			count: 1
		});
	});

	it('ignores malformed stored values', () => {
		const dismissal = createDismissal('k', memoryStorage({ k: '{"count":"x"}' }));
		expect(dismissal.isSnoozed(0)).toBe(false);
		expect(createDismissal('k', memoryStorage({ k: 'nope' })).isSnoozed(0)).toBe(false);
	});

	it('survives storage that throws', () => {
		const broken = {
			getItem: () => {
				throw new Error('blocked');
			},
			setItem: () => {
				throw new Error('blocked');
			}
		};
		const dismissal = createDismissal('k', broken);
		expect(() => dismissal.dismiss(0)).not.toThrow();
		expect(dismissal.isSnoozed(0)).toBe(false);
	});
});
