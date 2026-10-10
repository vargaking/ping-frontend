import { AxiosError, type AxiosAdapter } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
	const order: string[] = [];
	const step = (name: string) => vi.fn(() => void order.push(name));
	return {
		order,
		goto: vi.fn(),
		leaveVoice: vi.fn(),
		clearLocalCache: vi.fn(),
		historyStop: vi.fn(),
		disablePush: vi.fn(),
		logoutRequest: vi.fn(),
		step
	};
});

vi.mock('$app/navigation', () => ({ goto: mocks.goto }));
vi.mock('$lib/utils/db', () => ({ clearLocalCache: mocks.clearLocalCache }));
vi.mock('$lib/utils/push', () => ({ disablePush: mocks.disablePush }));
vi.mock('$lib/requests/auth/logout', () => ({ logout: mocks.logoutRequest }));

vi.mock('$lib/states/voiceState.svelte', () => ({ voiceState: { leaveVoice: mocks.leaveVoice } }));
vi.mock('$lib/states/socketState.svelte', () => ({
	socketState: { disconnect: mocks.step('socket.disconnect') }
}));
vi.mock('$lib/states/historySyncState.svelte', () => ({
	historySyncState: { stop: mocks.historyStop }
}));
vi.mock('$lib/states/shareDialogState.svelte', () => ({
	shareDialogState: { close: mocks.step('shareDialog.close') }
}));
vi.mock('$lib/states/voicePresenceState.svelte', () => ({
	voicePresenceState: { reset: mocks.step('voicePresence.reset') }
}));
vi.mock('$lib/states/replyState.svelte', () => ({
	replyState: { reset: mocks.step('reply.reset') }
}));
vi.mock('$lib/states/messageEditState.svelte', () => ({
	messageEditState: { stop: mocks.step('messageEdit.stop') }
}));
vi.mock('$lib/states/overlayState.svelte', () => ({
	overlayState: { close: mocks.step('overlay.close') }
}));
vi.mock('$lib/states/usersState.svelte', () => ({
	usersState: { reset: mocks.step('users.reset') }
}));
vi.mock('$lib/states/serversState.svelte', () => ({
	serversState: { reset: mocks.step('servers.reset') }
}));
vi.mock('$lib/states/serverRequestState.svelte', () => ({
	serverRequestState: { reset: mocks.step('serverRequest.reset') }
}));
vi.mock('$lib/states/overwritesState.svelte', () => ({
	overwritesState: { reset: mocks.step('overwrites.reset') }
}));
vi.mock('$lib/states/messagesState.svelte', () => ({
	messagesState: { clearAll: mocks.step('messages.clearAll') }
}));
vi.mock('$lib/states/forumState.svelte', () => ({
	forumState: { reset: mocks.step('forum.reset') }
}));
vi.mock('$lib/states/serverImportState.svelte', () => ({
	serverImportState: { reset: mocks.step('serverImport.reset') }
}));
vi.mock('$lib/states/conversationsState.svelte', () => ({
	conversationsState: { reset: mocks.step('conversations.reset') }
}));
vi.mock('$lib/states/unreadState.svelte', () => ({
	unreadState: { reset: mocks.step('unread.reset') }
}));
vi.mock('$lib/states/notificationsState.svelte', () => ({
	notificationsState: { resetPush: mocks.step('notifications.resetPush') }
}));
vi.mock('$lib/states/searchState.svelte', () => ({
	searchState: { reset: mocks.step('search.reset') }
}));

import { axiosClient } from '$lib/requests/axiosClient';
import { clearSession, logout } from './session';

beforeEach(() => {
	mocks.order.length = 0;
	mocks.goto.mockReset();
	mocks.leaveVoice.mockReset().mockImplementation(async () => void mocks.order.push('voice.leave'));
	mocks.clearLocalCache
		.mockReset()
		.mockImplementation(async () => void mocks.order.push('cache.clear'));
	mocks.historyStop.mockReset().mockResolvedValue(undefined);
	mocks.disablePush.mockReset().mockImplementation(async () => void mocks.order.push('push.off'));
	mocks.logoutRequest
		.mockReset()
		.mockImplementation(async () => void mocks.order.push('logout.request'));
	vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe('clearSession', () => {
	it('leaves voice before it resets anything else or clears the cache', async () => {
		await clearSession();

		expect(mocks.order.slice(0, 2)).toEqual(['socket.disconnect', 'voice.leave']);
		expect(mocks.order.indexOf('voice.leave')).toBeLessThan(mocks.order.indexOf('users.reset'));
		expect(mocks.order.indexOf('voice.leave')).toBeLessThan(mocks.order.indexOf('cache.clear'));
	});

	it('resets what could carry over to the next account', async () => {
		await clearSession();

		expect(mocks.order).toEqual(
			expect.arrayContaining([
				'shareDialog.close',
				'voicePresence.reset',
				'reply.reset',
				'messageEdit.stop',
				'overlay.close'
			])
		);
	});

	it('finishes the teardown when leaving voice fails', async () => {
		mocks.leaveVoice.mockRejectedValue(new Error('disconnect failed'));

		await expect(clearSession()).resolves.toBeUndefined();

		expect(mocks.order).toContain('cache.clear');
		expect(mocks.order).toContain('overlay.close');
	});

	it('does not wait forever for a voice leave that never settles', async () => {
		vi.useFakeTimers();
		mocks.leaveVoice.mockReturnValue(new Promise(() => {}));

		const done = clearSession();
		await vi.advanceTimersByTimeAsync(3000);
		await done;

		expect(mocks.order).toContain('cache.clear');
	});
});

describe('logout', () => {
	it('leaves voice before the push and logout requests', async () => {
		await logout();

		expect(mocks.order.indexOf('voice.leave')).toBeLessThan(mocks.order.indexOf('push.off'));
		expect(mocks.order.indexOf('voice.leave')).toBeLessThan(mocks.order.indexOf('logout.request'));
		expect(mocks.goto).toHaveBeenCalledWith('/login');
	});

	it('still logs out when leaving voice fails', async () => {
		mocks.leaveVoice.mockRejectedValue(new Error('disconnect failed'));

		await logout();

		expect(mocks.order).toContain('logout.request');
		expect(mocks.goto).toHaveBeenCalledWith('/login');
	});
});

describe('session expiry', () => {
	it('leaves voice when a request comes back 401', async () => {
		vi.stubGlobal('window', { location: { pathname: '/app', search: '' } });
		const unauthorized: AxiosAdapter = (config) =>
			Promise.reject(
				new AxiosError('Unauthorized', 'ERR_BAD_REQUEST', config, null, {
					status: 401,
					statusText: 'Unauthorized',
					data: {},
					headers: {},
					config
				} as never)
			);

		await expect(axiosClient.get('/users/me/servers', { adapter: unauthorized })).rejects.toThrow();

		expect(mocks.leaveVoice).toHaveBeenCalledOnce();
		expect(mocks.order.indexOf('voice.leave')).toBeLessThan(mocks.order.indexOf('users.reset'));
		expect(mocks.goto).toHaveBeenCalledWith('/login?next=%2Fapp');
	});
});
