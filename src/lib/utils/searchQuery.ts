import { normalizeName, type HasKind } from '$lib/utils/searchFacets';
import { tokenize } from '$lib/utils/searchText';

export type SearchQuery = {
	/** Words to find: every term that isn't a valid filter. */
	words: string[];
	/** Normalized author name. */
	from: string | null;
	has: HasKind[];
	/** Inclusive start in ms, local midnight. */
	since: number | null;
	/** Exclusive end in ms, local midnight. */
	until: number | null;
};

const HAS_KINDS: HasKind[] = ['file', 'image', 'video', 'link'];
const FILTER_NAMES = new Set<FilterName>(['from', 'has', 'before', 'after', 'during']);
const FILTER_START = /([a-z]+):/iy;
const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTH = /^(\d{4})-(\d{2})$/;
const MIN_YEAR = 1000;

export type FilterName = 'from' | 'has' | 'before' | 'after' | 'during';

export type Term = {
	raw: string;
	/** Offset in the input. */
	start: number;
	/** Exclusive. */
	end: number;
	/** Lowercased; null for a word. */
	filter: FilterName | null;
	/** Unquoted; null for a word, or when text is glued after the closing quote. */
	value: string | null;
	quoted: boolean;
	/** False only for a quoted value whose closing quote is missing. */
	closed: boolean;
	/** Whether the parser took it as a filter: not a second `from:`, an unknown kind, a bad date or an empty value. */
	applied: boolean;
};

type RawTerm = Omit<Term, 'applied'>;

function isFilterName(name: string | undefined): name is FilterName {
	return FILTER_NAMES.has(name as FilterName);
}

function readTerm(input: string, start: number): RawTerm {
	FILTER_START.lastIndex = start;
	const head = FILTER_START.exec(input);
	const name = head?.[1].toLowerCase();
	if (!head || !isFilterName(name)) {
		const end = nextBlank(input, start);
		return {
			raw: input.slice(start, end),
			start,
			end,
			filter: null,
			value: null,
			quoted: false,
			closed: true
		};
	}

	const valueStart = start + head[0].length;
	const quoted = input[valueStart] === '"';
	let value: string | null;
	let end: number;
	let closed = true;
	if (quoted) {
		const close = input.indexOf('"', valueStart + 1);
		closed = close >= 0;
		value = input.slice(valueStart + 1, closed ? close : undefined);
		end = closed ? close + 1 : input.length;
		if (end < input.length && !/\s/.test(input[end])) {
			value = null;
			end = nextBlank(input, end);
		}
	} else {
		end = nextBlank(input, valueStart);
		value = input.slice(valueStart, end);
	}
	return { raw: input.slice(start, end), start, end, filter: name, value, quoted, closed };
}

function nextBlank(input: string, from: number): number {
	const blank = input.slice(from).search(/\s/);
	return blank < 0 ? input.length : from + blank;
}

/** Local midnight of a real calendar date, or null. A month is given as day 1. */
function dayStart(year: number, month: number, day: number): number | null {
	if (year < MIN_YEAR) return null;
	const date = new Date(year, month - 1, day);
	const real =
		date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
	return real ? date.getTime() : null;
}

function nextDayStart(year: number, month: number, day: number): number {
	return new Date(year, month - 1, day + 1).getTime();
}

function nextMonthStart(year: number, month: number): number {
	return new Date(year, month, 1).getTime();
}

type Window = { since: number; until: number };

function parseDay(value: string): Window | null {
	const match = DAY.exec(value);
	if (!match) return null;
	const [year, month, day] = match.slice(1).map(Number);
	const since = dayStart(year, month, day);
	return since === null ? null : { since, until: nextDayStart(year, month, day) };
}

function parseMonth(value: string): Window | null {
	const match = MONTH.exec(value);
	if (!match) return null;
	const [year, month] = match.slice(1).map(Number);
	const since = dayStart(year, month, 1);
	return since === null ? null : { since, until: nextMonthStart(year, month) };
}

function read(input: string): { query: SearchQuery; terms: Term[] } {
	const query: SearchQuery = { words: [], from: null, has: [], since: null, until: null };
	const wordTerms: string[] = [];
	const terms: Term[] = [];

	let i = 0;
	while (i < input.length) {
		if (/\s/.test(input[i])) {
			i++;
			continue;
		}
		const term = readTerm(input, i);
		const applied = applyFilter(query, term.filter, term.value);
		terms.push({ ...term, applied });
		i = term.end;
		if (applied) continue;
		// A filter whose value is still being typed searches for nothing yet.
		const typing =
			term.filter !== null && term.raw.endsWith(':') && i >= input.length && !/\s$/.test(input);
		if (!typing) wordTerms.push(term.raw);
	}
	query.words = tokenize(wordTerms.join(' '));
	return { query, terms };
}

/** Pulls the filters out of a typed query; anything that isn't a valid filter stays a word. */
export function parseSearchQuery(input: string): SearchQuery {
	return read(input).query;
}

/** Every word and filter in the input, with where it sits. */
export function readTerms(input: string): Term[] {
	return read(input).terms;
}

/** The term the caret is in or right after, if any. */
export function termAt(input: string, caret: number): Term | null {
	return readTerms(input).find((term) => term.start < caret && caret <= term.end) ?? null;
}

function applyFilter(query: SearchQuery, filter: FilterName | null, value: string | null): boolean {
	if (filter === null || value === null) return false;
	switch (filter) {
		case 'from': {
			const name = normalizeName(value);
			if (name === '' || query.from !== null) return false;
			query.from = name;
			return true;
		}
		case 'has': {
			const kind = HAS_KINDS.find((k) => k === value.toLowerCase());
			if (!kind) return false;
			if (!query.has.includes(kind)) query.has.push(kind);
			return true;
		}
		case 'before': {
			const day = parseDay(value);
			if (!day) return false;
			query.until = Math.min(query.until ?? day.since, day.since);
			return true;
		}
		case 'after': {
			const day = parseDay(value);
			if (!day) return false;
			query.since = Math.max(query.since ?? day.since, day.since);
			return true;
		}
		case 'during': {
			const window = parseDay(value) ?? parseMonth(value);
			if (!window) return false;
			query.since = Math.max(query.since ?? window.since, window.since);
			query.until = Math.min(query.until ?? window.until, window.until);
			return true;
		}
		default:
			return false;
	}
}

export function hasFilters(q: Pick<SearchQuery, 'from' | 'has' | 'since' | 'until'>): boolean {
	return q.from !== null || q.has.length > 0 || q.since !== null || q.until !== null;
}

export const FILTER_HINTS: { insert: string; example: string; description: string }[] = [
	{ insert: 'from:', example: 'from:dani', description: 'Messages by a user' },
	{ insert: 'has:image', example: 'has:image', description: 'Messages with an image' },
	{ insert: 'has:video', example: 'has:video', description: 'Messages with a video' },
	{ insert: 'has:file', example: 'has:file', description: 'Messages with any attachment' },
	{ insert: 'has:link', example: 'has:link', description: 'Messages with a link' },
	{ insert: 'before:', example: 'before:2026-04-01', description: 'Sent before a day' },
	{ insert: 'after:', example: 'after:2026-03-01', description: 'Sent on or after a day' },
	{ insert: 'during:', example: 'during:2026-03', description: 'Sent on a day or in a month' }
];
