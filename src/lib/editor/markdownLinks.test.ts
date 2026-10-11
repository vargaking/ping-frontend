import { describe, expect, it } from 'vitest';
import { getSchema } from '@tiptap/core';
import { EditorState } from '@tiptap/pm/state';
import { contentExtensions } from './extensions';
import { markdownLinkInputRule, markdownLinkPasteRule } from './markdownLinks';

const schema = getSchema(contentExtensions);
const link = schema.marks.link;

const stateFor = (text: string) => {
	const doc = schema.nodeFromJSON({
		type: 'doc',
		content: [{ type: 'paragraph', content: [{ type: 'text', text }] }]
	});
	return EditorState.create({ schema, doc });
};

type RuleHandler = (props: never) => unknown;

/** Types `)` after `before`, the way the editor runs an input rule. */
function typeClosingParen(before: string) {
	const state = stateFor(before);
	const rule = markdownLinkInputRule(link);
	const cursor = 1 + before.length;
	const match = rule.find instanceof RegExp ? rule.find.exec(`${before})`) : null;
	if (!match) return null;

	const tr = state.tr;
	const range = { from: cursor - (match[0].length - 1), to: cursor };
	const result = (rule.handler as RuleHandler)({ state: { tr }, range, match } as never);
	return result === null ? null : tr;
}

/** Runs the paste rule over a pasted paragraph. */
function pasteText(text: string, state = stateFor(text)) {
	const rule = markdownLinkPasteRule(link);
	const tr = state.tr;
	if (!(rule.find instanceof RegExp)) throw new Error('expected a regex');

	for (const match of text.matchAll(rule.find)) {
		const from = tr.mapping.map(1 + match.index);
		const to = tr.mapping.map(1 + match.index + match[0].length);
		(rule.handler as RuleHandler)({ state: { tr }, range: { from, to }, match } as never);
	}
	return tr;
}

const runs = (tr: { doc: { toJSON: () => unknown } } | null) => {
	const doc = tr?.doc.toJSON() as { content: { content: object[] }[] };
	return doc.content[0].content;
};

const linked = (text: string, href: string) => ({
	type: 'text',
	text,
	marks: [{ type: 'link', attrs: expect.objectContaining({ href }) }]
});

describe('markdown link as typed', () => {
	it('links the text when the closing paren is typed', () => {
		const tr = typeClosingParen('[docs](https://example.com');
		expect(runs(tr)).toEqual([linked('docs', 'https://example.com')]);
	});

	it('keeps the text around it', () => {
		const tr = typeClosingParen('see [docs](https://example.com/a?b=1#c');
		expect(runs(tr)).toEqual([
			{ type: 'text', text: 'see ' },
			linked('docs', 'https://example.com/a?b=1#c')
		]);
	});

	it('takes a target with parentheses of its own on the last paren', () => {
		expect(typeClosingParen('[x](https://en.wikipedia.org/wiki/Foo_(bar')).toBeNull();
		const tr = typeClosingParen('[x](https://en.wikipedia.org/wiki/Foo_(bar)');
		expect(runs(tr)).toEqual([linked('x', 'https://en.wikipedia.org/wiki/Foo_(bar)')]);
	});

	it.each([
		'[x](javascript:alert(1)',
		'[x](data:text/html,hi',
		'[x](ftp://example.com',
		'[x](example.com',
		'[x](http://intranet',
		'[x](/relative'
	])('leaves %s as text', (before) => {
		expect(typeClosingParen(before)).toBeNull();
	});

	it('leaves an image as text', () => {
		expect(typeClosingParen('![x](https://example.com/a.png')).toBeNull();
	});

	it('needs text in the brackets', () => {
		expect(typeClosingParen('[](https://example.com')).toBeNull();
		expect(typeClosingParen('[ ](https://example.com')).toBeNull();
	});

	it('leaves a link typed inside an open backtick span as text', () => {
		expect(typeClosingParen('use `[docs](https://example.com')).toBeNull();
	});

	it('links again once the backtick span is closed', () => {
		const tr = typeClosingParen('`a` then [docs](https://example.com');
		expect(runs(tr)).toEqual([
			{ type: 'text', text: '`a` then ' },
			linked('docs', 'https://example.com')
		]);
	});

	it('does not leave the link on for the next character', () => {
		const tr = typeClosingParen('[docs](https://example.com');
		expect(tr?.storedMarks?.some((mark) => mark.type === link) ?? false).toBe(false);
	});
});

describe('markdown link as pasted', () => {
	it('links the text and drops the brackets', () => {
		expect(runs(pasteText('[docs](https://example.com)'))).toEqual([
			linked('docs', 'https://example.com')
		]);
	});

	it('converts every link in the paste', () => {
		expect(runs(pasteText('a [one](https://a.example) b [two](http://b.example) c'))).toEqual([
			{ type: 'text', text: 'a ' },
			linked('one', 'https://a.example'),
			{ type: 'text', text: ' b ' },
			linked('two', 'http://b.example'),
			{ type: 'text', text: ' c' }
		]);
	});

	it('keeps a javascript: link as text next to a good one', () => {
		expect(runs(pasteText('[bad](javascript:alert(1)) [ok](https://example.com)'))).toEqual([
			{ type: 'text', text: '[bad](javascript:alert(1)) ' },
			linked('ok', 'https://example.com')
		]);
	});

	it('leaves an image as text', () => {
		expect(runs(pasteText('![x](https://example.com/a.png)'))).toEqual([
			{ type: 'text', text: '![x](https://example.com/a.png)' }
		]);
	});

	it('leaves a link inside a backtick pair as text', () => {
		const text = 'Write `[text](https://example.com)` to link';
		expect(runs(pasteText(text))).toEqual([{ type: 'text', text }]);
	});

	it('still links outside the backtick pair', () => {
		expect(runs(pasteText('`a` [one](https://a.example) `b`'))).toEqual([
			{ type: 'text', text: '`a` ' },
			linked('one', 'https://a.example'),
			{ type: 'text', text: ' `b`' }
		]);
	});

	it('leaves a link inside pasted code formatting as text', () => {
		const doc = schema.nodeFromJSON({
			type: 'doc',
			content: [
				{
					type: 'paragraph',
					content: [
						{ type: 'text', text: '[text](https://example.com)', marks: [{ type: 'code' }] }
					]
				}
			]
		});
		const state = EditorState.create({ schema, doc });
		expect(runs(pasteText('[text](https://example.com)', state))).toEqual([
			{ type: 'text', text: '[text](https://example.com)', marks: [{ type: 'code' }] }
		]);
	});
});
