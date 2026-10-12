import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync } from 'svelte';
import type { Call } from '$lib/types/call.types';

const mocks = vi.hoisted(() => ({
	startRing: vi.fn(),
	stopRing: vi.fn(),
	goto: vi.fn()
}));

vi.mock('$app/navigation', () => ({ goto: mocks.goto }));
vi.mock('$lib/utils/notificationSound', () => ({ startRing: mocks.startRing }));
vi.mock('$lib/requests/calls/getActiveCalls', () => ({
	getActiveCalls: vi.fn().mockResolvedValue([])
}));
vi.mock('$lib/requests/voice/refreshVoicePresence', () => ({
	refreshVoicePresence: vi.fn(),
	refreshVoicePresenceOnUnload: vi.fn()
}));

import { documentFocusState } from '$lib/utils/documentFocus.svelte';
import { callsState } from './callsState.svelte';
import { notificationsState } from './notificationsState.svelte';
import { usersState } from './usersState.svelte';

const ME = 1;

function call(overrides: Partial<Call> = {}): Call {
	const now = Date.now();
	return {
		id: 10,
		conversation_id: 5,
		message_id: 'm-10',
		caller_id: 2,
		callee_id: ME,
		state: 'ringing',
		reason: null,
		created_at: new Date(now).toISOString(),
		ring_expires_at: new Date(now + 30_000).toISOString(),
		answered_at: null,
		ended_at: null,
		duration_s: null,
		...overrides
	};
}

class FakeNotification {
	static permission = 'granted';
	static instances: FakeNotification[] = [];
	onclick: (() => void) | null = null;
	close = vi.fn();
	constructor(
		public title: string,
		public options: { tag: string; body: string }
	) {
		FakeNotification.instances.push(this);
	}
}

type Shown = { tag: string; close: () => void };
const worker = {
	shown: [] as Shown[],
	showNotification: vi.fn(),
	getNotifications: vi.fn()
};

let stop: () => void;

function ringing(overrides: Partial<Call> = {}) {
	callsState.apply(call(overrides));
	flushSync();
}

beforeEach(() => {
	vi.useFakeTimers();
	mocks.startRing.mockReset().mockReturnValue(mocks.stopRing);
	mocks.stopRing.mockReset();
	mocks.goto.mockReset();
	FakeNotification.instances = [];
	worker.shown = [];
	worker.showNotification.mockReset().mockImplementation(async (_title, options) => {
		worker.shown.push({ tag: options.tag, close: vi.fn() });
	});
	worker.getNotifications.mockReset().mockImplementation(async () => worker.shown);
	vi.stubGlobal('Notification', FakeNotification);
	vi.stubGlobal('window', { Notification: FakeNotification, focus: vi.fn() });
	vi.stubGlobal('navigator', {
		serviceWorker: { getRegistration: async () => worker }
	});
	usersState.loggedInUser = { id: ME } as typeof usersState.loggedInUser;
	usersState.users = { 2: { id: 2, username: 'Ada' } as never };
	notificationsState.sound = true;
	notificationsState.desktop = true;
	documentFocusState.visible = true;
	stop = callsState.follow();
	flushSync();
});

