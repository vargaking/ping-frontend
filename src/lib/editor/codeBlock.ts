import { mergeAttributes } from '@tiptap/core';
import CodeBlock from '@tiptap/extension-code-block';

// The language is user text, so it stays out of the DOM (the stock block writes it into a class).
export const MessageCodeBlock = CodeBlock.extend({
	renderHTML({ HTMLAttributes }) {
		return ['pre', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes), ['code', 0]];
	}
});
