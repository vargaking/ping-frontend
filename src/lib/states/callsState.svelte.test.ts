import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync } from 'svelte';
import type { Call } from '$lib/types/call.types';

const getActiveCalls = vi.hoisted(() => vi.fn());

vi.mock('$lib/requests/calls/getActiveCalls', () => ({ getActiveCalls }));
vi.mock('$lib/requests/voice/refreshVoicePresence', () => ({
	refreshVoicePresence: vi.fn(),
	refreshVoicePresenceOnUnload: vi.fn()
}));

import { callsState } from './callsState.svelte';
import { resyncState } from './resyncState.svelte';
import { usersState } from './usersState.svelte';

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

const ringing: Call = {
	id: 10,
	conversation_id: 5,
	message_id: 'm-10',
	caller_id: 2,
	callee_id: 1,
	state: 'active',
	reason: null,
	created_at: '2026-10-12T10:00:00Z',
	ring_expires_at: '2026-10-12T10:00:30Z',
	answered_at: '2026-10-12T10:00:05Z',
	ended_at: null,
	duration_s: null
};

let stop: () => void;

beforeEach(() => {
	getActiveCalls.mockReset();
	getActiveCalls.mockResolvedValue([ringing]);
	resyncState.generation = 0;
	usersState.loggedInUser = null;
	stop = callsState.follow();
	flushSync();
});

afterEach(() => {
	stop();
	callsState.sync(null);
	callsState.reset();
	usersState.loggedInUser = null;
});

describe('the call host', () => {
	it('loads nothing before anyone is signed in', async () => {
		await settle();
		expect(getActiveCalls).not.toHaveBeenCalled();
	});

	it('loads when a user signs in, and again after each resync', async () => {
		usersState.loggedInUser = { id: 1 } as typeof usersState.loggedInUser;
		flushSync();
		await settle();
		expect(getActiveCalls).toHaveBeenCalledTimes(1);
		expect(callsState.forConversation(5)?.id).toBe(10);

		resyncState.generation++;
		flushSync();
		await settle();
		expect(getActiveCalls).toHaveBeenCalledTimes(2);
	});

	it('clears the calls on logout', async () => {
		usersState.loggedInUser = { id: 1 } as typeof usersState.loggedInUser;
		flushSync();
		await settle();

		usersState.loggedInUser = null;
		flushSync();

		expect(callsState.open).toHaveLength(0);
		expect(callsState.loaded).toBe(false);
	});

	it('starts from nothing when another user signs in', async () => {
		usersState.loggedInUser = { id: 1 } as typeof usersState.loggedInUser;
		flushSync();
		await settle();
		getActiveCalls.mockResolvedValue([]);

		usersState.loggedInUser = { id: 2 } as typeof usersState.loggedInUser;
		flushSync();
		expect(callsState.open).toHaveLength(0);
		await settle();

		expect(getActiveCalls).toHaveBeenCalledTimes(2);
		expect(callsState.open).toHaveLength(0);
	});
});
