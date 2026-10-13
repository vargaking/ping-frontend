import { quickDates, type WeekDay } from '$lib/utils/quickDates';
import type { AuthorEntry } from '$lib/utils/searchAuthors';
import { normalizeName, type HasKind } from '$lib/utils/searchFacets';
import { FILTER_HINTS, termAt, type Term } from '$lib/utils/searchQuery';

export type SuggestionKind = 'author' | 'has' | 'date';

export type SuggestionContext = { kind: SuggestionKind; term: Term };

export type Suggestion = {
	key: string;
	label: string;
	detail: string;
	/** Replaces the whole term the caret is in. */
	insert: string;
};

export const MAX_SUGGESTIONS = 8;

const HAS_KINDS: HasKind[] = ['file', 'image', 'video', 'link'];

/** What the term under the caret asks to be completed, if anything. `fromChip` is whether a
 *  `from:` chip already exists, since only one author counts. */
export function suggestionContext(
	rest: string,
	caret: number,
	fromChip: boolean
): SuggestionContext | null {
	const term = termAt(rest, caret);
	if (!term || term.filter === null || term.value === null) return null;
	if (caret <= term.start + term.filter.length) return null;

	if (term.filter === 'from') return fromChip ? null : { kind: 'author', term };
	if (term.filter === 'has') return { kind: 'has', term };
	return term.value === '' ? { kind: 'date', term } : null;
}

type Source = { authors: AuthorEntry[]; now: Date; firstDay: WeekDay };

function authorSuggestions({ term }: SuggestionContext, authors: AuthorEntry[]): Suggestion[] {
	const prefix = normalizeName(term.value ?? '');
	const complete = !term.quoted || term.closed;
	if (complete && authors.some((author) => author.norm === prefix)) return [];

	return authors
		.filter((author) => author.norm.startsWith(prefix) && !author.name.includes('"'))
		.slice(0, MAX_SUGGESTIONS)
		.map((author) => ({
			key: author.key,
			label: author.name,
			detail: author.source === 'imported' ? 'Imported' : '',
			insert: /\s/.test(author.name) ? `from:"${author.name}"` : `from:${author.name}`
		}));
}

function hasSuggestions({ term }: SuggestionContext): Suggestion[] {
	const typed = (term.value ?? '').toLowerCase();
	if (HAS_KINDS.some((kind) => kind === typed)) return [];
	return HAS_KINDS.filter((kind) => kind.startsWith(typed)).map((kind) => ({
		key: `has:${kind}`,
		label: kind,
		detail: FILTER_HINTS.find((hint) => hint.insert === `has:${kind}`)?.description ?? '',
		insert: `has:${kind}`
	}));
}

export function buildSuggestions(ctx: SuggestionContext, src: Source): Suggestion[] {
	switch (ctx.kind) {
		case 'author':
			return authorSuggestions(ctx, src.authors);
		case 'has':
			return hasSuggestions(ctx);
		case 'date':
			return quickDates(src.now, src.firstDay).map((date) => ({
				key: date.key,
				label: date.label,
				detail: date.insert,
				insert: date.insert
			}));
	}
}