afterEach(() => {
	stop();
	callsState.reset();
	usersState.loggedInUser = null;
	usersState.users = {};
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

describe('the ring', () => {
	it('starts when a call comes in, once, and stops when it is answered elsewhere', () => {
		ringing();
		ringing({ id: 11, conversation_id: 6 });
		expect(mocks.startRing).toHaveBeenCalledOnce();

		ringing({ state: 'active' });
		expect(mocks.stopRing).not.toHaveBeenCalled();
		ringing({ id: 11, conversation_id: 6, state: 'ended' });
		expect(mocks.stopRing).toHaveBeenCalledOnce();
	});

	it.each([
		{ how: 'declined', next: { state: 'declined' } },
		{ how: 'missed', next: { state: 'missed' } },
		{ how: 'answered', next: { state: 'active' } }
	] as const)('stops when the call is $how', ({ next }) => {
		ringing();
		ringing(next);
		expect(mocks.stopRing).toHaveBeenCalledOnce();
	});

	it('stops by itself when the ring runs out', () => {
		ringing();
		vi.advanceTimersByTime(31_000);
		flushSync();
		expect(mocks.stopRing).toHaveBeenCalledOnce();
	});

	it('stops while the call is being accepted', () => {
		ringing();
		callsState.accepting = 10;
		flushSync();
		expect(mocks.stopRing).toHaveBeenCalledOnce();
	});

	it('stops when the host goes away', () => {
		ringing();
		stop();
		expect(mocks.stopRing).toHaveBeenCalledOnce();
	});

	it.each([
		{ why: 'the caller is me', overrides: { caller_id: ME, callee_id: 2 } },
		{ why: 'the ring has run out', overrides: { ring_expires_at: new Date(0).toISOString() } },
		{ why: 'it was answered already', overrides: { state: 'active' as const } }
	])('does not start when $why', ({ overrides }) => {
		ringing(overrides);
		expect(mocks.startRing).not.toHaveBeenCalled();
	});

	it('does not start with the sound turned off', () => {
		notificationsState.sound = false;
		ringing();
		expect(mocks.startRing).not.toHaveBeenCalled();
	});
});

describe('the desktop notification', () => {
	beforeEach(() => {
		documentFocusState.visible = false;
		flushSync();
	});

	it('is shown for a hidden tab, with the same tag as the push', async () => {
		ringing();
		await vi.advanceTimersByTimeAsync(0);

		expect(worker.showNotification).toHaveBeenCalledOnce();
		const [title, options] = worker.showNotification.mock.calls[0];
		expect(title).toBe('Ada');
		expect(options).toMatchObject({
			tag: 'call-10',
			body: 'Incoming call',
			data: { url: '/app/direct/5/', messageUuid: 'm-10' }
		});
	});

	it('is not doubled when the push already put one up', async () => {
		worker.shown = [{ tag: 'call-10', close: vi.fn() }];
		ringing();
		await vi.advanceTimersByTimeAsync(0);

		expect(worker.showNotification).not.toHaveBeenCalled();
	});

	it('is closed when the call stops ringing', async () => {
		const close = vi.fn();
		worker.getNotifications.mockImplementation(async () => [{ tag: 'call-10', close }]);
		ringing();
		await vi.advanceTimersByTimeAsync(0);

		ringing({ state: 'active' });
		await vi.advanceTimersByTimeAsync(0);

		expect(close).toHaveBeenCalledOnce();
	});

	it('is closed when the tab comes back to the front', async () => {
		const close = vi.fn();
		worker.getNotifications.mockImplementation(async () => [{ tag: 'call-10', close }]);
		ringing();
		await vi.advanceTimersByTimeAsync(0);

		documentFocusState.visible = true;
		flushSync();
		await vi.advanceTimersByTimeAsync(0);

		expect(close).toHaveBeenCalledOnce();
	});

	it.each([
		{ why: 'the tab is visible', set: () => (documentFocusState.visible = true) },
		{ why: 'desktop notifications are off', set: () => (notificationsState.desktop = false) },
		{ why: 'permission is denied', set: () => (FakeNotification.permission = 'denied') }
	])('is not shown when $why', async ({ set }) => {
		set();
		flushSync();
		ringing();
		await vi.advanceTimersByTimeAsync(0);
		FakeNotification.permission = 'granted';

		expect(worker.showNotification).not.toHaveBeenCalled();
		expect(FakeNotification.instances).toHaveLength(0);
	});

	it('is not shown for a call I started', async () => {
		ringing({ caller_id: ME, callee_id: 2 });
		await vi.advanceTimersByTimeAsync(0);
		expect(worker.showNotification).not.toHaveBeenCalled();
	});

	describe('without a service worker', () => {
		beforeEach(() => {
			vi.stubGlobal('navigator', { serviceWorker: { getRegistration: async () => undefined } });
		});

		it('opens the DM when clicked, and closes when the call is answered', async () => {
			ringing();
			await vi.advanceTimersByTimeAsync(0);
			const [notification] = FakeNotification.instances;
			expect(notification.options.tag).toBe('call-10');

			notification.onclick?.();
			expect(mocks.goto).toHaveBeenCalledWith('/app/direct/5/');

			ringing({ state: 'active' });
			await vi.advanceTimersByTimeAsync(0);
			expect(notification.close).toHaveBeenCalled();
		});
	});
});
