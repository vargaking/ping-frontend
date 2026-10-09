import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import type { StoredPost } from '$lib/types/localHistory.types';
import type { MessageType } from '$lib/types/messages.types';
import { clearLocalCache, db } from './db';
import {
	findMessageIds,
	findPosts,
	loadMessages,
	markWords,
	queryTokens,
	searchableText,
	snippet,
	type SearchScope
} from './messageSearch';
import { tokenize } from './searchText';

const doc = (value: string) =>
	({
		type: 'doc',
		content: [{ type: 'paragraph', content: [{ type: 'text', text: value }] }]
	}) as never;

let clock = Date.parse('2025-03-01T10:00:00Z');

function message(id: string, text: string, extra: Partial<MessageType> = {}): MessageType {
	clock += 60_000;
	return {
		id,
		user_id: 1,
		content: doc(text),
		timestamp: new Date(clock).toISOString(),
		server_id: 1,
		channel_id: 10,
		...extra
	};
}

function post(id: number, title: string, extra: Partial<StoredPost> = {}): StoredPost {
	return {
		id,
		channel_id: 20,
		server_id: 1,
		title,
		words: tokenize(title),
		author_id: 1,
		tag_ids: [],
		pinned: false,
		locked: false,
		reply_count: 0,
		created_at: '2025-03-01T10:00:00Z',
		last_activity_at: '2025-03-01T10:00:00Z',
		thumbnail: null,
		...extra
	};
}

async function find(query: string, scope: SearchScope = { kind: 'everywhere' }) {
	return findMessageIds(queryTokens(query), scope);
}

beforeEach(async () => {
	await clearLocalCache();
	clock = Date.parse('2025-03-01T10:00:00Z');
});

describe('findMessageIds', () => {
	it('finds a message by one word', async () => {
		await db.messages.bulkPut([message('a', 'Mirage smokes'), message('b', 'nothing here')]);
		expect(await find('smokes')).toEqual(['a']);
	});

	it('needs every word to match', async () => {
		await db.messages.bulkPut([
			message('a', 'Mirage smokes'),
			message('b', 'Mirage only'),
			message('c', 'smokes only')
		]);
		expect(await find('mirage smokes')).toEqual(['a']);
		expect(await find('smokes mirage')).toEqual(['a']);
	});

	it('matches word prefixes, in any order', async () => {
		await db.messages.bulkPut([message('a', 'Mirage smokes'), message('b', 'Mind the gap')]);
		expect(await find('mir smo')).toEqual(['a']);
		expect(await find('smo mir')).toEqual(['a']);
		expect(await find('irage')).toEqual([]);
	});

	it('ignores accents and case in both directions', async () => {
		await db.messages.bulkPut([message('a', 'Árvíz volt'), message('b', 'arvizturo')]);
		expect(await find('arviz')).toEqual(['b', 'a']);
		expect(await find('ÁRVÍZ')).toEqual(['b', 'a']);
		expect(await find('árvíz')).toEqual(['b', 'a']);
	});

	it('finds attachment file names', async () => {
		await db.messages.put({
			...message('a', ''),
			attachments: [{ id: 'f', filename: 'Holiday-photos.zip' } as never]
		});
		expect(await find('holiday')).toEqual(['a']);
	});

	it('returns nothing for an empty or too short query', async () => {
		await db.messages.put(message('a', 'hello there'));
		expect(await find('')).toEqual([]);
		expect(await find('  ')).toEqual([]);
		expect(await find('h')).toEqual([]);
	});

	it('returns the newest first', async () => {
		await db.messages.bulkPut([
			message('a', 'hello one'),
			message('b', 'hello two'),
			message('c', 'hello three')
		]);
		expect(await find('hello')).toEqual(['c', 'b', 'a']);
	});

	it('counts a message once when two words share the prefix', async () => {
		await db.messages.put(message('a', 'smoke smokes smoked'));
		expect(await find('smok')).toEqual(['a']);
		expect(await find('smok smoke')).toEqual(['a']);
	});

	describe('scopes', () => {
		beforeEach(async () => {
			await db.messages.bulkPut([
				message('s1c10', 'topic', { server_id: 1, channel_id: 10 }),
				message('s1c11', 'topic', { server_id: 1, channel_id: 11 }),
				message('s2c30', 'topic', { server_id: 2, channel_id: 30 }),
				message('post5', 'topic', { server_id: 1, channel_id: 20, post_id: 5 }),
				message('post6', 'topic', { server_id: 1, channel_id: 20, post_id: 6 }),
				message('dm7', 'topic', { server_id: null, channel_id: null, conversation_id: 7 }),
				message('dm8', 'topic', { server_id: null, channel_id: null, conversation_id: 8 })
			]);
		});

		const ids = (scope: SearchScope) => find('topic', scope);

		it('everywhere', async () => {
			expect(await ids({ kind: 'everywhere' })).toHaveLength(7);
		});

		it('server', async () => {
			expect(await ids({ kind: 'server', serverId: 1 })).toEqual([
				'post6',
				'post5',
				's1c11',
				's1c10'
			]);
			expect(await ids({ kind: 'server', serverId: 2 })).toEqual(['s2c30']);
		});

		it('channel', async () => {
			expect(await ids({ kind: 'channel', channelId: 10 })).toEqual(['s1c10']);
		});

		it('a forum channel includes the messages of its posts', async () => {
			expect(await ids({ kind: 'channel', channelId: 20 })).toEqual(['post6', 'post5']);
		});

		it('post', async () => {
			expect(await ids({ kind: 'post', postId: 5 })).toEqual(['post5']);
		});

		it('direct', async () => {
			expect(await ids({ kind: 'direct', conversationId: 8 })).toEqual(['dm8']);
		});

		it('an unknown place', async () => {
			expect(await ids({ kind: 'channel', channelId: 999 })).toEqual([]);
		});
	});

	describe('more than 500 matches', () => {
		const COUNT = 620;

		beforeEach(async () => {
			const rows: MessageType[] = [];
			for (let i = 0; i < COUNT; i++) {
				const where =
					i % 5 === 0
						? { server_id: 2, channel_id: 30 }
						: i % 5 === 1
							? { server_id: null, channel_id: null, conversation_id: 7 }
							: i % 5 === 2
								? { server_id: 1, channel_id: 20, post_id: 5 }
								: { server_id: 1, channel_id: 10 };
				rows.push(message(`m${String(i).padStart(4, '0')}`, `needle ${i}`, where));
			}
			await db.messages.bulkPut(rows);
			await db.messages.bulkPut([message('other', 'haystack', { server_id: 1, channel_id: 10 })]);
		});

		const newestFirst = (ids: string[]) => [...ids].sort().reverse();

		it('stays ordered newest first everywhere', async () => {
			const ids = await find('needle');
			expect(ids).toHaveLength(COUNT);
			expect(ids).toEqual(newestFirst(ids));
			expect(ids[0]).toBe('m0619');
		});

		it('is scoped to a server', async () => {
			const ids = await find('needle', { kind: 'server', serverId: 1 });
			expect(ids).toHaveLength(COUNT - COUNT / 5 - COUNT / 5);
			expect(ids).toEqual(newestFirst(ids));
			expect(ids.every((id) => Number(id.slice(1)) % 5 >= 2)).toBe(true);
		});

		it('is scoped to a channel, a post and a conversation', async () => {
			const channel = await find('needle', { kind: 'channel', channelId: 20 });
			expect(channel).toHaveLength(COUNT / 5);
			expect(channel.every((id) => Number(id.slice(1)) % 5 === 2)).toBe(true);

			const inPost = await find('needle', { kind: 'post', postId: 5 });
			expect(inPost).toEqual(channel);

			const direct = await find('needle', { kind: 'direct', conversationId: 7 });
			expect(direct).toHaveLength(COUNT / 5);
			expect(direct).toEqual(newestFirst(direct));
		});

		it('counts duplicate keys once', async () => {
			const ids = await find('need needl needle');
			expect(new Set(ids).size).toBe(ids.length);
			expect(ids).toHaveLength(COUNT);
		});
	});
});

