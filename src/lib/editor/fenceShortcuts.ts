import type { Editor } from '@tiptap/core';
import { Selection } from '@tiptap/pm/state';
import { fenceOpening } from './markdownBlocks';

const FENCE = '```';

/** Enter at the end of a "```lang" line turns that line into an empty code block. */
export function openFencedCode(editor: Editor): boolean {
	const { selection } = editor.state;
	const { $from } = selection;
	const paragraph = $from.parent;
	if (!selection.empty || paragraph.type.name !== 'paragraph') return false;
	if ($from.parentOffset !== paragraph.content.size) return false;

	let lineText = '';
	let lineStart = $from.start();
	let breakStart: number | null = null;
	let plainLine = true;
	for (let i = 0, offset = 0; i < paragraph.childCount; i++) {
		const child = paragraph.child(i);
		if (child.type.name === 'hardBreak') {
			lineText = '';
			plainLine = true;
			breakStart = $from.start() + offset;
			lineStart = breakStart + child.nodeSize;
		} else if (child.isText) {
			lineText += child.text;
		} else {
			plainLine = false;
		}
		offset += child.nodeSize;
	}

	const opening = plainLine ? fenceOpening(lineText) : null;
	if (!opening) return false;

	const chain = editor.chain().deleteRange({ from: breakStart ?? lineStart, to: $from.pos });
	if (breakStart !== null) chain.splitBlock();
	return chain.setNode('codeBlock', { language: opening.language }).run();
}

/** Enter at the end of a lone "```" line ends the code block and drops that line. */
export function closeFencedCode(editor: Editor): boolean {
	const { selection } = editor.state;
	const { $from } = selection;
	const block = $from.parent;
	if (!selection.empty || block.type.name !== 'codeBlock') return false;
	if ($from.parentOffset !== block.content.size) return false;

	const text = block.textContent;
	const lineBreak = text.lastIndexOf('\n');
	if (text.slice(lineBreak + 1).trimEnd() !== FENCE) return false;

	const chain = editor
		.chain()
		.deleteRange({ from: $from.start() + Math.max(lineBreak, 0), to: $from.pos });
	if (lineBreak < 0) return chain.setParagraph().run();

	return chain
		.command(({ tr, commands }) => {
			// The editor already keeps an empty paragraph after a final block; step into it.
			const after = tr.selection.$from.after();
			if (!tr.doc.nodeAt(after)) return commands.exitCode();
			tr.setSelection(Selection.near(tr.doc.resolve(after)));
			return true;
		})
		.run();
}
