import { Extension, InputRule, PasteRule, type Range } from '@tiptap/core';
import type { MarkType } from '@tiptap/pm/model';
import type { Transaction } from '@tiptap/pm/state';
import { safeHref } from '$lib/utils/linkify';

// One level of parentheses is allowed in the target, for addresses like /wiki/Foo_(bar).
const MARKDOWN_LINK = String.raw`(?<!!)\[(?=[^\[\]]*[^\[\]\s])([^\[\]]+)\]\(((?:[^()\s]|\([^()\s]*\))+)\)`;

/** `[text](url)` at the end of the typed text. */
export const markdownLinkTyped = new RegExp(`${MARKDOWN_LINK}$`);

/** Every `[text](url)` in pasted text. */
export const markdownLinkPasted = new RegExp(MARKDOWN_LINK, 'g');

/** Replaces `[` + label + `](url)` in `range` with the label, marked as a link. */
function linkLabel(
	tr: Transaction,
	type: MarkType,
	range: Range,
	label: string,
	href: string
): boolean {
	if (!safeHref(href)) return false;

	const labelStart = range.from + 1;
	const labelEnd = labelStart + label.length;
	if (tr.doc.textBetween(labelStart, labelEnd) !== label) return false;

	tr.delete(labelEnd, range.to).delete(range.from, labelStart);
	tr.addMark(range.from, range.from + label.length, type.create({ href }));
	return true;
}

export function markdownLinkInputRule(type: MarkType): InputRule {
	return new InputRule({
		find: markdownLinkTyped,
		handler: ({ state, range, match }) => {
			const { tr } = state;
			if (!linkLabel(tr, type, range, match[1], match[2])) return null;
			tr.removeStoredMark(type);
		}
	});
}

export function markdownLinkPasteRule(type: MarkType): PasteRule {
	return new PasteRule({
		find: markdownLinkPasted,
		handler: ({ state, range, match }) => {
			// Returning null would drop every other link in the same paste.
			linkLabel(state.tr, type, range, match[1], match[2]);
		}
	});
}

/** Turns `[text](url)` into a link as it is typed and when it is pasted. */
export const MarkdownLinks = Extension.create({
	name: 'markdownLinks',
	priority: 1000,

	addInputRules() {
		return [markdownLinkInputRule(this.editor.schema.marks.link)];
	},

	addPasteRules() {
		return [markdownLinkPasteRule(this.editor.schema.marks.link)];
	}
});
