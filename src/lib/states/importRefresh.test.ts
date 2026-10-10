import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	order: [] as string[],
	refreshImport: vi.fn(),
	fetchChannels: vi.fn(),
	refreshForums: vi.fn(),
	forget: vi.fn(),
	resync: vi.fn()
}));

vi.mock('./serverImportState.svelte', () => ({
	serverImportState: { refresh: mocks.refreshImport }
}));
vi.mock('./serversState.svelte', () => ({
	serversState: { fetchServerChannels: mocks.fetchChannels }
}));
vi.mock('./forumState.svelte', () => ({ forumState: { refreshChannels: mocks.refreshForums } }));
vi.mock('./historySyncState.svelte', () => ({
	historySyncState: { forgetChannels: mocks.forget }
}));
vi.mock('./resyncState.svelte', () => ({ resyncState: { request: mocks.resync } }));

import { refreshAfterImport } from './importRefresh';

beforeEach(() => {
	mocks.order.length = 0;
	mocks.refreshImport.mockReset();
	mocks.fetchChannels.mockReset().mockResolvedValue([]);
	mocks.refreshForums.mockReset().mockImplementation(() => mocks.order.push('forums'));
	mocks.forget.mockReset().mockImplementation(async () => {
		await Promise.resolve();
		mocks.order.push('forgot');
	});
	mocks.resync.mockReset().mockImplementation(async () => {
		mocks.order.push('resync');
	});
});

const frame = (channel_ids?: number[]) => ({
	type: 'server_import_finished' as const,
	server_id: 12,
	...(channel_ids && { channel_ids })
});

describe('refreshAfterImport', () => {
	it('refreshes forums, forgets the sync rows, then resyncs, in that order', async () => {
		await refreshAfterImport(frame([301, 305]));

		expect(mocks.refreshImport).toHaveBeenCalledWith(12);
		expect(mocks.refreshForums).toHaveBeenCalledWith([301, 305]);
		expect(mocks.forget).toHaveBeenCalledWith(12, [301, 305]);
		expect(mocks.resync).toHaveBeenCalledWith('import');
		expect(mocks.order).toEqual(['forums', 'forgot', 'resync']);
		expect(mocks.fetchChannels).not.toHaveBeenCalled();
	});

	it('only refetches the channels when the run wrote to none', async () => {
		await refreshAfterImport(frame([]));

		expect(mocks.refreshImport).toHaveBeenCalledWith(12);
		expect(mocks.fetchChannels).toHaveBeenCalledWith(12);
		expect(mocks.refreshForums).not.toHaveBeenCalled();
		expect(mocks.forget).not.toHaveBeenCalled();
		expect(mocks.resync).not.toHaveBeenCalled();
	});

	it('treats a missing list as every channel of the server', async () => {
		await refreshAfterImport(frame());

		expect(mocks.refreshForums).toHaveBeenCalledWith(null);
		expect(mocks.forget).toHaveBeenCalledWith(12, null);
		expect(mocks.resync).toHaveBeenCalledWith('import');
	});

	it('warns instead of throwing when the channel refetch fails', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		mocks.fetchChannels.mockRejectedValue(new Error('offline'));

		await refreshAfterImport(frame([]));
		await Promise.resolve();

		expect(warn).toHaveBeenCalled();
		warn.mockRestore();
	});
});
