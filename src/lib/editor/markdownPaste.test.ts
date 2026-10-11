import { describe, expect, it } from 'vitest';
import { getSchema } from '@tiptap/core';
import { Fragment, Slice } from '@tiptap/pm/model';
import { EditorState, TextSelection, type Transaction } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import { contentExtensions } from './extensions';
import { handleMarkdownPaste, markdownPasteSlice } from './markdownPaste';

const schema = getSchema(contentExtensions);

const SAMPLE = '# Title\n\n- one\n- two\n\n1. first\n2. second\n\n> quoted';

function stateWith(doc: object, inside = 1) {
	const state = EditorState.create({ schema, doc: schema.nodeFromJSON(doc) });
	return state.apply(state.tr.setSelection(TextSelection.create(state.doc, inside)));
}

const emptyParagraph = { type: 'doc', content: [{ type: 'paragraph' }] };
const emptyCode = { type: 'doc', content: [{ type: 'codeBlock', attrs: { language: null } }] };

// What ProseMirror hands handlePaste for a plain-text clipboard.
const plainSlice = (text: string) =>
	new Slice(
		Fragment.from(
			text
				.split(/\n+/)
				.map((line) => schema.nodes.paragraph.create(null, line ? schema.text(line) : null))
		),
		1,
		1
	);

function paste(
	state: EditorState,
	clipboard: { plain: string; html?: string; vscode?: string },
	view: { shiftKey?: boolean; lastKeyCode?: number } = {}
) {
	let sent: Transaction | null = null;
	const fake = {
		state,
		input: view,
		dispatch: (tr: Transaction) => (sent = tr)
	} as unknown as EditorView;
	const event = {
		clipboardData: {
			getData: (type: string) =>
				type === 'text/plain'
					? clipboard.plain
					: type === 'text/html'
						? (clipboard.html ?? '')
						: type === 'vscode-editor-data'
							? (clipboard.vscode ?? '')
							: ''
		}
	} as unknown as ClipboardEvent;
	const handled = handleMarkdownPaste(fake, event, plainSlice(clipboard.plain));
	const tr = sent as Transaction | null;
	return { handled, tr, doc: tr ? state.apply(tr).doc.toJSON() : null };
}

const types = (doc: { content?: { type: string }[] } | null) =>
	(doc?.content ?? []).map((node) => node.type);

describe('markdown paste', () => {
	it('turns the sample into the nodes typing gives', () => {
		const { handled, doc, tr } = paste(stateWith(emptyParagraph), { plain: SAMPLE });

		expect(handled).toBe(true);
		expect(types(doc).slice(0, 4)).toEqual(['heading', 'bulletList', 'orderedList', 'blockquote']);
		expect(doc.content[0].attrs.level).toBe(1);
		expect(doc.content[1].content).toHaveLength(2);
		expect(doc.content[2].content).toHaveLength(2);
		expect(tr?.getMeta('uiEvent')).toBe('paste');
	});

	it('produces documents the schema accepts', () => {
		const slice = markdownPasteSlice(stateWith(emptyParagraph), SAMPLE);
		expect(() => slice?.content.forEach((node) => node.check())).not.toThrow();
	});

	it('leaves a table to the editor and still sends', () => {
		const table = '| a | b |\n|---|---|\n| 1 | 2 |';
		expect(paste(stateWith(emptyParagraph), { plain: table }).handled).toBe(false);
	});

	it('leaves an image to the editor', () => {
		const image = '![x](https://example.com/a.png)';
		expect(paste(stateWith(emptyParagraph), { plain: image }).handled).toBe(false);
	});

	it('still reads a fenced block', () => {
		const { doc } = paste(stateWith(emptyParagraph), { plain: '```js\nlet a = 1;\n```' });
		expect(doc.content[0]).toMatchObject({
			type: 'codeBlock',
			attrs: { language: 'js' },
			content: [{ type: 'text', text: 'let a = 1;' }]
		});
	});

	it('pastes literally inside a code block', () => {
		const result = paste(stateWith(emptyCode), { plain: SAMPLE });
		expect(result.handled).toBe(false);
		expect(markdownPasteSlice(stateWith(emptyCode), SAMPLE)).toBeNull();
	});

	it('does not read markdown from content copied out of the editor', () => {
		const copied = '<p data-pm-slice="1 1 []"># Title</p>';
		expect(paste(stateWith(emptyParagraph), { plain: '# Title', html: copied }).handled).toBe(
			false
		);
	});

	it('leaves a paste from VS Code to the code block handler', () => {
		const python = '# comment\nprint(1)\n- not a list';
		const result = paste(stateWith(emptyParagraph), {
			plain: python,
			vscode: '{"mode":"python"}'
		});
		expect(result.handled).toBe(false);
		expect(result.tr).toBeNull();
	});

	describe('rich text', () => {
		const html = '<h1>Title</h1><ul><li>one</li></ul>';

		it('keeps its own formatting instead of reading headings and lists', () => {
			const result = paste(stateWith(emptyParagraph), { plain: '# Title\n- one', html });
			expect(result.handled).toBe(false);
		});

		it('still reads a fenced block from the plain text', () => {
			const { handled, doc } = paste(stateWith(emptyParagraph), {
				plain: '```js\nlet a = 1;\n```',
				html: '<pre>```js\nlet a = 1;\n```</pre>'
			});
			expect(handled).toBe(true);
			expect(types(doc).slice(0, 1)).toEqual(['codeBlock']);
		});

		it('treats blank html as plain text', () => {
			const { doc } = paste(stateWith(emptyParagraph), { plain: '# Title', html: ' ' });
			expect(types(doc)).toEqual(['heading']);
		});
	});

	describe('Ctrl+Shift+V', () => {
		it('inserts the clipboard text as it is, without paste rules', () => {
			const { handled, doc, tr } = paste(
				stateWith(emptyParagraph),
				{ plain: SAMPLE },
				{ shiftKey: true, lastKeyCode: 86 }
			);

			expect(handled).toBe(true);
			expect(new Set(types(doc))).toEqual(new Set(['paragraph']));
			expect(doc.content[0].content[0].text).toBe('# Title');
			expect(tr?.getMeta('uiEvent')).toBeUndefined();
		});

		it('is the default paste for Shift+Insert', () => {
			const { doc } = paste(
				stateWith(emptyParagraph),
				{ plain: '# Title' },
				{ shiftKey: true, lastKeyCode: 45 }
			);
			expect(types(doc)).toEqual(['heading']);
		});
	});
});
