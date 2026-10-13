import 'fake-indexeddb/auto';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '$lib/types/auth.types';
import type { StoredMessage, StoredPost } from '$lib/types/localHistory.types';
import type { MessageType } from '$lib/types/messages.types';
import { clearLocalCache, db } from './db';
import {
	findMessageIds,
	findPosts,
	fromKeysForName,
	loadMessages,
	markWords,
	NO_FILTERS,
	pageMessages,
	type MessageFilters,
	type MessagePager,
	searchableText,
	snippet,
	storedUserIds,
	type SearchScope
} from './messageSearch';
import { parseSearchQuery } from './searchQuery';
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

/** Every id the pager gives, asking for `size` at a time. */
async function drain(pager: MessagePager, size: number): Promise<string[]> {
	const ids: string[] = [];
	for (;;) {
		const page = await pager.next(size);
		expect(page.length).toBeLessThanOrEqual(size);
		ids.push(...page.map((row) => row.id));
		if (page.length < size) return ids;
	}
}

async function find(query: string, scope: SearchScope = { kind: 'everywhere' }) {
	return findMessageIds(tokenize(query), scope);
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

describe('filters', () => {
	const EVERYWHERE: SearchScope = { kind: 'everywhere' };
	const dani = { id: 2, username: 'Dáni' } as User;
	const importer = { id: 1, username: 'importer' } as User;

	function filtersOf(input: string, users: User[]): MessageFilters {
		const query = parseSearchQuery(input);
		return {
			fromKeys: query.from ? fromKeysForName(query.from, users) : null,
			has: query.has,
			since: query.since,
			until: query.until
		};
	}

	async function search(input: string, scope: SearchScope = EVERYWHERE, users = [dani, importer]) {
		const pager = await pageMessages(parseSearchQuery(input).words, scope, filtersOf(input, users));
		return drain(pager, 50);
	}

	const attachment = (extra: Record<string, unknown>) =>
		({ id: 'f', filename: 'x', size: 1, kind: 'file', ...extra }) as never;
	const withImage = { attachments: [attachment({ kind: 'image', content_type: 'image/png' })] };
	const withVideo = { attachments: [attachment({ content_type: 'video/mp4' })] };
	const withPdf = { attachments: [attachment({ content_type: 'application/pdf' })] };
	const linkText = (url: string) =>
		({
			type: 'doc',
			content: [
				{
					type: 'paragraph',
					content: [{ type: 'text', text: 'docs', marks: [{ type: 'link', attrs: { href: url } }] }]
				}
			]
		}) as never;
	const imported = (id: string, name: string) => ({ imported_author: { id, name } });

	describe('from:', () => {
		it('matches one user, newest first', async () => {
			await db.messages.bulkPut([
				message('a', 'one', { user_id: 1 }),
				message('b', 'two', { user_id: 2 }),
				message('c', 'three', { user_id: 2 }),
				message('d', 'four', { user_id: 1 })
			]);
			expect(await search('from:dani')).toEqual(['c', 'b']);
		});

		it('matches an imported name for every author that has it, and no other import', async () => {
			await db.messages.bulkPut([
				message('a', 'one', imported('x1', 'Old Name')),
				message('b', 'two', imported('x2', 'old  náme')),
				message('c', 'three', imported('x3', 'Other')),
				message('d', 'four', { user_id: 1 })
			]);
			expect(await search('from:"Old Name"')).toEqual(['b', 'a']);
			expect(await search('from:other')).toEqual(['c']);
		});

		it('joins a user and an imported author of the same name, newest first', async () => {
			await db.messages.bulkPut([
				message('a', 'one', { user_id: 2 }),
				message('b', 'two', imported('x1', 'dani')),
				message('c', 'three', { user_id: 2 }),
				message('d', 'four', imported('x2', 'Dáni')),
				message('e', 'five', { user_id: 3 })
			]);
			expect(await search('from:dani')).toEqual(['d', 'c', 'b', 'a']);
		});

		it('does not let the shared import account match its imported rows', async () => {
			await db.messages.bulkPut([
				message('a', 'one', { user_id: 1 }),
				message('b', 'two', { user_id: 1, ...imported('x1', 'Someone') })
			]);
			expect(await search('from:importer')).toEqual(['a']);
		});

		it('matches whole names only', async () => {
			await db.messages.bulkPut([
				message('a', 'one', { user_id: 2 }),
				message('b', 'two', imported('x1', 'Daniel'))
			]);
			expect(await search('from:dan')).toEqual([]);
		});

		it('finds nothing for no author keys', async () => {
			await db.messages.put(message('a', 'one'));
			const pager = await pageMessages([], EVERYWHERE, { ...NO_FILTERS, fromKeys: [] });
			expect(await pager.next(10)).toEqual([]);
		});
	});

	describe('has:', () => {
		beforeEach(async () => {
			await db.messages.bulkPut([
				message('img', 'x1', withImage),
				message('vid', 'x1', withVideo),
				message('pdf', 'x1', withPdf),
				message('link', 'x1', { content: linkText('https://example.com') }),
				message('bare', 'see https://example.com'),
				message('plain', 'x1')
			]);
		});

		it.each([
			['has:file', ['pdf', 'vid', 'img']],
			['has:image', ['img']],
			['has:video', ['vid']],
			['has:link', ['bare', 'link']]
		])('%s', async (input, expected) => {
			expect(await search(input)).toEqual(expected);
		});

		it('needs every kind that is asked for', async () => {
			await db.messages.put(
				message('both', 'x1', { ...withImage, content: linkText('https://a.io') })
			);
			expect(await search('has:image has:link')).toEqual(['both']);
			expect(await search('has:image has:video')).toEqual([]);
		});

		it('works with words', async () => {
			await db.messages.put(message('named', 'mirage', withImage));
			expect(await search('mirage has:image')).toEqual(['named']);
			expect(await search('mirage has:video')).toEqual([]);
		});
	});

	describe('dates', () => {
		const local = (...args: [number, number, number, number, number]) =>
			new Date(...args).toISOString();

		beforeEach(async () => {
			await db.messages.bulkPut([
				message('feb', 'x1', { timestamp: local(2026, 1, 28, 23, 59) }),
				message('first', 'x1', { timestamp: local(2026, 2, 1, 0, 0) }),
				message('last', 'x1', { timestamp: local(2026, 2, 31, 23, 30) }),
				message('midnight', 'x1', { timestamp: local(2026, 3, 1, 0, 0) }),
				message('april', 'x1', { timestamp: local(2026, 3, 1, 0, 10) })
			]);
		});

		it.each([
			['during:2026-03', ['last', 'first']],
			['after:2026-03-01 before:2026-04-01', ['last', 'first']],
			['during:2026-03-31', ['last']],
			['during:2026-03-01', ['first']],
			['before:2026-03-01', ['feb']],
			['before:2026-04-01', ['last', 'first', 'feb']],
			['after:2026-04-01', ['april', 'midnight']],
			['after:2026-03-31 before:2026-04-02', ['april', 'midnight', 'last']],
			['after:2026-05-01 before:2026-04-01', []]
		])('%s', async (input, expected) => {
			expect(await search(input)).toEqual(expected);
		});

		it('applies to a scope as well', async () => {
			const channel: SearchScope = { kind: 'channel', channelId: 10 };
			expect(await search('during:2026-03', channel)).toEqual(['last', 'first']);
			expect(await search('before:2026-03-01', channel)).toEqual(['feb']);
		});

		it('combines with has: and words', async () => {
			await db.messages.put(
				message('shot', 'mirage', { ...withImage, timestamp: local(2026, 2, 15, 12, 0) })
			);
			expect(await search('mirage has:image during:2026-03')).toEqual(['shot']);
			expect(await search('mirage has:image during:2026-04')).toEqual([]);
		});
	});

	it('orders messages with the same time by id, newest first', async () => {
		const timestamp = '2025-03-01T10:00:00Z';
		await db.messages.bulkPut([
			message('a', 'x1', { ...withImage, timestamp }),
			message('c', 'x1', { ...withImage, timestamp }),
			message('b', 'x1', { ...withImage, timestamp })
		]);
		expect(await search('has:image')).toEqual(['c', 'b', 'a']);
		expect(await search('x1 has:image')).toEqual(['c', 'b', 'a']);
	});

	describe('scopes', () => {
		beforeEach(async () => {
			await db.messages.bulkPut([
				message('s1c10', 'topic', { ...withImage, server_id: 1, channel_id: 10 }),
				message('s1c11', 'topic', { ...withImage, server_id: 1, channel_id: 11 }),
				message('s2c30', 'topic', { ...withImage, server_id: 2, channel_id: 30 }),
				message('post5', 'topic', { ...withImage, server_id: 1, channel_id: 20, post_id: 5 }),
				message('dm7', 'topic', {
					...withImage,
					server_id: null,
					channel_id: null,
					conversation_id: 7
				}),
				message('noimage', 'topic', { server_id: 1, channel_id: 10 })
			]);
		});

		it.each([
			[{ kind: 'everywhere' }, ['dm7', 'post5', 's2c30', 's1c11', 's1c10']],
			[{ kind: 'server', serverId: 1 }, ['post5', 's1c11', 's1c10']],
			[{ kind: 'channel', channelId: 10 }, ['s1c10']],
			[{ kind: 'post', postId: 5 }, ['post5']],
			[{ kind: 'direct', conversationId: 7 }, ['dm7']]
		] as [SearchScope, string[]][])('narrows has:image to %j', async (scope, expected) => {
			expect(await search('has:image', scope)).toEqual(expected);
		});
	});

	describe('big result sets', () => {
		const COUNT = 1200;
		const id = (i: number) => `m${String(i).padStart(4, '0')}`;
		const isImage = (i: number) => i % 2 === 0;
		const userOf = (i: number) => (i % 11 === 0 ? 2 : 1);
		const serverOf = (i: number) => (i % 3 === 0 ? 2 : 1);
		const newestFirst = (indexes: number[]) => indexes.map(id).sort().reverse();
		const all = Array.from({ length: COUNT }, (_, i) => i);
		const one = { id: 1, username: 'one' } as User;

		beforeEach(async () => {
			await db.messages.bulkPut(
				all.map((i) =>
					message(id(i), `needle ${i}`, {
						user_id: userOf(i),
						server_id: serverOf(i),
						...(isImage(i) ? withImage : {})
					})
				)
			);
		});

		it('combines words, has: and from:', async () => {
			const expected = newestFirst(all.filter((i) => isImage(i) && userOf(i) === 1));
			expect(expected.length).toBeGreaterThan(500);
			expect(await search('needle has:image from:one', EVERYWHERE, [one])).toEqual(expected);
		});

		it('narrows a filter-only query to a scope', async () => {
			const expected = newestFirst(all.filter((i) => isImage(i) && serverOf(i) === 1));
			expect(await search('has:image', { kind: 'server', serverId: 1 })).toEqual(expected);
		});

		it('reads a date window alone', async () => {
			const since = (await db.messages.get(id(100)))?.ts ?? 0;
			const pager = await pageMessages([], EVERYWHERE, { ...NO_FILTERS, since });
			expect(await drain(pager, 50)).toEqual(newestFirst(all.filter((i) => i >= 100)));
		});

		it('joins a user and several imported authors that share a name', async () => {
			const importedIds = Array.from({ length: 700 }, (_, i) => `x${id(i)}`);
			await db.messages.bulkPut(
				importedIds.map((importedId, i) =>
					message(importedId, 'extra', imported(`author${i % 3}`, 'Dani'))
				)
			);
			const expected = [
				...[...importedIds].sort().reverse(),
				...newestFirst(all.filter((i) => userOf(i) === 2))
			];
			expect(await search('from:dani')).toEqual(expected);
		});
	});

	describe('paging', () => {
		type Spec = { id: string; group: number; server: number; image: boolean; who: string };
		const specs: Spec[] = Array.from({ length: 45 }, (_, i) => ({
			// Ids are not in time order, and four rows at a time share a time.
			id: `r${String((i * 7) % 45).padStart(2, '0')}`,
			group: Math.floor(i / 4),
			server: i % 2 === 0 ? 1 : 2,
			image: i % 3 !== 1,
			who: i % 5 === 0 ? 'imported' : i % 3 === 0 ? 'dani' : 'other'
		}));
		const base = Date.parse('2026-01-10T08:00:00Z');
		const newestFirstOf = (rows: Spec[]) =>
			rows.sort((a, b) => b.group - a.group || (a.id < b.id ? 1 : -1)).map((row) => row.id);

		beforeEach(async () => {
			await db.messages.bulkPut(
				specs.map((spec) =>
					message(spec.id, 'x1', {
						timestamp: new Date(base + spec.group * 60_000).toISOString(),
						server_id: spec.server,
						user_id: spec.who === 'dani' ? 2 : 1,
						...(spec.who === 'imported' ? imported('x1', 'Dani') : {}),
						...(spec.image ? withImage : {})
					})
				)
			);
		});

		const server1: SearchScope = { kind: 'server', serverId: 1 };
		const cases: [string, SearchScope, (spec: Spec) => boolean][] = [
			['has:image', EVERYWHERE, (s) => s.image],
			['has:image', server1, (s) => s.image && s.server === 1],
			['from:dani', EVERYWHERE, (s) => s.who !== 'other'],
			['from:dani has:image', server1, (s) => s.who !== 'other' && s.image && s.server === 1],
			['x1 from:dani', EVERYWHERE, (s) => s.who !== 'other']
		];

		it.each(
			cases.flatMap(([input, scope, wanted]) =>
				[1, 6].map((size) => [input, size, scope, wanted] as const)
			)
		)(
			'%s, %i at a time, in %j: newest first, no gaps, no repeats',
			async (input, size, scope, wanted) => {
				const expected = newestFirstOf(specs.filter(wanted));
				expect(expected.length).toBeGreaterThan(size);
				expect(await search(input, scope)).toEqual(expected);

				const pager = await pageMessages(
					parseSearchQuery(input).words,
					scope,
					filtersOf(input, [dani, importer])
				);
				expect(await drain(pager, size)).toEqual(expected);
				expect(await pager.next(size)).toEqual([]);
			}
		);
	});

	describe('driver', () => {
		const rows = (count: number, extra: (i: number) => Partial<MessageType>) =>
			Array.from({ length: count }, (_, i) =>
				message(`s${extra(i).server_id}-${i}`, 'common', extra(i))
			);

		beforeEach(async () => {
			await db.messages.bulkPut([
				...rows(6, (i) => ({
					server_id: 1,
					user_id: i === 1 ? 2 : 1,
					...(i < 3 ? withImage : {})
				})),
				...rows(30, (i) => ({
					server_id: 2,
					user_id: i === 3 ? 2 : 1,
					...(i === 4 ? imported('x1', 'Dani') : {}),
					...(i < 2 ? withVideo : withImage)
				})),
				message('rare', 'common rare', { server_id: 2, ...withImage })
			]);
		});

		const server = (serverId: number): SearchScope => ({ kind: 'server', serverId });
		const walked = async (input: string, scope: SearchScope) => {
			const pager = await pageMessages(
				parseSearchQuery(input).words,
				scope,
				filtersOf(input, [dani, importer])
			);
			const where = vi.spyOn(db.messages, 'where');
			const rows = await pager.next(5);
			const indexes = where.mock.calls.map(([index]) => index);
			where.mockRestore();
			return { rows, indexes };
		};
		const everything = async (wanted: (row: StoredMessage) => boolean) =>
			(await db.messages.toArray())
				.filter(wanted)
				.sort((a, b) => (b.ts ?? 0) - (a.ts ?? 0) || (a.id < b.id ? 1 : -1));

		const channel = (channelId: number): SearchScope => ({ kind: 'channel', channelId });

		it.each([
			['the flag for a server scope, whatever its size', 'has:image', server(1), ['[hasImage+ts]']],
			['the flag when it is smaller than the scope', 'has:video', server(2), ['[hasVideo+ts]']],
			['the flag when everywhere', 'has:image', EVERYWHERE, ['[hasImage+ts]']],
			['every author key, uncounted', 'from:dani', server(2), ['[fromKey+ts]', '[fromKey+ts]']],
			['the time index for a date window alone', 'after:2000-01-01', EVERYWHERE, ['ts']],
			[
				'the server index for a date window in a server',
				'after:2000-01-01',
				server(1),
				['[server_id+ts]']
			],
			['nothing, loading the few word matches directly', 'rare has:image', EVERYWHERE, []],
			['nothing, whatever the lone flag holds', 'common has:video', EVERYWHERE, []],
			[
				'the flag when it is smaller than the words',
				'common has:video',
				channel(10),
				['[hasVideo+ts]']
			]
		] as [string, string, SearchScope, string[]][])(
			'walks %s',
			async (_, input, scope, indexes) => {
				const { indexes: used } = await walked(input, scope);
				expect(used).toEqual(indexes);
			}
		);

		it('walks a channel that is smaller than a broad flag', async () => {
			await db.messages.bulkPut([
				message('c11a', 'common', { ...withImage, channel_id: 11 }),
				message('c11b', 'common', { channel_id: 11 })
			]);
			const { rows, indexes } = await walked('has:image', channel(11));
			expect(indexes).toEqual(['[channel_id+ts]']);
			expect(rows.map((row) => row.id)).toEqual(['c11a']);
		});

		it.each([
			['has:image', server(1), (r: StoredMessage) => r.server_id === 1 && r.hasImage === 1],
			['has:video', server(2), (r: StoredMessage) => r.server_id === 2 && r.hasVideo === 1],
			['from:dani', EVERYWHERE, (r: StoredMessage) => r.user_id === 2 || r.fromKey === 'name:dani'],
			['rare has:image', EVERYWHERE, (r: StoredMessage) => r.id === 'rare'],
			['common has:video', EVERYWHERE, (r: StoredMessage) => r.hasVideo === 1]
		] as [string, SearchScope, (row: StoredMessage) => boolean][])(
			'returns the same rows whichever range drives %s in %j',
			async (input, scope, wanted) => {
				const expected = (await everything(wanted)).map((row) => row.id);
				expect(expected.length).toBeGreaterThan(0);
				expect(await search(input, scope)).toEqual(expected);
			}
		);

		it('walks a flag with no rows once and finds nothing', async () => {
			const { rows, indexes } = await walked('has:link', EVERYWHERE);
			expect(rows).toEqual([]);
			expect(indexes).toEqual(['[hasLink+ts]']);
		});

		describe('counting', () => {
			const count = vi.spyOn(Object.getPrototypeOf(db.messages.toCollection()), 'count');
			afterAll(() => count.mockRestore());
			const counted = async (input: string, scope: SearchScope) => {
				count.mockClear();
				await pageMessages(
					parseSearchQuery(input).words,
					scope,
					filtersOf(input, [dani, importer])
				);
				return count.mock.calls.length;
			};

			it.each([
				['one flag', 'has:image', EVERYWHERE],
				['one flag in a server', 'has:image', server(1)],
				['an author in a server', 'from:dani', server(2)],
				['a date window alone', 'after:2000-01-01', EVERYWHERE],
				['a date window in a server', 'after:2000-01-01', server(1)],
				['a date window in a channel', 'after:2000-01-01', channel(10)]
			] as [string, string, SearchScope][])('does not count %s', async (_, input, scope) => {
				expect(await counted(input, scope)).toBe(0);
			});

			it.each([
				['two flags', 'has:image has:video', EVERYWHERE, 2],
				['two flags in a server, not the server', 'has:image has:video', server(1), 2],
				['a flag in a channel, and the channel', 'has:image', channel(10), 2],
				['an author and a flag in a server', 'from:dani has:image', server(1), 3]
			] as [string, string, SearchScope, number][])('counts %s', async (_, input, scope, calls) => {
				expect(await counted(input, scope)).toBe(calls);
			});
		});
	});

	describe('nothing to read', () => {
		beforeEach(async () => {
			await db.messages.put(message('a', 'hello there', withImage));
		});

		it.each([
			['no words and no filters', [], { ...NO_FILTERS }],
			['no author keys', [], { ...NO_FILTERS, fromKeys: [] }],
			['an empty date window', [], { ...NO_FILTERS, since: 5, until: 5 }],
			['words nothing has', ['zzzz'], { ...NO_FILTERS, has: ['image'] }],
			['an author nobody is', [], { ...NO_FILTERS, fromKeys: ['name:nobody'] }]
		] as [string, string[], MessageFilters][])('%s', async (_, tokens, filters) => {
			const pager = await pageMessages(tokens, EVERYWHERE, filters);
			expect(await pager.next(10)).toEqual([]);
		});
	});
});

describe('fromKeysForName', () => {
	it('names the imported author and every user whose name folds to it', () => {
		const users = [
			{ id: 2, username: 'Dáni' },
			{ id: 3, username: 'dani' },
			{ id: 4, username: 'daniel' }
		] as User[];
		expect(fromKeysForName('dani', users)).toEqual(['name:dani', 'user:2', 'user:3']);
		expect(fromKeysForName('nobody', users)).toEqual(['name:nobody']);
	});
});

describe('storedUserIds', () => {
	it('lists each account with a stored message once', async () => {
		await db.messages.bulkPut([
			message('a', 'x1', { user_id: 3 }),
			message('b', 'x1', { user_id: 3 }),
			message('c', 'x1', { user_id: 1 })
		]);
		expect(await storedUserIds()).toEqual([1, 3]);
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
		const posts = await findPosts(tokenize('mir'), { kind: 'everywhere' });
		expect(posts.map((p) => p.id)).toEqual([2, 3, 1]);
		const narrowed = await findPosts(tokenize('mir smo'), { kind: 'everywhere' });
		expect(narrowed.map((p) => p.id)).toEqual([1]);
	});

	it('ignores accents', async () => {
		await db.posts.put(post(5, 'Árvíz térkép'));
		expect((await findPosts(tokenize('arviz'), { kind: 'everywhere' })).map((p) => p.id)).toEqual([
			5
		]);
	});

	it('is scoped by server, channel and post', async () => {
		const tokens = tokenize('mirage');
		expect((await findPosts(tokens, { kind: 'server', serverId: 1 })).map((p) => p.id)).toEqual([
			2, 1
		]);
		expect((await findPosts(tokens, { kind: 'channel', channelId: 21 })).map((p) => p.id)).toEqual([
			3
		]);
		expect((await findPosts(tokens, { kind: 'post', postId: 1 })).map((p) => p.id)).toEqual([1]);
	});

	it('finds none in a direct conversation', async () => {
		expect(await findPosts(tokenize('mirage'), { kind: 'direct', conversationId: 1 })).toEqual([]);
	});

	it('stops at the limit', async () => {
		expect(await findPosts(tokenize('mirage'), { kind: 'everywhere' }, 2)).toHaveLength(2);
		expect(await findPosts(tokenize('mirage'), { kind: 'everywhere' })).toHaveLength(3);
	});

	it('returns nothing for an empty query', async () => {
		expect(await findPosts([], { kind: 'everywhere' })).toEqual([]);
	});

	describe('with filters', () => {
		const everywhere = { kind: 'everywhere' } as const;
		const tokens = tokenize('mirage');

		beforeEach(async () => {
			await db.posts.bulkPut([
				post(10, 'Mirage by dani', { author_id: 2, created_at: '2025-03-10T12:00:00Z' }),
				post(11, 'Mirage by import', {
					author_id: 1,
					imported_author: { id: 'x', name: 'Old Name' },
					created_at: '2025-04-10T12:00:00Z'
				})
			]);
		});

		it.each([
			['an account', { fromKeys: ['user:2'] }, [10]],
			['an imported name', { fromKeys: ['name:old name'] }, [11]],
			['no match', { fromKeys: ['user:99'] }, []],
			['a start date', { since: Date.parse('2025-04-01T00:00:00Z') }, [11]],
			['an end date', { until: Date.parse('2025-04-01T00:00:00Z') }, [10]]
		])('narrows to %s', async (_, filters, expected) => {
			const posts = await findPosts(tokens, everywhere, 25, { ...NO_FILTERS, ...filters });
			expect(posts.map((p) => p.id).filter((id) => id >= 10)).toEqual(expected);
		});

		it('finds none when a has: filter is set', async () => {
			expect(await findPosts(tokens, everywhere, 25, { ...NO_FILTERS, has: ['link'] })).toEqual([]);
		});

		it('finds none without words', async () => {
			const filters = { ...NO_FILTERS, fromKeys: ['user:2'] };
			expect(await findPosts([], everywhere, 25, filters)).toEqual([]);
		});
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
