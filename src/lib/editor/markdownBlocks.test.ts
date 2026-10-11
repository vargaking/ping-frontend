import { describe, expect, it } from 'vitest';
import { fenceOpening, markdownToBlocks, type BlockRule } from './markdownBlocks';
import { withoutTrailingEmptyParagraphs } from './trimDocument';

const paragraph = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] });
const code = (text: string | null, language: string | null = null) => ({
	type: 'codeBlock',
	attrs: { language },
	...(text ? { content: [{ type: 'text', text }] } : {})
});

describe('markdownToBlocks', () => {
	it('reads a fence with a language', () => {
		expect(markdownToBlocks('```js\nlet a = 1;\nlet b = 2;\n```')).toEqual([
			code('let a = 1;\nlet b = 2;', 'js')
		]);
	});

	it('reads a fence without a language', () => {
		expect(markdownToBlocks('```\nplain\n```')).toEqual([code('plain')]);
	});

	it('takes the rest of the text when the fence is never closed', () => {
		expect(markdownToBlocks('```py\nprint(1)\nprint(2)')).toEqual([
			code('print(1)\nprint(2)', 'py')
		]);
	});

	it('reads two blocks in one paste', () => {
		expect(markdownToBlocks('```a\none\n```\n```b\ntwo\n```')).toEqual([
			code('one', 'a'),
			code('two', 'b')
		]);
	});

	it('keeps text before and after a block as paragraphs', () => {
		expect(markdownToBlocks('before\n```py\nx = 1\n```\nafter')).toEqual([
			paragraph('before'),
			code('x = 1', 'py'),
			paragraph('after')
		]);
	});

	it('reads a one-line block', () => {
		expect(markdownToBlocks('```const a = 1```')).toEqual([code('const a = 1')]);
	});

	it('puts a first line that is not a language into the block', () => {
		expect(markdownToBlocks('```const a = 1;\nconst b = 2;\n```')).toEqual([
			code('const a = 1;\nconst b = 2;')
		]);
	});

	it('keeps text before a closing fence on the same line', () => {
		expect(markdownToBlocks('```js\nlet a;```')).toEqual([code('let a;', 'js')]);
	});

	it('drops blank lines outside blocks and keeps them inside', () => {
		expect(markdownToBlocks('one\n\n\n```\na\n\nb\n```\n\ntwo')).toEqual([
			paragraph('one'),
			code('a\n\nb'),
			paragraph('two')
		]);
	});

	it('gives an empty fence no content', () => {
		expect(markdownToBlocks('```\n```')).toEqual([code(null)]);
	});

	it('returns null when nothing is a block', () => {
		expect(markdownToBlocks('just\nsome lines')).toBeNull();
		expect(markdownToBlocks('')).toBeNull();
	});

	it('reads CRLF and CR line endings', () => {
		expect(markdownToBlocks('```js\r\na\r\n```\r\nb')).toEqual([code('a', 'js'), paragraph('b')]);
		expect(markdownToBlocks('```js\ra\r```')).toEqual([code('a', 'js')]);
	});

	it('lets any rule claim lines', () => {
		const rule: BlockRule = (lines, start) =>
			lines[start] === '---' ? { node: { type: 'horizontalRule' }, next: start + 1 } : null;
		expect(markdownToBlocks('a\n---\nb', [rule])).toEqual([
			paragraph('a'),
			{ type: 'horizontalRule' },
			paragraph('b')
		]);
	});
});

const heading = (level: number, text: string) => ({
	type: 'heading',
	attrs: { level },
	content: [{ type: 'text', text }]
});
const item = (text: string, ...nested: object[]) => ({
	type: 'listItem',
	content: [paragraph(text), ...nested]
});
const bullets = (...items: object[]) => ({ type: 'bulletList', content: items });
const numbers = (items: object[], start?: number) => ({
	type: 'orderedList',
	...(start ? { attrs: { start } } : {}),
	content: items
});

