import { describe, expect, it } from 'vitest';
import type { Attachment } from '$lib/types/attachment.types';
import {
	attachmentKind,
	contentHasLink,
	fromKeyOf,
	messageFacets,
	normalizeName,
	postFromKey
} from './searchFacets';

const text = (value: string, marks?: { type: string; attrs?: Record<string, unknown> }[]) => ({
	type: 'text',
	text: value,
	...(marks ? { marks } : {})
});
const doc = (...inline: object[]) => ({
	type: 'doc',
	content: [{ type: 'paragraph', content: inline }]
});

function attachment(extra: Partial<Attachment>): Attachment {
	return {
		id: 'f',
		filename: 'x',
		content_type: 'application/octet-stream',
		size: 1,
		kind: 'file',
		width: null,
		height: null,
		url: '/x',
		...extra
	};
}

const facets = (attachments: Attachment[], content: unknown = doc(text('hi'))) =>
	messageFacets({ user_id: 5, content: content as never, attachments });

describe('normalizeName', () => {
	it.each([
		['Ádám  Kovács ', 'adam kovacs'],
		['  Old\tName', 'old name'],
		['dani', 'dani']
	])('%j becomes %j', (name, expected) => {
		expect(normalizeName(name)).toBe(expected);
	});
});

describe('fromKeyOf', () => {
	it('keys a normal message by its account', () => {
		expect(fromKeyOf({ user_id: 5 })).toBe('user:5');
	});

	it('keys an imported message by the normalized author name, whatever the author id', () => {
		const a = fromKeyOf({ user_id: 1, imported_author: { id: 'a', name: 'Ádám  Kovács ' } });
		const b = fromKeyOf({ user_id: 1, imported_author: { id: 'b', name: 'adam kovacs' } });
		expect(a).toBe('name:adam kovacs');
		expect(b).toBe(a);
	});

	it('keeps a name that looks like a key apart from an account', () => {
		expect(fromKeyOf({ user_id: 1, imported_author: { id: 'a', name: 'user:5' } })).toBe(
			'name:user:5'
		);
	});
});

describe('postFromKey', () => {
	it.each([
		[{ author_id: 5, imported_author: null }, 'user:5'],
		[{ author_id: 1, imported_author: { id: 'a', name: 'Old Name' } }, 'name:old name'],
		[{ author_id: null, imported_author: null }, null]
	])('%j is %j', (post, expected) => {
		expect(postFromKey(post as never)).toBe(expected);
	});
});

describe('attachmentKind', () => {
	it.each([
		[{ kind: 'image' as const, content_type: 'image/png' }, 'image'],
		[{ kind: 'file' as const, content_type: 'image/svg+xml' }, 'image'],
		[{ kind: 'file' as const, content_type: 'Video/MP4' }, 'video'],
		[{ kind: 'file' as const, content_type: 'application/pdf' }, 'file'],
		[{ kind: 'file' as const, content_type: undefined as never }, 'file']
	])('%j is %s', (attachmentFields, expected) => {
		expect(attachmentKind(attachment(attachmentFields))).toBe(expected);
	});
});

describe('messageFacets attachments', () => {
	it.each([
		['an image', [attachment({ kind: 'image', content_type: 'image/png' })], ['Image', 'File']],
		['a video', [attachment({ content_type: 'video/mp4' })], ['Video', 'File']],
		['an svg', [attachment({ content_type: 'image/svg+xml' })], ['Image', 'File']],
		['a pdf', [attachment({ content_type: 'application/pdf' })], ['File']],
		['no attachment', [], []]
	])('%s sets %j', (_, attachments, flags) => {
		const expected = Object.fromEntries(flags.map((flag) => [`has${flag}`, 1]));
		expect(facets(attachments)).toEqual({ fromKey: 'user:5', ...expected });
	});

	it('sets one flag per kind when a message has several attachments', () => {
		const result = facets([
			attachment({ content_type: 'application/pdf' }),
			attachment({ content_type: 'video/webm' })
		]);
		expect(result).toEqual({ fromKey: 'user:5', hasFile: 1, hasVideo: 1 });
	});

	it('leaves the flags out instead of writing false', () => {
		expect(Object.keys(facets([]))).toEqual(['fromKey']);
	});
});

describe('contentHasLink', () => {
	const link = (href: string) => doc(text('docs', [{ type: 'link', attrs: { href } }]));

	it.each([
		['a bare https url', doc(text('see https://example.com/x now')), true],
		['a www address', doc(text('see www.example.com')), true],
		['a link mark', link('https://example.com'), true],
		['a link inside a list', listWith('https://example.com'), true],
		['a link mark with an unsafe target', link('javascript:alert(1)'), false],
		[
			'an unsafe link mark around a url',
			doc(text('https://example.com', [{ type: 'link', attrs: { href: 'javascript:x' } }])),
			false
		],
		['a url in code', doc(text('https://example.com', [{ type: 'code' }])), false],
		[
			'a url in a code block',
			{ type: 'doc', content: [{ type: 'codeBlock', content: [text('https://example.com')] }] },
			false
		],
		['file names that look like domains', doc(text('Node.js and package.json')), false],
		['plain text', doc(text('hello there')), false],
		['a legacy string with a url', 'look at https://example.com', true],
		['a legacy string without one', 'just words', false],
		['a json string with a url', JSON.stringify(doc(text('https://example.com'))), true],
		['no content', null, false]
	])('%s', (_, content, expected) => {
		expect(contentHasLink(content)).toBe(expected);
	});

	it('ignores link previews', () => {
		const message = {
			user_id: 1,
			content: doc(text('no link here')),
			embeds: [{ url: 'https://example.com' }]
		};
		expect(messageFacets(message as never)).toEqual({ fromKey: 'user:1' });
	});

	it('sets hasLink on the message facets', () => {
		expect(facets([], doc(text('https://example.com')))).toEqual({
			fromKey: 'user:5',
			hasLink: 1
		});
	});
});

function listWith(url: string) {
	return {
		type: 'doc',
		content: [
			{
				type: 'bulletList',
				content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [text(url)] }] }]
			}
		]
	};
}
