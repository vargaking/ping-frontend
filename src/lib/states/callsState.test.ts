import { AxiosError } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Call } from '$lib/types/call.types';

const goto = vi.hoisted(() => vi.fn());

const requests = vi.hoisted(() => ({
	getActiveCalls: vi.fn(),
	startCall: vi.fn(),
	declineCall: vi.fn()
}));

vi.mock('$app/navigation', () => ({ goto }));
vi.mock('$lib/requests/calls/getActiveCalls', () => ({ getActiveCalls: requests.getActiveCalls }));
vi.mock('$lib/requests/calls/startCall', () => ({ startCall: requests.startCall }));
vi.mock('$lib/requests/calls/declineCall', () => ({ declineCall: requests.declineCall }));
vi.mock('$lib/requests/calls/refreshCall', () => ({
	refreshCall: vi.fn(),
	refreshCallOnUnload: vi.fn()
}));
vi.mock('$lib/requests/voice/refreshVoicePresence', () => ({
	refreshVoicePresence: vi.fn(),
	refreshVoicePresenceOnUnload: vi.fn()
}));
vi.mock('svelte-sonner', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn() }) }));

import { toast } from 'svelte-sonner';
import { callsState, describeStartError, isIncomingRing } from './callsState.svelte';
import { usersState } from './usersState.svelte';
import { voiceState } from './voiceState.svelte';

const ME = 1;
const NOW = new Date('2026-10-12T10:00:00Z').getTime();

function call(overrides: Partial<Call> = {}): Call {
	return {
		id: 10,
		conversation_id: 5,
		message_id: 'm-10',
		caller_id: 2,
		callee_id: ME,
		state: 'ringing',
		reason: null,
		created_at: new Date(NOW).toISOString(),
		ring_expires_at: new Date(NOW + 30_000).toISOString(),
		answered_at: null,
		ended_at: null,
		duration_s: null,
		...overrides
	};
}

function axiosError(status: number, headers: Record<string, string> = {}) {
	return new AxiosError('failed', undefined, undefined, undefined, {
		status,
		headers,
		data: {},
		statusText: '',
		config: {} as never
	});
}

beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(NOW);
	usersState.loggedInUser = { id: ME } as typeof usersState.loggedInUser;
	Object.values(requests).forEach((fn) => fn.mockReset());
	goto.mockReset();
	requests.getActiveCalls.mockResolvedValue([]);
	vi.mocked(toast.error).mockReset();
});

afterEach(() => {
	callsState.sync(null);
	callsState.reset();
	usersState.loggedInUser = null;
	vi.restoreAllMocks();
	vi.useRealTimers();
});

describe('applying frames', () => {
	it.each([
		{ order: ['ringing', 'active', 'ended'], final: 'ended' },
		{ order: ['ringing', 'active', 'ringing'], final: 'active' },
		{ order: ['ended', 'active', 'ringing'], final: 'ended' },
		{ order: ['missed', 'ended'], final: 'ended' },
		{ order: ['declined', 'ringing'], final: 'declined' }
	] as const)('$order ends as $final', ({ order, final }) => {
		for (const state of order) callsState.apply(call({ state }));
		expect(callsState.byConversation[5].state).toBe(final);
	});

	it('tells whether a frame was taken in', () => {
		expect(callsState.apply(call({ state: 'active' }))).toBe(true);
		expect(callsState.apply(call({ state: 'ringing' }))).toBe(false);
	});

	it('ignores a frame of an older call in the same conversation', () => {
		callsState.apply(call({ id: 11 }));
		expect(callsState.apply(call({ id: 10, state: 'ended' }))).toBe(false);
		expect(callsState.byConversation[5].id).toBe(11);
	});

	it('lets a newer call replace a finished one', () => {
		callsState.apply(call({ id: 10, state: 'ended' }));
		callsState.apply(call({ id: 11 }));
		expect(callsState.forConversation(5)?.id).toBe(11);
	});

	it('makes the user leave the room when their call ends', () => {
		const endCall = vi.spyOn(voiceState, 'endCall').mockResolvedValue();
		callsState.apply(call({ state: 'active' }));
		expect(endCall).not.toHaveBeenCalled();
		callsState.apply(call({ state: 'ended' }));
		expect(endCall).toHaveBeenCalledWith(10);
	});
});

