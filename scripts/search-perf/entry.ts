import type { User } from '$lib/types/auth.types';
import type { MessageType } from '$lib/types/messages.types';
import { db } from '$lib/utils/db';
import {
	fromKeysForName,
	pageMessages,
	type MessageFilters,
	type SearchScope
} from '$lib/utils/messageSearch';
import { parseSearchQuery } from '$lib/utils/searchQuery';

const DAY = 86_400_000;
const START = Date.parse('2021-10-01T00:00:00Z');
const SPAN = 5 * 365 * DAY;
const USERS = 400;
const IMPORTED_AUTHORS = 40;
const IMPORTED_ACCOUNT = 1;
const SMALL_CHANNEL = 99;
const PAGE = 30;

function random(seed: number) {
	return () => {
		seed = (seed + 0x6d2b79f5) | 0;
		let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

const SYLLABLES = ['ka', 'lo', 'mi', 'ne', 'ru', 'sa', 'to', 'vi', 'za', 'be', 'di', 'fu'];
const VOCABULARY = Array.from({ length: 3000 }, (_, i) => {
	let word = '';
	for (let n = i + 12; n > 0; n = Math.floor(n / SYLLABLES.length)) word += SYLLABLES[n % 12];
	return word;
});

function doc(text: string, link?: string): MessageType['content'] {
	const marks = link ? [{ type: 'link', attrs: { href: link } }] : undefined;
	return {
		type: 'doc',
		content: [{ type: 'paragraph', content: [{ type: 'text', text, marks }] }]
	};
}

function attachment(kind: 'image' | 'video' | 'file', i: number) {
	const types = { image: 'image/png', video: 'video/mp4', file: 'application/pdf' };
	return {
		id: `a${i}`,
		filename: `${kind}-${i}`,
		size: 1000,
		kind: kind === 'image' ? 'image' : 'file',
		content_type: types[kind]
	} as never;
}

/** Shaped like a big imported history: most messages in one server, some in two others and in
 *  DMs, 15% by imported authors, a few percent with attachments or links. */
function buildMessage(i: number, rand: () => number): MessageType {
	const message: MessageType = {
		id: `m${String(i).padStart(7, '0')}`,
		user_id: 2 + Math.floor(rand() * USERS),
		content: doc(''),
		timestamp: new Date(START + Math.floor(rand() * SPAN)).toISOString()
	};

	const place = rand();
	if (i % 2500 === 0) Object.assign(message, { server_id: 1, channel_id: SMALL_CHANNEL });
	else if (place < 0.7) {
		Object.assign(message, { server_id: 1, channel_id: 10 + Math.floor(rand() * 10) });
	} else if (place < 0.82) {
		Object.assign(message, { server_id: 2, channel_id: 20 + Math.floor(rand() * 5) });
	} else if (place < 0.92) {
		Object.assign(message, { server_id: 3, channel_id: 30 + Math.floor(rand() * 2) });
	} else {
		const conversation_id = 1 + Math.floor(rand() * 20);
		Object.assign(message, { server_id: null, channel_id: null, conversation_id });
	}

	if (rand() < 0.15) {
		const author = Math.floor(rand() * IMPORTED_AUTHORS);
		message.user_id = IMPORTED_ACCOUNT;
		message.imported_author = {
			id: `d${author}`,
			name: author === 0 ? 'Old Name' : `Imported ${author}`
		};
	}

	const words = Array.from(
		{ length: 5 + Math.floor(rand() * 8) },
		() => VOCABULARY[Math.floor(rand() ** 2 * VOCABULARY.length)]
	);
	if (rand() < 0.47) words.push('mirage');
	const bareUrl = rand() < 0.06;
	const maskedLink = rand() < 0.02;
	message.content = doc(
		bareUrl ? `${words.join(' ')} https://example.com/p/${i}` : words.join(' '),
		maskedLink ? 'https://example.com/m' : undefined
	);

	const files = rand();
	if (files < 0.05) message.attachments = [attachment('image', i)];
	else if (files < 0.065) message.attachments = [attachment('video', i)];
	else if (files < 0.08) message.attachments = [attachment('file', i)];
	return message;
}

async function seed(rows: number) {
	await db.messages.clear();
	const rand = random(255);
	for (let from = 0; from < rows; from += 5000) {
		const size = Math.min(5000, rows - from);
		await db.messages.bulkPut(Array.from({ length: size }, (_, n) => buildMessage(from + n, rand)));
	}
	return db.messages.count();
}

const users = Array.from({ length: USERS }, (_, i) => ({
	id: 2 + i,
	username: `user${2 + i}`
})) as User[];

type Query = { name: string; input: string; scope: SearchScope };

function median(values: number[]): number {
	const sorted = [...values].sort((a, b) => a - b);
	return sorted[Math.floor(sorted.length / 2)];
}

async function firstPage({ input, scope }: Query) {
	const parsed = parseSearchQuery(input);
	const filters: MessageFilters = {
		fromKeys: parsed.from ? fromKeysForName(parsed.from, users) : null,
		has: parsed.has,
		since: parsed.since,
		until: parsed.until
	};
	const pager = await pageMessages(parsed.words, scope, filters);
	return pager.next(PAGE);
}

async function bench(queries: Query[], runs: number) {
	const results = [];
	for (const query of queries) {
		await firstPage(query);
		const times: number[] = [];
		let rows: { id: string }[] = [];
		for (let run = 0; run < runs; run++) {
			const started = performance.now();
			rows = await firstPage(query);
			times.push(performance.now() - started);
		}
		results.push({
			name: query.name,
			median: median(times),
			min: Math.min(...times),
			max: Math.max(...times),
			count: rows.length,
			ids: rows.map((row) => row.id).join(',')
		});
	}
	return results;
}

Object.assign(globalThis, { perf: { seed, bench } });