describe('markdownToBlocks with markdown blocks', () => {
	it('reads headings, lists and quotes from a pasted document', () => {
		const text = '# Title\n\n- one\n- two\n\n1. first\n2. second\n\n> quoted';
		expect(markdownToBlocks(text)).toEqual([
			heading(1, 'Title'),
			bullets(item('one'), item('two')),
			numbers([item('first'), item('second')]),
			{ type: 'blockquote', content: [paragraph('quoted')] }
		]);
	});

	it('reads heading levels one to six and nothing deeper', () => {
		expect(markdownToBlocks('###### six')).toEqual([heading(6, 'six')]);
		expect(markdownToBlocks('####### seven')).toBeNull();
	});

	it('needs a space after the hash and some text', () => {
		expect(markdownToBlocks('#hashtag')).toBeNull();
		expect(markdownToBlocks('# ')).toBeNull();
	});

	it('reads * and + bullets, and keeps inline markup for the paste rules', () => {
		expect(markdownToBlocks('* **bold** one\n+ two')).toEqual([
			bullets(item('**bold** one'), item('two'))
		]);
	});

	it('joins list items separated by blank lines', () => {
		expect(markdownToBlocks('- a\n\n- b')).toEqual([bullets(item('a'), item('b'))]);
	});

	it('starts an ordered list at its first number', () => {
		expect(markdownToBlocks('3. c\n4) d')).toEqual([numbers([item('c'), item('d')], 3)]);
	});

	it('splits a list when the kind changes', () => {
		expect(markdownToBlocks('- a\n1. b')).toEqual([bullets(item('a')), numbers([item('b')])]);
	});

	it('nests indented items', () => {
		expect(markdownToBlocks('- a\n  - b\n  - c\n- d')).toEqual([
			bullets(item('a', bullets(item('b'), item('c'))), item('d'))
		]);
	});

	it('ends a list at the first line that is not an item', () => {
		expect(markdownToBlocks('- a\ntext\n- b')).toEqual([
			bullets(item('a')),
			paragraph('text'),
			bullets(item('b'))
		]);
	});

	it('keeps task list items as text', () => {
		expect(markdownToBlocks('- [ ] todo\n- [x] done')).toBeNull();
		expect(markdownToBlocks('- a\n- [ ] todo')).toEqual([
			bullets(item('a')),
			paragraph('- [ ] todo')
		]);
	});

	it('reads each quoted line as a paragraph of one quote', () => {
		expect(markdownToBlocks('> a\n>\n> b')).toEqual([
			{ type: 'blockquote', content: [paragraph('a'), paragraph('b')] }
		]);
		expect(markdownToBlocks('>text')).toBeNull();
	});

	it('reads horizontal rules before bullets', () => {
		const rule = { type: 'horizontalRule' };
		expect(markdownToBlocks('a\n---\n***\n___\n- - -\nb')).toEqual([
			paragraph('a'),
			rule,
			rule,
			rule,
			rule,
			paragraph('b')
		]);
	});

	it('leaves tables, images, html and plain text alone', () => {
		expect(markdownToBlocks('| a | b |\n|---|---|\n| 1 | 2 |')).toBeNull();
		expect(markdownToBlocks('![x](https://example.com/a.png)')).toBeNull();
		expect(markdownToBlocks('<b>hi</b>\n<ul><li>x</li></ul>')).toBeNull();
	});

	it('keeps a fenced block whole when it holds markdown', () => {
		expect(markdownToBlocks('```\n# not a heading\n- not a list\n```')).toEqual([
			code('# not a heading\n- not a list')
		]);
	});
});

describe('fenceOpening', () => {
	it('accepts a bare fence and a fence with a language', () => {
		expect(fenceOpening('```')).toEqual({ language: null });
		expect(fenceOpening('```js')).toEqual({ language: 'js' });
		expect(fenceOpening('```c++')).toEqual({ language: 'c++' });
	});

	it('ignores spaces around the language', () => {
		expect(fenceOpening('```  py  ')).toEqual({ language: 'py' });
	});

	it('rejects anything else', () => {
		expect(fenceOpening('```js x')).toBeNull();
		expect(fenceOpening('x```')).toBeNull();
		expect(fenceOpening('``')).toBeNull();
		expect(fenceOpening('')).toBeNull();
		expect(fenceOpening('```"><img src=x>')).toBeNull();
	});
});

describe('withoutTrailingEmptyParagraphs', () => {
	const empty = { type: 'paragraph' };

	it('drops empty paragraphs at the end', () => {
		const doc = {
			type: 'doc',
			content: [code('x', 'js'), empty, { type: 'paragraph', content: [{ type: 'hardBreak' }] }]
		};
		expect(withoutTrailingEmptyParagraphs(doc)).toEqual({
			type: 'doc',
			content: [code('x', 'js')]
		});
	});

	it('keeps a lone empty paragraph', () => {
		const doc = { type: 'doc', content: [empty, empty] };
		expect(withoutTrailingEmptyParagraphs(doc)).toEqual({ type: 'doc', content: [empty] });
	});

	it('keeps empty paragraphs in the middle and paragraphs with text', () => {
		const doc = { type: 'doc', content: [paragraph('a'), empty, paragraph('b')] };
		expect(withoutTrailingEmptyParagraphs(doc)).toBe(doc);
	});
});