describe('the incoming ring', () => {
	const at = (state: Call['state'], caller_id: number, offsetMs: number) =>
		isIncomingRing(call({ state, caller_id }), ME, NOW + offsetMs);

	it.each([
		{ state: 'ringing', caller: 2, offset: 0, shown: true },
		{ state: 'ringing', caller: 2, offset: 29_999, shown: true },
		{ state: 'ringing', caller: 2, offset: 30_000, shown: false },
		{ state: 'ringing', caller: ME, offset: 0, shown: false },
		{ state: 'active', caller: 2, offset: 0, shown: false },
		{ state: 'missed', caller: 2, offset: 0, shown: false }
	] as const)(
		'$state from user $caller after $offset ms: shown $shown',
		({ state, caller, offset, shown }) => {
			expect(at(state, caller, offset)).toBe(shown);
		}
	);

	it('goes away at the end of the ring without a frame', () => {
		callsState.apply(call());
		expect(callsState.incoming.map((c) => c.id)).toEqual([10]);

		vi.advanceTimersByTime(29_000);
		expect(callsState.incoming).toHaveLength(1);

		vi.advanceTimersByTime(2_000);
		expect(callsState.incoming).toHaveLength(0);
		expect(vi.getTimerCount()).toBe(0);
	});

	it('never lists a call the user started', () => {
		callsState.apply(call({ caller_id: ME, callee_id: 2 }));
		expect(callsState.incoming).toHaveLength(0);
	});
});

