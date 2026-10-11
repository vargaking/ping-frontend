import type { InternalAxiosRequestConfig } from 'axios';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { axiosClient } from '../axiosClient';
import { getMessageChanges } from './getMessageChanges';
import { getMessagesByIds, MAX_IDS_PER_REQUEST } from './getMessagesByIds';

const originalAdapter = axiosClient.defaults.adapter;
let sent: string[];

beforeEach(() => {
	sent = [];
	axiosClient.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
		sent.push(axiosClient.getUri(config).replace(axiosClient.defaults.baseURL ?? '', ''));
		return { data: { messages: [] }, status: 200, statusText: 'OK', headers: {}, config };
	};
});

afterEach(() => {
	axiosClient.defaults.adapter = originalAdapter;
});

describe('getMessagesByIds', () => {
	it('repeats the ids parameter on /messages', async () => {
		await getMessagesByIds(['a', 'b', 'c']);

		expect(sent).toEqual(['/messages?ids=a&ids=b&ids=c']);
	});

	it('refuses more ids than one request may carry', async () => {
		const ids = Array.from({ length: MAX_IDS_PER_REQUEST + 1 }, (_, i) => `m${i}`);

		await expect(getMessagesByIds(ids)).rejects.toThrow(RangeError);
		expect(sent).toEqual([]);
	});
});

describe('getMessageChanges', () => {
	it.each([
		['without a position', undefined, '/messages/changes?limit=500'],
		['from a cursor', 'abc=', '/messages/changes?limit=500&since=abc%3D']
	])('asks %s', async (_name, since, url) => {
		await getMessageChanges(since);

		expect(sent).toEqual([url]);
	});
});
