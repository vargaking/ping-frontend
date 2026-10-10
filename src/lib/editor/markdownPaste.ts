import { Extension } from '@tiptap/core';
import { Fragment, Slice } from '@tiptap/pm/model';
import { Plugin, type EditorState } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import { markdownToBlocks } from './markdownBlocks';

/** The blocks of a pasted text, or null when the editor's own paste should handle it. */
export function markdownPasteSlice(state: EditorState, text: string): Slice | null {
	if (state.selection.$from.parent.type.spec.code) return null;

	const blocks = markdownToBlocks(text);
	if (!blocks) return null;

	const fragment = Fragment.fromArray(blocks.map((block) => state.schema.nodeFromJSON(block)));
	return new Slice(fragment, 0, 0);
}

// ProseMirror reads Shift this way for its own plain-text paste, and the paste event doesn't carry it.
function isPlainPaste(view: EditorView): boolean {
	const input = (view as unknown as { input?: { shiftKey?: boolean; lastKeyCode?: number | null } })
		.input;
	const insertKey = 45;
	return !!input?.shiftKey && input.lastKeyCode !== insertKey;
}

export function handleMarkdownPaste(
	view: EditorView,
	event: ClipboardEvent,
	slice: Slice
): boolean {
	if (isPlainPaste(view)) {
		if (!slice.size) return false;
		const { tr } = view.state;
		const single = slice.openStart === 0 && slice.openEnd === 0 && slice.content.childCount === 1;
		if (single) tr.replaceSelectionWith(slice.content.firstChild!, true);
		else tr.replaceSelection(slice);
		// No uiEvent, so the editor's inline paste rules leave the text as it is too.
		view.dispatch(tr.scrollIntoView().setMeta('paste', true));
		return true;
	}

	const clipboard = event.clipboardData;
	if (!clipboard || clipboard.getData('text/html').includes('data-pm-slice')) return false;

	const pasted = markdownPasteSlice(view.state, clipboard.getData('text/plain'));
	if (!pasted) return false;

	view.dispatch(
		view.state.tr
			.replaceSelection(pasted)
			.scrollIntoView()
			.setMeta('paste', true)
			.setMeta('uiEvent', 'paste')
	);
	return true;
}

/** Turns pasted markdown into blocks. Each block syntax is a rule in markdownBlocks. */
export const MarkdownPaste = Extension.create({
	name: 'markdownPaste',
	priority: 1000,

	addProseMirrorPlugins() {
		return [new Plugin({ props: { handlePaste: handleMarkdownPaste } })];
	}
});
