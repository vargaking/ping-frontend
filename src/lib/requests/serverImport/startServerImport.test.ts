import { beforeEach, describe, expect, it, vi } from 'vitest';

const post = vi.hoisted(() => vi.fn());
vi.mock('../axiosClient', () => ({ axiosClient: { post } }));

import { startServerImport } from './startServerImport';

describe('startServerImport', () => {
	beforeEach(() => {
		post.mockReset();
		post.mockResolvedValue({ data: { id: 'imp-1' } });
	});

	it('posts the private channel picks as the body', async () => {
		await startServerImport(4, 'imp-1', { '103': 'only_me', '107': 'everyone' });

		expect(post).toHaveBeenCalledWith('/servers/4/import/imp-1/start', {
			private_channels: { '103': 'only_me', '107': 'everyone' }
		});
	});

	it('posts an empty selection to clear the stored one', async () => {
		await startServerImport(4, 'imp-1', {});

		expect(post).toHaveBeenCalledWith('/servers/4/import/imp-1/start', { private_channels: {} });
	});

	it('posts no body without picks', async () => {
		await startServerImport(4, 'imp-1');

		expect(post).toHaveBeenCalledWith('/servers/4/import/imp-1/start', undefined);
	});
});
