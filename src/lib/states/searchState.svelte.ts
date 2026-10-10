import type { StoredMessage, StoredPost } from '$lib/types/localHistory.types';
import {
	findMessageIds,
	findPosts,
	loadMessages,
	queryTokens,
	type SearchScope
} from '$lib/utils/messageSearch';
import { conversationsState } from './conversationsState.svelte';
import { unreadState } from './unreadState.svelte';

const DEBOUNCE_MS = 120;
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
	/** Matching messages not yet found hidden; shrinks as hidden ones are met while paging. */
	total = $state(0);
	hits = $state.raw<StoredMessage[]>([]);
	posts = $state.raw<StoredPost[]>([]);
	/** The words the shown results were found with. */
	tokens = $state.raw<string[]>([]);
	hasMore = $state(false);

	private ids: string[] = [];
	private cursor = 0;
	private hidden = 0;
	private timer: ReturnType<typeof setTimeout> | null = null;
	/** Bumped by every new search and by reset, so a slow older one can't overwrite a newer. */
	private token = 0;
	private loadingToken: number | null = null;

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

	reset() {
		this.token++;
		this.clearTimer();
		this.query = '';
		this.scope = EVERYWHERE;
		this.clear();
	}

	private clear() {
		this.ids = [];
		this.cursor = 0;
		this.hidden = 0;
		this.total = 0;
		this.hits = [];
		this.posts = [];
		this.tokens = [];
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
		if (queryTokens(this.query).length === 0) {
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
		const tokens = queryTokens(this.query);
		const scope = this.scope;
		try {
			const [ids, posts] = await Promise.all([
				findMessageIds(tokens, scope),
				findPosts(tokens, scope, POST_CANDIDATES)
			]);
			if (token !== this.token) return;
			const page = await this.nextPage(ids, 0, token);
			if (!page) return;
			this.ids = ids;
			this.hidden = page.hidden;
			this.cursor = page.next;
			this.total = ids.length - page.hidden;
			this.hits = page.rows;
			this.posts = posts.filter((post) => channelVisible(post.channel_id)).slice(0, POST_LIMIT);
			this.tokens = tokens;
			this.hasMore = page.next < ids.length;
			this.status = 'ready';
		} catch (e) {
			console.warn('Search failed', e);
			if (token !== this.token) return;
			this.clear();
			this.tokens = tokens;
			this.status = 'ready';
		}
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
