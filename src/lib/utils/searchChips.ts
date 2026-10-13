import { readTerms, type FilterName, type Term } from '$lib/utils/searchQuery';

export type QueryChip = { text: string; filter: FilterName };

export type ChipSplit = {
	chips: QueryChip[];
	rest: string;
	/** In `rest`. */
	caret: number;
};

export function joinChips(chips: QueryChip[], rest: string): string {
	return chips.map((chip) => chip.text + ' ').join('') + rest;
}

/** Completed filters become chips: a valid filter that is followed by whitespace. Each is cut
 *  out together with that one whitespace character; the rest keeps its text. */
export function splitChips(query: string, caret = query.length): ChipSplit {
	const chips: QueryChip[] = [];
	let rest = '';
	let removedBeforeCaret = 0;
	let copied = 0;
	for (const term of readTerms(query)) {
		const done =
			term.filter !== null && term.applied && term.end < query.length && /\s/.test(query[term.end]);
		if (!done || term.filter === null) continue;
		chips.push({ text: term.raw, filter: term.filter });
		rest += query.slice(copied, term.start);
		copied = term.end + 1;
		removedBeforeCaret += Math.max(0, Math.min(caret, term.end + 1) - term.start);
	}
	rest += query.slice(copied);

	const trimmed = rest.length - rest.trimStart().length;
	return {
		chips,
		rest: rest.trimStart(),
		caret: Math.max(0, caret - removedBeforeCaret - trimmed)
	};
}

/** Turns a chip back into text. It goes to the end of the rest: anywhere else, the whitespace
 *  after it would make it a chip again at once. */
export function unchip(
	split: Pick<ChipSplit, 'chips' | 'rest'>,
	index: number
): { query: string; caret: number } {
	const chip = split.chips[index];
	const chips = split.chips.filter((_, i) => i !== index);
	const gap = split.rest === '' || /\s$/.test(split.rest) ? '' : ' ';
	const query = joinChips(chips, split.rest + gap + chip.text);
	return { query, caret: query.length };
}

/** Replaces a term with `text` and a following space, unless whitespace already follows. */
export function insertTerm(
	rest: string,
	term: Pick<Term, 'start' | 'end'>,
	text: string
): { rest: string; caret: number } {
	const spaced = /\s/.test(rest[term.end] ?? '');
	const head = rest.slice(0, term.start) + text;
	const tail = spaced ? rest.slice(term.end) : ' ' + rest.slice(term.end);
	return { rest: head + tail, caret: head.length + 1 };
}
