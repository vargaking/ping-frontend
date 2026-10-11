import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MessageType } from '$lib/types/messages.types';
import { clearLocalCache, db, localHistoryReady } from '$lib/utils/db';
import { readNewest, pruneToPage, type CachedThread } from './threadCache';

vi.mock('$lib/utils/db', async (importOriginal) => {
	const actual = await importOriginal<typeof import('$lib/utils/db')>();
	return { ...actual, localHistoryReady: vi.fn(actual.localHistoryReady) };
});

const START = Date.parse('2025-03-01T10:00:00Z');
const MINUTE = 60_000;

const doc = (value: string) =>
	({
		type: 'doc',
		content: [{ type: 'paragraph', content: [{ type: 'text', text: value }] }]
	}) as never;

function message(n: number, extra: Partial<MessageType> = {}): MessageType {
	return {
		id: `m${n}`,
		user_id: 1,
		content: doc(`message ${n}`),
		timestamp: new Date(START + n * MINUTE).toISOString(),
		server_id: 1,
		...extra
	};
}

const threads: { name: string; thread: CachedThread; fields: Partial<MessageType> }[] = [
	{
		name: 'channel',
		thread: { kind: 'channel', channelId: 10 },
		fields: { channel_id: 10 }
	},
	{
		name: 'post',
		thread: { kind: 'post', postId: 5 },
		fields: { channel_id: 10, post_id: 5 }
	},
	{
		name: 'direct',
		thread: { kind: 'direct', conversationId: 7 },
		fields: { conversation_id: 7, server_id: undefined }
	}
];

const elsewhere: Partial<MessageType> = { channel_id: 11, conversation_id: 8, post_id: 6 };

const range = (from: number, to: number) =>
	Array.from({ length: to - from + 1 }, (_, i) => from + i);
const ids = (messages: MessageType[]) => messages.map((m) => m.id);
const idsOf = (numbers: number[]) => numbers.map((n) => `m${n}`);

async function seed(numbers: number[], fields: Partial<MessageType>) {
	await db.messages.bulkPut(numbers.map((n) => message(n, fields)));
}

beforeEach(async () => {
	await clearLocalCache();
});

describe('readNewest', () => {
	it.each(threads)(
		'returns the newest 50 of a $name, oldest first, without derived fields',
		async ({ thread, fields }) => {
			await seed(range(1, 60), fields);
			await seed(range(101, 110), elsewhere);

			const tail = (await readNewest(thread))!;

			expect(ids(tail)).toEqual(idsOf(range(11, 60)));
			expect(tail[0]).toEqual(message(11, fields));
		}
	);

	it('leaves out forum post messages, which share the channel id', async () => {
		await seed(range(1, 55), { channel_id: 10 });
		await seed(range(56, 80), { channel_id: 10, post_id: 5 });

		const tail = (await readNewest({ kind: 'channel', channelId: 10 }))!;

		expect(ids(tail)).toEqual(idsOf(range(6, 55)));
	});

	it('returns what exists when the thread is shorter than the limit', async () => {
		await seed(range(1, 3), { channel_id: 10 });

		expect(ids((await readNewest({ kind: 'channel', channelId: 10 }))!)).toEqual(idsOf([1, 2, 3]));
		expect(await readNewest({ kind: 'channel', channelId: 99 })).toEqual([]);
	});

	it('is null when local history is unusable', async () => {
		await seed(range(1, 3), { channel_id: 10 });
		vi.mocked(localHistoryReady).mockResolvedValueOnce(false);

		expect(await readNewest({ kind: 'channel', channelId: 10 })).toBeNull();
	});
});

describe('pruneToPage', () => {
	const none = new Set<string>();
	const stored = async () => (await db.messages.toArray()).map((m) => m.id).sort();
	const sorted = (numbers: number[]) => idsOf(numbers).sort();

	function prune(
		thread: CachedThread,
		numbers: number[],
		options: {
			complete?: boolean;
			requested?: Set<string>;
			keep?: Set<string>;
		} = {}
	) {
		return pruneToPage(thread, {
			page: numbers.map((n) => message(n)),
			complete: options.complete ?? false,
			requested: options.requested ?? none,
			keep: () => options.keep ?? none
		});
	}

	it.each(threads)(
		'drops only the $name rows inside the page range that the page lacks',
		async ({ thread, fields }) => {
			await seed(range(1, 10), fields);
			await seed(range(101, 110), elsewhere);

			const gone = await prune(thread, [4, 5, 6, 8, 9, 10]);

			expect(gone).toEqual(['m7']);
			expect(await stored()).toEqual(
				[...idsOf(range(1, 6)), ...idsOf(range(8, 10)), ...idsOf(range(101, 110))].sort()
			);
		}
	);

	it('also drops older rows when the page is the whole thread', async () => {
		await seed(range(1, 10), { channel_id: 10 });

		const gone = await prune({ kind: 'channel', channelId: 10 }, [4, 5, 6, 8, 9, 10], {
			complete: true
		});

		expect(gone.sort()).toEqual(sorted([1, 2, 3, 7]));
	});

	it('leaves a forum post alone when pruning its channel', async () => {
		await seed(range(1, 5), { channel_id: 10 });
		await seed(range(6, 8), { channel_id: 10, post_id: 5 });

		const gone = await prune({ kind: 'channel', channelId: 10 }, [1, 3, 4, 5]);

		expect(gone).toEqual(['m2']);
		expect(await stored()).toEqual(sorted([1, 3, 4, 5, 6, 7, 8]));
	});

	it('keeps unsent rows and rows still on screen', async () => {
		await seed(range(1, 10), { channel_id: 10 });
		await db.messages.update('m5', { status: 'pending' });

		const gone = await prune({ kind: 'channel', channelId: 10 }, [4, 9, 10], {
			keep: new Set(['m7'])
		});

		expect(gone.sort()).toEqual(sorted([6, 8]));
	});

	it.each([
		{ name: 'written after the page was requested', requested: [], deleted: false },
		{ name: 'on screen when the page was requested', requested: ['m9'], deleted: true }
	])('rows newer than the page, $name', async ({ requested, deleted }) => {
		await seed(range(1, 9), { channel_id: 10 });

		const gone = await prune({ kind: 'channel', channelId: 10 }, [4, 5, 6, 7, 8], {
			requested: new Set(requested)
		});

		expect(gone.includes('m9')).toBe(deleted);
	});

	it('deletes nothing for an empty page', async () => {
		await seed(range(1, 5), { channel_id: 10 });

		expect(await prune({ kind: 'channel', channelId: 10 }, [], { complete: true })).toEqual([]);
		expect(await stored()).toEqual(sorted(range(1, 5)));
	});
});
