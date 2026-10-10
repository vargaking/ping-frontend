import { describe, expect, it } from 'vitest';
import { staleShellCaches, type ShellCache } from './workerProtocol';

const ran = (...keys: string[]): ShellCache[] => keys.map((key) => ({ key, activated: true }));

describe('staleShellCaches', () => {
	const keys = [
		...ran('shell-1'),
		{ key: 'zeta-prefs', activated: true },
		...ran('shell-2', 'shell-3', 'shell-4')
	];

	it('drops every older shell cache when one window is open', () => {
		expect(staleShellCaches(keys, 'shell-4', 1)).toEqual(['shell-1', 'shell-2', 'shell-3']);
	});

	it('drops every older shell cache when no window is open', () => {
		expect(staleShellCaches(keys, 'shell-4', 0)).toEqual(['shell-1', 'shell-2', 'shell-3']);
	});

	it('keeps the two newest older shell caches while other windows are open', () => {
		expect(staleShellCaches(keys, 'shell-4', 2)).toEqual(['shell-1']);
	});

	it('orders by creation, not by name', () => {
		const rolledBack = ran('shell-30', 'shell-20', 'shell-10', 'shell-5');
		expect(staleShellCaches(rolledBack, 'shell-5', 3)).toEqual(['shell-30']);
	});

	it('never returns the current cache or caches that are not shell caches', () => {
		const stale = staleShellCaches(keys, 'shell-4', 1);
		expect(stale).not.toContain('shell-4');
		expect(stale).not.toContain('zeta-prefs');
	});

	it('returns nothing when only the current cache exists', () => {
		expect(
			staleShellCaches([{ key: 'zeta-prefs', activated: true }, ...ran('shell-4')], 'shell-4', 1)
		).toEqual([]);
		expect(staleShellCaches(ran('shell-4'), 'shell-4', 3)).toEqual([]);
	});

	it('returns nothing when fewer older caches exist than are kept', () => {
		expect(staleShellCaches(ran('shell-3', 'shell-4'), 'shell-4', 2)).toEqual([]);
	});

	describe('caches whose worker never activated', () => {
		const A = 'shell-A';
		const B = 'shell-B';
		const C = 'shell-C';
		const D = 'shell-D';

		it('does not count them against the caches kept for other windows', () => {
			const caches = [
				{ key: A, activated: true },
				{ key: B, activated: false },
				{ key: C, activated: false },
				{ key: D, activated: true }
			];
			expect(staleShellCaches(caches, D, 2)).toEqual([B, C]);
		});

		it('drops them even when other windows are open and nothing else is old', () => {
			const caches = [
				{ key: B, activated: false },
				{ key: D, activated: true }
			];
			expect(staleShellCaches(caches, D, 5)).toEqual([B]);
		});

		it('still keeps only the two newest of the caches that ran', () => {
			const caches = [
				{ key: 'shell-1', activated: true },
				{ key: 'shell-2', activated: true },
				{ key: B, activated: false },
				{ key: 'shell-3', activated: true },
				{ key: 'shell-4', activated: true },
				{ key: D, activated: true }
			];
			expect(staleShellCaches(caches, D, 2)).toEqual(['shell-1', 'shell-2', B]);
		});

		it('leaves a newer cache alone: its worker may still be installing or waiting', () => {
			const caches = [
				{ key: A, activated: true },
				{ key: B, activated: true },
				{ key: C, activated: false }
			];
			expect(staleShellCaches(caches, B, 1)).toEqual([A]);
		});
	});
});
