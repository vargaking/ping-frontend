import { Extension } from '@tiptap/core';
import { Fragment, Slice } from '@tiptap/pm/model';
import { Plugin } from '@tiptap/pm/state';
import { markdownToBlocks } from './markdownBlocks';

/** Turns pasted markdown into blocks. Each block syntax is a rule in markdownBlocks. */
export const MarkdownPaste = Extension.create({
	name: 'markdownPaste',
	priority: 1000,

	addProseMirrorPlugins() {
		// ProseMirror reads Shift the same way for its own plain-text paste; handlePaste can't see it.
		let plainPaste = false;

		return [
			new Plugin({
				props: {
					handleKeyDown: (_view, event) => {
						plainPaste =
							event.shiftKey && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'v';
						return false;
					},
					handleDOMEvents: {
						keyup: (_view, event) => {
							if (event.key === 'Shift') plainPaste = false;
							return false;
						}
					},
					handlePaste: (view, event) => {
						if (plainPaste || view.state.selection.$from.parent.type.spec.code) return false;

						const text = event.clipboardData?.getData('text/plain');
						if (!text) return false;

						const blocks = markdownToBlocks(text);
						if (!blocks) return false;

						const { schema } = view.state;
						const fragment = Fragment.fromArray(blocks.map((block) => schema.nodeFromJSON(block)));
						view.dispatch(
							view.state.tr.replaceSelection(new Slice(fragment, 0, 0)).scrollIntoView()
						);
						return true;
					}
				}
			})
		];
	}
});
