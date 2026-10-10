import { describe, expect, it } from 'vitest';
import { staleShellCaches } from './workerProtocol';

describe('staleShellCaches', () => {
	const keys = ['shell-1', 'zeta-prefs', 'shell-2', 'shell-3', 'shell-4'];

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
		const rolledBack = ['shell-30', 'shell-20', 'shell-10', 'shell-5'];
		expect(staleShellCaches(rolledBack, 'shell-5', 3)).toEqual(['shell-30']);
	});

	it('never returns the current cache or caches that are not shell caches', () => {
		const stale = staleShellCaches(keys, 'shell-4', 1);
		expect(stale).not.toContain('shell-4');
		expect(stale).not.toContain('zeta-prefs');
	});

	it('returns nothing when only the current cache exists', () => {
		expect(staleShellCaches(['zeta-prefs', 'shell-4'], 'shell-4', 1)).toEqual([]);
		expect(staleShellCaches(['shell-4'], 'shell-4', 3)).toEqual([]);
	});

	it('returns nothing when fewer older caches exist than are kept', () => {
		expect(staleShellCaches(['shell-3', 'shell-4'], 'shell-4', 2)).toEqual([]);
	});
});
