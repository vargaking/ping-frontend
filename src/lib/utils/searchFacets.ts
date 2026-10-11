import type { JSONContent } from '@tiptap/core';
import type { Attachment } from '$lib/types/attachment.types';
import type { StoredPost } from '$lib/types/localHistory.types';
import type { MessageType } from '$lib/types/messages.types';
import { effectiveMarks, linkify, safeHref } from '$lib/utils/linkify';
import { parseMessageContent } from '$lib/utils/messageContent';
import { normalizeText } from '$lib/utils/searchText';

export type HasKind = 'file' | 'image' | 'video' | 'link';

export const HAS_FIELD = {
	file: 'hasFile',
	image: 'hasImage',
	video: 'hasVideo',
	link: 'hasLink'
} as const;

export type HasField = (typeof HAS_FIELD)[HasKind];

export const HAS_FIELDS: HasField[] = Object.values(HAS_FIELD);

/** Lowercased, accents dropped, trimmed, inner whitespace collapsed. */
export function normalizeName(name: string): string {
	return normalizeText(name).trim().replace(/\s+/g, ' ');
}

/** What `from:` matches on: the account, or the imported author's name. */
export function fromKeyOf(m: Pick<MessageType, 'user_id' | 'imported_author'>): string {
	return m.imported_author ? `name:${normalizeName(m.imported_author.name)}` : `user:${m.user_id}`;
}

export function postFromKey(post: StoredPost): string | null {
	if (post.imported_author) return `name:${normalizeName(post.imported_author.name)}`;
	return post.author_id != null ? `user:${post.author_id}` : null;
}

function contentType(a: Attachment): string {
	return (a.content_type ?? '').toLowerCase();
}

export function attachmentKind(a: Attachment): 'image' | 'video' | 'file' {
	if (a.kind === 'image' || contentType(a).startsWith('image/')) return 'image';
	if (contentType(a).startsWith('video/')) return 'video';
	return 'file';
}

function nodeHasLink(node: JSONContent): boolean {
	if (node.type === 'codeBlock') return false;
	if (node.type === 'text') {
		const marks = effectiveMarks(node.marks);
		const link = marks.find((mark) => mark.type === 'link');
		if (link) return safeHref(link.attrs?.href) !== null;
		if (marks.some((mark) => mark.type === 'code')) return false;
		return linkify(node.text ?? '').some((segment) => segment.kind === 'link');
	}
	return node.content?.some(nodeHasLink) ?? false;
}

/** Whether MessageNode would render a link anywhere in the text. */
export function contentHasLink(raw: unknown): boolean {
	const parsed = parseMessageContent(raw);
	if (typeof parsed === 'string') return linkify(parsed).some((s) => s.kind === 'link');
	if (typeof parsed !== 'object' || parsed === null) return false;
	return nodeHasLink(parsed);
}

export type MessageFacets = { fromKey: string } & Partial<Record<HasField, 1>>;

export function messageFacets(
	m: Pick<MessageType, 'user_id' | 'imported_author' | 'content' | 'attachments'>
): MessageFacets {
	const facets: MessageFacets = { fromKey: fromKeyOf(m) };
	const kinds = (m.attachments ?? []).map(attachmentKind);
	if (kinds.length > 0) facets.hasFile = 1;
	if (kinds.includes('image')) facets.hasImage = 1;
	if (kinds.includes('video')) facets.hasVideo = 1;
	if (contentHasLink(m.content)) facets.hasLink = 1;
	return facets;
}