describe('loading the active calls', () => {
	beforeEach(async () => {
		callsState.sync(ME);
		await vi.advanceTimersByTimeAsync(0);
	});

	it('loads on sync and marks the list loaded', async () => {
		requests.getActiveCalls.mockResolvedValue([call({ conversation_id: 7, id: 12 })]);
		callsState.sync(null);
		callsState.sync(ME);
		await vi.advanceTimersByTimeAsync(0);

		expect(callsState.forConversation(7)?.id).toBe(12);
		expect(callsState.loaded).toBe(true);
	});

	it('drops an open call the server no longer lists', async () => {
		callsState.apply(call({ state: 'active' }));
		requests.getActiveCalls.mockResolvedValue([]);

		await callsState.load();

		expect(callsState.forConversation(5)).toBeNull();
		expect(callsState.isStale(10)).toBe(true);
		expect(callsState.apply(call({ state: 'active' }))).toBe(false);
	});

	it('leaves the room of a call that is no longer listed', async () => {
		const endCall = vi.spyOn(voiceState, 'endCall').mockResolvedValue();
		Object.assign(voiceState, { callId: 10, callConversationId: 5 });
		requests.getActiveCalls.mockResolvedValue([]);

		await callsState.load();

		expect(endCall).toHaveBeenCalledWith(10);
	});

	it('keeps a call that a frame described while the list was loading', async () => {
		let answer!: (calls: Call[]) => void;
		requests.getActiveCalls.mockReturnValue(new Promise((resolve) => (answer = resolve)));

		const loading = callsState.load();
		callsState.apply(call({ id: 20, conversation_id: 9 }));
		answer([]);
		await loading;

		expect(callsState.forConversation(9)?.id).toBe(20);
	});

	it('does not let an older list undo a newer frame', async () => {
		callsState.apply(call({ state: 'ended' }));
		requests.getActiveCalls.mockResolvedValue([call({ state: 'ringing' })]);

		await callsState.load();

		expect(callsState.byConversation[5].state).toBe('ended');
	});

	it('does not call a freshly announced row stale before its call_state arrives', () => {
		callsState.noteAnnounced(10);
		expect(callsState.isStale(10)).toBe(false);

		callsState.apply(call());
		expect(callsState.isStale(10)).toBe(false);
		callsState.apply(call({ state: 'ended' }));
		expect(callsState.isStale(10)).toBe(true);
	});

	it('settles an announced row that never got its call_state on the next load', async () => {
		callsState.noteAnnounced(10);

		await callsState.load();

		expect(callsState.isStale(10)).toBe(true);
	});

	it('keeps a row announced while a load was running until the next load', async () => {
		let answer!: (calls: Call[]) => void;
		requests.getActiveCalls.mockReturnValueOnce(new Promise((resolve) => (answer = resolve)));

		const loading = callsState.load();
		callsState.noteAnnounced(10);
		answer([]);
		await loading;

		expect(callsState.isStale(10)).toBe(false);
	});

	it('ignores an announcement for a call already known to be over', () => {
		callsState.apply(call({ state: 'ended' }));
		callsState.noteAnnounced(10);
		expect(callsState.isStale(10)).toBe(true);
	});

	it('does not let an older overlapping load drop a call created while it ran', async () => {
		const answers: ((calls: Call[]) => void)[] = [];
		requests.getActiveCalls.mockImplementation(
			() => new Promise((resolve) => answers.push(resolve))
		);

		const older = callsState.load();
		callsState.apply(call({ id: 20, conversation_id: 9, caller_id: ME, callee_id: 2 }));
		const newer = callsState.load();
		answers[0]([]);
		await older;

		expect(callsState.forConversation(9)?.id).toBe(20);
		answers[1]([call({ id: 20, conversation_id: 9, caller_id: ME, callee_id: 2 })]);
		await newer;

		expect(callsState.forConversation(9)?.id).toBe(20);
		expect(callsState.apply(call({ id: 20, conversation_id: 9, state: 'active' }))).toBe(true);
	});

	it('is not stale before the list has loaded', () => {
		callsState.reset();
		expect(callsState.isStale(10)).toBe(false);
	});

	it('forgets the previous user when the user changes', async () => {
		callsState.apply(call());
		requests.getActiveCalls.mockResolvedValue([]);

		callsState.sync(3);
		await vi.advanceTimersByTimeAsync(0);

		expect(callsState.open).toHaveLength(0);
		expect(callsState.apply(call({ state: 'ringing' }))).toBe(true);
	});

	it('ignores a list that arrives after logout', async () => {
		let answer!: (calls: Call[]) => void;
		requests.getActiveCalls.mockReturnValue(new Promise((resolve) => (answer = resolve)));

		const loading = callsState.load();
		callsState.sync(null);
		answer([call()]);
		await loading;

		expect(callsState.open).toHaveLength(0);
		expect(callsState.loaded).toBe(false);
	});
});

describe('start and decline', () => {
	beforeEach(async () => {
		callsState.sync(ME);
		await vi.advanceTimersByTimeAsync(0);
	});

	it('joins the room of the call the server returns', async () => {
		const returned = call({ caller_id: ME, callee_id: 2 });
		requests.startCall.mockResolvedValue(returned);
		const joinCall = vi.spyOn(voiceState, 'joinCall').mockResolvedValue();

		await callsState.start(5);

		expect(requests.startCall).toHaveBeenCalledWith(5);
		expect(joinCall).toHaveBeenCalledWith(returned);
		expect(callsState.forConversation(5)).toEqual(returned);
		expect(callsState.starting).toBeNull();
	});

	it('starts one call at a time', async () => {
		requests.startCall.mockReturnValue(new Promise(() => {}));
		void callsState.start(5);
		await callsState.start(6);
		expect(requests.startCall).toHaveBeenCalledOnce();
	});

	it('says why a call could not be started and stays out of the room', async () => {
		requests.startCall.mockRejectedValue(axiosError(503));
		const joinCall = vi.spyOn(voiceState, 'joinCall').mockResolvedValue();

		await callsState.start(5);

		expect(toast.error).toHaveBeenCalledWith("Voice isn't set up on this server.");
		expect(joinCall).not.toHaveBeenCalled();
		expect(callsState.starting).toBeNull();
	});

	it('takes in the call a decline returns', async () => {
		callsState.apply(call());
		requests.declineCall.mockResolvedValue(call({ state: 'declined', reason: 'declined' }));

		await callsState.decline(10);

		expect(callsState.forConversation(5)).toBeNull();
		expect(callsState.byConversation[5].state).toBe('declined');
	});
});

