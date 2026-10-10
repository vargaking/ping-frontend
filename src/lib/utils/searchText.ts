import type { MessageType } from '$lib/types/messages.types';
import { messagePlainText } from '$lib/utils/messageContent';

const MIN_TOKEN = 2;
const MAX_TOKEN = 32;
const MAX_TOKENS = 256;

/** Lowercase and drop accents, so "Árvíztűrő" and "arvizturo" compare equal. */
export function normalizeText(text: string): string {
	return text
		.toLowerCase()
		.normalize('NFD')
		.replace(/\p{M}+/gu, '');
}

/** The distinct searchable words of a text, normalized. */
export function tokenize(text: string): string[] {
	const tokens = new Set<string>();
	for (const token of normalizeText(text).split(/[^\p{L}\p{N}]+/u)) {
		if (token.length < MIN_TOKEN || token.length > MAX_TOKEN) continue;
		tokens.add(token);
		if (tokens.size === MAX_TOKENS) break;
	}
	return [...tokens];
}

/** Words from a message's text and its attachment file names. */
export function messageWords(message: Pick<MessageType, 'content' | 'attachments'>): string[] {
	const names = (message.attachments ?? []).map((a) => a.filename);
	return tokenize([messagePlainText(message.content), ...names].join(' '));
}
