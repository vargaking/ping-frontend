import type { StoredMessage, StoredPost } from '$lib/types/localHistory.types';
import {
	findMessageIds,
	findPosts,
	fromKeysForName,
	loadMessages,
	pageMessages,
	storedUserIds,
	type MessageFilters,
	type MessagePager,
	type SearchScope
} from '$lib/utils/messageSearch';
import {
	EMPTY_SCAN,
	exactAuthorKeys,
	prefixAuthorKeys,
	scanStoredAuthors,
	type AuthorScan
} from '$lib/utils/searchAuthors';
import type { HasKind } from '$lib/utils/searchFacets';
import { hasFilters, parseSearchQuery } from '$lib/utils/searchQuery';
import { conversationsState } from './conversationsState.svelte';
import { historySyncState } from './historySyncState.svelte';
import { unreadState } from './unreadState.svelte';
import { usersState } from './usersState.svelte';

const DEBOUNCE_MS = 120;
const AUTHOR_FETCHES = 4;
const PAGE_SIZE = 30;
const POST_LIMIT = 5;
/** Posts are filtered by what the person can still see, so ask for more than are shown. */
const POST_CANDIDATES = 25;

type Status = 'idle' | 'searching' | 'ready';

const EVERYWHERE: SearchScope = { kind: 'everywhere' };

function channelVisible(channelId: number | null | undefined): boolean {
	return channelId != null && unreadState.channelName(channelId) !== '';
}

/** Stored history outlives leaving a server or losing access, so hits are checked against
 *  what the app knows about now. */
function messageVisible(message: StoredMessage): boolean {
	if (message.conversation_id != null) {
		return conversationsState.conversations[message.conversation_id] != null;
	}
	return channelVisible(message.channel_id);
}

/** The search dialog's query, scope and results. Everything runs on the local database. */
class SearchState {
	query = $state('');
	scope = $state<SearchScope>(EVERYWHERE);
	status = $state<Status>('idle');
	/** Matching messages not yet found hidden; shrinks as hidden ones are met while paging.
	 *  Null when the search reads lazily and the count isn't known. */
	total = $state<number | null>(0);
	hits = $state.raw<StoredMessage[]>([]);
	posts = $state.raw<StoredPost[]>([]);
	/** The words the shown results were found with. */
	tokens = $state.raw<string[]>([]);
	/** The `has:` filters the shown results were found with. */
	has = $state.raw<HasKind[]>([]);
	hasMore = $state(false);
	/** Every author in the local history, filled by `loadAuthors`. */
	authors = $state.raw<AuthorScan>(EMPTY_SCAN);

	private ids: string[] = [];
	private pager: MessagePager | null = null;
	private cursor = 0;
	private hidden = 0;
	private timer: ReturnType<typeof setTimeout> | null = null;
	/** Bumped by every new search and by reset, so a slow older one can't overwrite a newer. */
	private token = 0;
	private loadingToken: number | null = null;
	/** Stored authors whose profile was already asked for, so a name with no match isn't refetched. */
	private authorFetches = new Map<number, Promise<unknown>>();
	private authorScan: Promise<AuthorScan> | null = null;
	/** A scan taken while history was still downloading is taken again once it is done. */
	private authorScanFull = false;
	/** Bumped by reset, so a scan that finishes after logout doesn't fill the next session. */
	private authorGen = 0;

	setQuery(query: string) {
		this.query = query;
		this.schedule(DEBOUNCE_MS);
	}

	isScope(scope: SearchScope): boolean {
		return JSON.stringify(scope) === JSON.stringify(this.scope);
	}

	setScope(scope: SearchScope) {
		if (this.isScope(scope)) return;
		this.scope = scope;
		this.schedule(0);
	}

	/** Appends the next page of messages. */
	async loadMore(): Promise<void> {
		const token = this.token;
		if (this.status !== 'ready' || !this.hasMore || this.loadingToken === token) return;
		this.loadingToken = token;
		try {
			if (this.pager) {
				const page = await this.nextPagerPage(this.pager, token);
				if (!page) return;
				this.hits = [...this.hits, ...page.rows];
				this.hasMore = !page.done;
				return;
			}
			const page = await this.nextPage(this.ids, this.cursor, token);
			if (!page) return;
			this.hits = [...this.hits, ...page.rows];
			this.cursor = page.next;
			this.hidden += page.hidden;
			this.total = this.ids.length - this.hidden;
			this.hasMore = this.cursor < this.ids.length;
		} catch (e) {
			console.warn('Failed to load more search results', e);
		} finally {
			if (this.loadingToken === token) this.loadingToken = null;
		}
	}

	/** Reads the authors out of the local history once; later calls share the result. */
	loadAuthors(): Promise<AuthorScan> {
		const synced = historySyncState.status === 'done';
		if (this.authorScan && (this.authorScanFull || !synced)) return this.authorScan;
		const gen = this.authorGen;
		this.authorScanFull = synced;
		const scan = scanStoredAuthors().then(
			(result) => {
				if (gen === this.authorGen) this.authors = result;
				return result;
			},
			(e) => {
				console.warn('Failed to list authors in the local history', e);
				if (gen === this.authorGen) this.authorScan = null;
				return EMPTY_SCAN;
			}
		);
		this.authorScan = scan;
		return scan;
	}

	/** Brings the profiles of the stored authors up, so the suggestions can show their names. */
	async loadAuthorProfiles(): Promise<void> {
		const { userIds } = await this.loadAuthors();
		await this.fetchAuthors(userIds.filter((id) => !usersState.users[id]));
	}