describe('loadMessages', () => {
	it('keeps the order of the ids and skips missing ones', async () => {
		await db.messages.bulkPut([message('a', 'one'), message('b', 'two'), message('c', 'three')]);
		const rows = await loadMessages(['c', 'gone', 'a']);
		expect(rows.map((row) => row.id)).toEqual(['c', 'a']);
	});
});

describe('findPosts', () => {
	beforeEach(async () => {
		await db.posts.bulkPut([
			post(1, 'Mirage smokes guide', { last_activity_at: '2025-03-01T10:00:00Z' }),
			post(2, 'Mirage economy', { last_activity_at: '2025-03-03T10:00:00Z' }),
			post(3, 'Mirage everywhere', {
				channel_id: 21,
				server_id: 2,
				last_activity_at: '2025-03-02T10:00:00Z'
			}),
			post(4, 'Unrelated')
		]);
	});

	it('matches titles by prefix, all words, newest activity first', async () => {
		const posts = await findPosts(queryTokens('mir'), { kind: 'everywhere' });
		expect(posts.map((p) => p.id)).toEqual([2, 3, 1]);
		const narrowed = await findPosts(queryTokens('mir smo'), { kind: 'everywhere' });
		expect(narrowed.map((p) => p.id)).toEqual([1]);
	});

	it('ignores accents', async () => {
		await db.posts.put(post(5, 'Árvíz térkép'));
		expect(
			(await findPosts(queryTokens('arviz'), { kind: 'everywhere' })).map((p) => p.id)
		).toEqual([5]);
	});

	it('is scoped by server, channel and post', async () => {
		const tokens = queryTokens('mirage');
		expect((await findPosts(tokens, { kind: 'server', serverId: 1 })).map((p) => p.id)).toEqual([
			2, 1
		]);
		expect((await findPosts(tokens, { kind: 'channel', channelId: 21 })).map((p) => p.id)).toEqual([
			3
		]);
		expect((await findPosts(tokens, { kind: 'post', postId: 1 })).map((p) => p.id)).toEqual([1]);
	});

	it('finds none in a direct conversation', async () => {
		expect(await findPosts(queryTokens('mirage'), { kind: 'direct', conversationId: 1 })).toEqual(
			[]
		);
	});

	it('stops at the limit', async () => {
		expect(await findPosts(queryTokens('mirage'), { kind: 'everywhere' }, 2)).toHaveLength(2);
		expect(await findPosts(queryTokens('mirage'), { kind: 'everywhere' })).toHaveLength(3);
	});

	it('returns nothing for an empty query', async () => {
		expect(await findPosts([], { kind: 'everywhere' })).toEqual([]);
	});
});

