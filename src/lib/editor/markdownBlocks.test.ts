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
