import { AxiosError, AxiosHeaders } from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	getMe: vi.fn(),
	connect: vi.fn(),
	setLoggedInUser: vi.fn(),
	fetchUserServers: vi.fn(),
	loadServerChannels: vi.fn(),
	fetchConversations: vi.fn()
}));

vi.mock('$lib/requests/auth/me', () => ({ getMe: mocks.getMe }));
vi.mock('$lib/states/socketState.svelte', () => ({ socketState: { connect: mocks.connect } }));
vi.mock('$lib/states/usersState.svelte', () => ({
	usersState: { setLoggedInUser: mocks.setLoggedInUser }
}));
vi.mock('$lib/states/serversState.svelte', () => ({
	serversState: {
		fetchUserServers: mocks.fetchUserServers,
		loadServerChannels: mocks.loadServerChannels
	}
}));
vi.mock('$lib/states/conversationsState.svelte', () => ({
	conversationsState: { fetch: mocks.fetchConversations }
}));

import { initializeAppData } from './initializeAppData';

const never = () => new Promise<never>(() => {});

function axiosError(status?: number) {
	const response = status
		? {
				status,
				data: {},
				statusText: '',
				headers: {},
				config: { headers: new AxiosHeaders() }
			}
		: undefined;
	return new AxiosError('failed', 'ERR', undefined, undefined, response);
}

beforeEach(() => {
	vi.clearAllMocks();
	vi.spyOn(console, 'error').mockImplementation(() => {});
	const storage = new Map<string, string>([['last_updated', '2026-01-01T00:00:00Z']]);
	vi.stubGlobal('localStorage', {
		getItem: (key: string) => storage.get(key) ?? null,
		setItem: (key: string, value: string) => void storage.set(key, value),
		removeItem: (key: string) => void storage.delete(key)
	});
});

describe('initializeAppData', () => {
	it('returns once /auth/me answers, while the lists are still loading', async () => {
		mocks.getMe.mockResolvedValue({ id: 1, username: 'a' });
		mocks.fetchUserServers.mockImplementation(never);
		mocks.fetchConversations.mockImplementation(never);

		await expect(initializeAppData()).resolves.toBe('ok');
		expect(mocks.setLoggedInUser).toHaveBeenCalledWith({ id: 1, username: 'a' });
		expect(mocks.connect).toHaveBeenCalled();
		expect(mocks.fetchUserServers).toHaveBeenCalled();
		expect(mocks.fetchConversations).toHaveBeenCalled();
		expect(localStorage.getItem('last_updated')).toBeNull();
	});

	it("loads every server's channels once the server list is in", async () => {
		mocks.getMe.mockResolvedValue({ id: 1, username: 'a' });
		mocks.fetchUserServers.mockResolvedValue([{ id: 4 }, { id: 9 }]);
		mocks.loadServerChannels.mockResolvedValue([]);
		mocks.fetchConversations.mockResolvedValue(undefined);

		await initializeAppData();
		await vi.waitFor(() => expect(mocks.loadServerChannels).toHaveBeenCalledTimes(2));
		expect(mocks.loadServerChannels.mock.calls.map(([id]) => id)).toEqual([4, 9]);
	});

	it('reports an unreachable server instead of a logged-out user', async () => {
		mocks.getMe.mockRejectedValue(axiosError());
		await expect(initializeAppData()).resolves.toBe('unreachable');

		mocks.getMe.mockRejectedValue(axiosError(502));
		await expect(initializeAppData()).resolves.toBe('unreachable');
		expect(mocks.setLoggedInUser).not.toHaveBeenCalled();
	});

	it('treats a 401 as logged out', async () => {
		mocks.getMe.mockRejectedValue(axiosError(401));
		await expect(initializeAppData()).resolves.toBe('ok');
		expect(mocks.setLoggedInUser).not.toHaveBeenCalled();
		expect(mocks.connect).not.toHaveBeenCalled();
	});
});
