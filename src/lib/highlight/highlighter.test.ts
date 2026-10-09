import { describe, expect, it } from 'vitest';
import { loadHighlighter } from './highlighter';

const KINDS = [
	'keyword',
	'string',
	'number',
	'comment',
	'function',
	'type',
	'variable',
	'meta',
	'punctuation'
];

describe('loadHighlighter', () => {
	it('splits code into tokens that add up to the input', async () => {
		const highlight = await loadHighlighter();
		const samples: [string, string][] = [
			['javascript', 'const a = "x";\n\tif (a) {\n\t\treturn 1; // done\n\t}\n'],
			['python', 'def f(x):\n    return x  # tab\there\n'],
			['xml', '<a href="x">y &amp; z</a>'],
			['json', '{"a": [1, 2, null]}'],
			['javascript', '']
		];
		for (const [language, code] of samples) {
			expect(
				highlight(code, language)
					.map((token) => token.text)
					.join('')
			).toBe(code);
		}
	});

	it('only uses the fixed set of kinds and colours code', async () => {
		const highlight = await loadHighlighter();
		const tokens = highlight('const a = "x"; // note', 'javascript');
		for (const token of tokens)
			expect(token.kind === null || KINDS.includes(token.kind)).toBe(true);
		expect(tokens.find((token) => token.text === 'const')?.kind).toBe('keyword');
		expect(tokens.find((token) => token.text === '"x"')?.kind).toBe('string');
		expect(tokens.find((token) => token.text === '// note')?.kind).toBe('comment');
	});

	it('loads once', async () => {
		expect(await loadHighlighter()).toBe(await loadHighlighter());
	});
});