describe('the incoming call', () => {
	it('is the newest of several ringing calls', () => {
		callsState.apply(call({ id: 10, conversation_id: 5 }));
		callsState.apply(call({ id: 12, conversation_id: 7 }));
		callsState.apply(call({ id: 11, conversation_id: 6 }));
		expect(callsState.incomingCall?.id).toBe(12);
	});

	it('is none once the newest is answered elsewhere', () => {
		callsState.apply(call());
		callsState.apply(call({ state: 'active' }));
		expect(callsState.incomingCall).toBeNull();
	});
});

describe('accepting and declining from the banner', () => {
	it('joins the room and opens the call view', async () => {
		const ringing = call();
		callsState.apply(ringing);
		const joinCall = vi.spyOn(voiceState, 'joinCall').mockResolvedValue();

		await callsState.accept(ringing);

		expect(joinCall).toHaveBeenCalledWith(ringing);
		expect(goto).toHaveBeenCalledWith('/app/direct/5/call/');
		expect(callsState.accepting).toBeNull();
	});

	it('answers once while the join is in progress', async () => {
		const ringing = call();
		let connected!: () => void;
		const joinCall = vi
			.spyOn(voiceState, 'joinCall')
			.mockReturnValue(new Promise((resolve) => (connected = resolve)));

		const first = callsState.accept(ringing);
		expect(callsState.accepting).toBe(10);
		await callsState.accept(ringing);
		connected();
		await first;

		expect(joinCall).toHaveBeenCalledOnce();
		expect(goto).toHaveBeenCalledOnce();
	});

	it('declines through the server and drops the banner', async () => {
		callsState.apply(call());
		requests.declineCall.mockResolvedValue(call({ state: 'declined', reason: 'declined' }));
		const joinCall = vi.spyOn(voiceState, 'joinCall').mockResolvedValue();

		await callsState.decline(10);

		expect(requests.declineCall).toHaveBeenCalledWith(10);
		expect(callsState.incomingCall).toBeNull();
		expect(joinCall).not.toHaveBeenCalled();
		expect(goto).not.toHaveBeenCalled();
	});

	it('keeps the banner and says so when the decline fails', async () => {
		callsState.apply(call());
		requests.declineCall.mockRejectedValue(axiosError(500));

		await callsState.decline(10);

		expect(toast.error).toHaveBeenCalled();
		expect(callsState.incomingCall?.id).toBe(10);
	});
});

describe('describeStartError', () => {
	it.each<{ status: number; headers: Record<string, string>; text: string }>([
		{ status: 503, headers: {}, text: "Voice isn't set up on this server." },
		{ status: 404, headers: {}, text: "This conversation isn't available." },
		{ status: 429, headers: {}, text: "You've called a lot. Try again later." },
		{
			status: 429,
			headers: { 'retry-after': '45' },
			text: "You've called a lot without an answer. Try again in 45s."
		},
		{
			status: 429,
			headers: { 'retry-after': '420' },
			text: "You've called a lot without an answer. Try again in 7 min."
		}
	])('turns $status $headers into "$text"', ({ status, headers, text }) => {
		expect(describeStartError(axiosError(status, headers))).toBe(text);
	});
});
