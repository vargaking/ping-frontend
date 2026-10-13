import { describe, expect, it } from 'vitest';
import { findInviteCode, ownInviteCode } from './messageInvites';

const ORIGIN = 'https://ping.example.com';
const CODE = '3f2b8c1e-5d4a-4e6f-9a7b-0c1d2e3f4a5b';
const LINK = `${ORIGIN}/invite/${CODE}`;
const OTHER = '11111111-2222-4333-8444-555555555555';

type Mark = { type: string; attrs?: Record<string, unknown> };
const text = (value: string, marks?: Mark[]) => ({
	type: 'text',
	text: value,
	...(marks ? { marks } : {})
});
const linked = (value: string, href: string) => text(value, [{ type: 'link', attrs: { href } }]);
const doc = (...inline: object[]) => ({
	type: 'doc',
	content: [{ type: 'paragraph', content: inline }]
});

describe('ownInviteCode', () => {
	it.each([
		[LINK, CODE],
		[`${LINK}/`, CODE],
		[`${LINK}?ref=dm`, CODE],
		[`${LINK}/#top`, CODE],
		[`${ORIGIN}/invite/${CODE.toUpperCase()}`, CODE]
	])('reads the code from %s', (href, expected) => {
		expect(ownInviteCode(href, ORIGIN)).toBe(expected);
	});

	it.each([
		['another origin', `https://other.example.com/invite/${CODE}`],
		['a lookalike host', `https://ping.example.com.evil.com/invite/${CODE}`],
		['a different scheme', `http://ping.example.com/invite/${CODE}`],
		['a different port', `https://ping.example.com:8443/invite/${CODE}`],
		['a path that is not a uuid', `${ORIGIN}/invite/welcome`],
		['a deeper path', `${ORIGIN}/invite/${CODE}/extra`],
		['another route', `${ORIGIN}/app/invite/${CODE}`],
		['not a link', 'invite me'],
		['not a string', 42]
	])('ignores %s', (_, href) => {
		expect(ownInviteCode(href, ORIGIN)).toBeNull();
	});
});

describe('findInviteCode', () => {
	it('finds a link mark', () => {
		expect(findInviteCode(doc(linked('join us', LINK)), ORIGIN)).toBe(CODE);
	});

	it('finds a bare url in text', () => {
		expect(findInviteCode(doc(text(`come in: ${LINK}/?x=1#y.`)), ORIGIN)).toBe(CODE);
	});

	it('reads stored json strings and legacy plain strings', () => {
		expect(findInviteCode(JSON.stringify(doc(text(LINK))), ORIGIN)).toBe(CODE);
		expect(findInviteCode(`see ${LINK}`, ORIGIN)).toBe(CODE);
	});

	it('takes the first invite link of two', () => {
		const second = `${ORIGIN}/invite/${OTHER}`;
		expect(findInviteCode(doc(text(`${LINK} and ${second}`)), ORIGIN)).toBe(CODE);
		expect(findInviteCode(doc(linked('b', second), text(` ${LINK}`)), ORIGIN)).toBe(OTHER);
	});

	it('skips links that are not invites on this origin', () => {
		const foreign = `https://other.example.com/invite/${OTHER}`;
		expect(findInviteCode(doc(text(`${foreign} then ${LINK}`)), ORIGIN)).toBe(CODE);
		expect(findInviteCode(doc(text(foreign)), ORIGIN)).toBeNull();
	});

	it('uses the link target, not the shown text', () => {
		expect(findInviteCode(doc(linked(LINK, 'https://evil.example.com/')), ORIGIN)).toBeNull();
	});

	it.each([
		['inline code', doc(text(LINK, [{ type: 'code' }]))],
		['a code block', { type: 'doc', content: [{ type: 'codeBlock', content: [text(LINK)] }] }],
		['plain words', doc(text('no links here'))],
		['no content', { type: 'doc' }],
		['null', null]
	])('finds nothing in %s', (_, content) => {
		expect(findInviteCode(content, ORIGIN)).toBeNull();
	});

	it('counts a link mark that is also code, as the message renders it', () => {
		const marks = [{ type: 'link', attrs: { href: LINK } }, { type: 'code' }];
		expect(findInviteCode(doc(text('x', marks)), ORIGIN)).toBe(CODE);
	});

	it('finds a link inside a nested list', () => {
		const list = {
			type: 'doc',
			content: [
				{
					type: 'bulletList',
					content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [text(LINK)] }] }]
				}
			]
		};
		expect(findInviteCode(list, ORIGIN)).toBe(CODE);
	});
});
