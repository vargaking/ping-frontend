import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	useInvite: vi.fn(),
	fetchUserServers: vi.fn(),
	fetchServerChannels: vi.fn()
}));

vi.mock('$lib/requests/invites', () => ({ useInvite: mocks.useInvite }));
vi.mock('$lib/states/serversState.svelte', () => ({
	serversState: {
		fetchUserServers: mocks.fetchUserServers,
		fetchServerChannels: mocks.fetchServerChannels
	}
}));

import { joinInvite } from './joinInvite';

beforeEach(() => {
	vi.resetAllMocks();
	mocks.useInvite.mockResolvedValue({ detail: 'ok', server_id: 7 });
	mocks.fetchUserServers.mockResolvedValue([]);
	mocks.fetchServerChannels.mockResolvedValue([]);
});

describe('joinInvite', () => {
	it('uses the invite, refreshes the server list, loads the channels and returns the server id', async () => {
		const order: string[] = [];
		mocks.useInvite.mockImplementation(async () => {
			order.push('use');
			return { detail: 'ok', server_id: 7 };
		});
		mocks.fetchUserServers.mockImplementation(async () => void order.push('servers'));
		mocks.fetchServerChannels.mockImplementation(async () => void order.push('channels'));

		await expect(joinInvite('abc')).resolves.toBe(7);

		expect(order).toEqual(['use', 'servers', 'channels']);
		expect(mocks.fetchServerChannels).toHaveBeenCalledWith(7);
	});

	it.each([
		[undefined, {}],
		['hunter2', { password: 'hunter2' }]
	])('sends password %j as %j', async (password, body) => {
		await joinInvite('abc', password);
		expect(mocks.useInvite).toHaveBeenCalledWith('abc', body);
	});

	it('rejects and changes nothing when the invite cannot be used', async () => {
		const error = new Error('gone');
		mocks.useInvite.mockRejectedValue(error);

		await expect(joinInvite('abc')).rejects.toBe(error);

		expect(mocks.fetchUserServers).not.toHaveBeenCalled();
		expect(mocks.fetchServerChannels).not.toHaveBeenCalled();
	});

	it('still succeeds when the channels fail to load', async () => {
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		mocks.fetchServerChannels.mockRejectedValue(new Error('offline'));

		await expect(joinInvite('abc')).resolves.toBe(7);
	});
});