	reset() {
		this.token++;
		this.authorGen++;
		this.clearTimer();
		this.query = '';
		this.scope = EVERYWHERE;
		this.authorFetches.clear();
		this.authorScan = null;
		this.authors = EMPTY_SCAN;
		this.clear();
	}

	private clear() {
		this.ids = [];
		this.pager = null;
		this.cursor = 0;
		this.hidden = 0;
		this.total = 0;
		this.hits = [];
		this.posts = [];
		this.tokens = [];
		this.has = [];
		this.hasMore = false;
		this.status = 'idle';
	}

	private clearTimer() {
		if (this.timer) clearTimeout(this.timer);
		this.timer = null;
	}

	private schedule(delay: number) {
		this.clearTimer();
		const token = ++this.token;
		const query = parseSearchQuery(this.query);
		if (query.words.length === 0 && !hasFilters(query)) {
			this.clear();
			return;
		}
		this.status = 'searching';
		this.timer = setTimeout(() => {
			this.timer = null;
			void this.run(token);
		}, delay);
	}

	private async run(token: number) {
		const query = parseSearchQuery(this.query);
		const tokens = query.words;
		const scope = this.scope;
		try {
			const fromKeys = query.from ? await this.resolveFrom(query.from) : null;
			if (token !== this.token) return;
			const filters: MessageFilters = {
				fromKeys,
				has: query.has,
				since: query.since,
				until: query.until
			};
			const lazy = hasFilters(query);
			const [source, posts] = await Promise.all([
				lazy ? pageMessages(tokens, scope, filters) : findMessageIds(tokens, scope),
				findPosts(tokens, scope, POST_CANDIDATES, filters)
			]);
			if (token !== this.token) return;
			if (Array.isArray(source)) {
				const page = await this.nextPage(source, 0, token);
				if (!page) return;
				this.ids = source;
				this.pager = null;
				this.hidden = page.hidden;
				this.cursor = page.next;
				this.total = source.length - page.hidden;
				this.hits = page.rows;
				this.hasMore = page.next < source.length;
			} else {
				const page = await this.nextPagerPage(source, token);
				if (!page) return;
				this.ids = [];
				this.pager = source;
				this.total = null;
				this.hits = page.rows;
				this.hasMore = !page.done;
			}
			this.posts = posts.filter((post) => channelVisible(post.channel_id)).slice(0, POST_LIMIT);
			this.tokens = tokens;
			this.has = query.has;
			this.status = 'ready';
		} catch (e) {
			console.warn('Search failed', e);
			if (token !== this.token) return;
			this.clear();
			this.tokens = tokens;
			this.status = 'ready';
		}
	}

	/** The author keys a `from:` name can mean: exactly, when someone has that name, otherwise
	 *  everyone whose name starts with it. Profiles of stored authors that aren't loaded are
	 *  fetched unless a loaded user has the name: an imported author's name can be a user's too. */
	private async resolveFrom(name: string): Promise<string[]> {
		const { imported } = await this.loadAuthors();
		const known = fromKeysForName(name, Object.values(usersState.users));
		if (known.some((key) => key.startsWith('user:'))) return known;
		const stored = await storedUserIds();
		await this.fetchAuthors(stored.filter((id) => !usersState.users[id]));
		return (
			exactAuthorKeys(name, imported, Object.values(usersState.users)) ??
			prefixAuthorKeys(
				name,
				imported,
				stored.flatMap((id) => usersState.users[id] ?? [])
			)
		);
	}

	private async fetchAuthors(ids: number[]): Promise<void> {
		const queue = [...ids];
		const worker = async () => {
			for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
				await this.fetchAuthor(id);
			}
		};
		await Promise.all(Array.from({ length: AUTHOR_FETCHES }, worker));
	}

	/** One request per author; a later search waits for it, and one that failed is tried again. */
	private fetchAuthor(id: number): Promise<unknown> {
		let pending = this.authorFetches.get(id);
		if (!pending) {
			pending = usersState.getOrFetchUser(id).catch(() => this.authorFetches.delete(id));
			this.authorFetches.set(id, pending);
		}
		return pending;
	}

	/** Up to one page of visible rows from the pager; null when a newer search has taken over. */
	private async nextPagerPage(pager: MessagePager, token: number) {
		const rows: StoredMessage[] = [];
		let done = false;
		while (rows.length < PAGE_SIZE && !done) {
			const want = PAGE_SIZE - rows.length;
			const chunk = await pager.next(want);
			if (token !== this.token) return null;
			done = chunk.length < want;
			rows.push(...chunk.filter(messageVisible));
		}
		return { rows, done };
	}

	/** Up to one page of visible rows from `from`; null when a newer search has taken over. */
	private async nextPage(ids: string[], from: number, token: number) {
		const rows: StoredMessage[] = [];
		let next = from;
		let hidden = 0;
		while (rows.length < PAGE_SIZE && next < ids.length) {
			const chunk = ids.slice(next, next + PAGE_SIZE);
			next += chunk.length;
			const loaded = await loadMessages(chunk);
			if (token !== this.token) return null;
			hidden += chunk.length - loaded.length;
			for (const row of loaded) {
				if (messageVisible(row)) rows.push(row);
				else hidden++;
			}
		}
		return { rows, next, hidden };
	}
}

export const searchState = new SearchState();