describe('markWords', () => {
	it('marks whole words that start with a token', () => {
		expect(markWords('Mirage smokes are great', ['mir', 'smo'])).toEqual([
			{ text: 'Mirage', hit: true },
			{ text: ' ', hit: false },
			{ text: 'smokes', hit: true },
			{ text: ' are great', hit: false }
		]);
	});

	it('keeps the original casing and accents', () => {
		expect(markWords('Az Árvíz volt', ['arviz'])).toEqual([
			{ text: 'Az ', hit: false },
			{ text: 'Árvíz', hit: true },
			{ text: ' volt', hit: false }
		]);
	});

	it('does not mark a word that only contains the token', () => {
		expect(markWords('amirage', ['mir'])).toEqual([{ text: 'amirage', hit: false }]);
	});

	it('returns the text unmarked when nothing matches', () => {
		expect(markWords('nothing to see', ['xyz'])).toEqual([{ text: 'nothing to see', hit: false }]);
		expect(markWords('nothing', [])).toEqual([{ text: 'nothing', hit: false }]);
	});

	it('handles empty text', () => {
		expect(markWords('', ['abc'])).toEqual([]);
	});

	it('rebuilds the original text', () => {
		const text = 'Hello, wörld! 42 times… ok';
		expect(
			markWords(text, ['wor', '42'])
				.map((p) => p.text)
				.join('')
		).toBe(text);
	});
});

describe('snippet', () => {
	const words = (n: number, prefix: string) =>
		Array.from({ length: n }, (_, i) => `${prefix}${i}`).join(' ');

	it('returns short text whole, without ellipses', () => {
		expect(snippet('short text here', ['text'])).toEqual([
			{ text: 'short ', hit: false },
			{ text: 'text', hit: true },
			{ text: ' here', hit: false }
		]);
	});

	it('cuts around the first hit and adds ellipses on both sides', () => {
		const text = `${words(40, 'before')} needle ${words(40, 'after')}`;
		const parts = snippet(text, ['needle'], 20);
		const joined = parts.map((p) => p.text).join('');
		expect(joined.startsWith('…')).toBe(true);
		expect(joined.endsWith('…')).toBe(true);
		expect(parts.filter((p) => p.hit).map((p) => p.text)).toEqual(['needle']);
		expect(joined.length).toBeLessThan(80);
		expect(joined).toContain('before39');
		expect(joined).not.toContain('before0 ');
	});

	it('has no leading ellipsis when the hit is near the start', () => {
		const parts = snippet(`needle ${words(40, 'after')}`, ['needle'], 20);
		const joined = parts.map((p) => p.text).join('');
		expect(joined.startsWith('needle')).toBe(true);
		expect(joined.endsWith('…')).toBe(true);
	});

	it('shows the start of the text when nothing matches', () => {
		const parts = snippet(words(60, 'word'), ['zzz'], 20);
		const joined = parts.map((p) => p.text).join('');
		expect(joined.startsWith('word0 ')).toBe(true);
		expect(joined.endsWith('…')).toBe(true);
		expect(parts.some((p) => p.hit)).toBe(false);
	});

	it('keeps accents in the output', () => {
		const text = `${words(30, 'elöl')} Árvíz ${words(30, 'hátul')}`;
		expect(snippet(text, ['arviz'], 15).find((p) => p.hit)?.text).toBe('Árvíz');
	});

	it('returns nothing for empty text', () => {
		expect(snippet('', ['a1'])).toEqual([]);
	});
});

describe('searchableText', () => {
	it('uses the text, then the attachment names', () => {
		const row = {
			...message('a', 'Look at this'),
			attachments: [{ id: 'f', filename: 'plan.pdf' } as never]
		};
		expect(searchableText(row)).toBe('Look at this plan.pdf');
	});

	it('is just the file names for a message without text', () => {
		const row = {
			...message('a', ''),
			attachments: [
				{ id: 'f', filename: 'a.png' } as never,
				{ id: 'g', filename: 'b.png' } as never
			]
		};
		expect(searchableText(row)).toBe('a.png b.png');
	});
});
