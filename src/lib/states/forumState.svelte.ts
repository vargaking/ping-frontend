import { getForumPosts } from '$lib/requests/forum/getForumPosts';
import { getForumPost } from '$lib/requests/forum/getForumPost';
import { getForumTags } from '$lib/requests/forum/getForumTags';
import type { ForumPost, ForumPostDetail, ForumTag } from '$lib/types/forum.types';

export type ForumSort = 'activity' | 'newest';
export type ForumView = 'list' | 'gallery';

type ForumIndex = {
	/** Ids of the loaded posts, in no particular order; see visiblePosts. */
	ids: number[];
	nextCursor: string | null;
	status: 'loading' | 'ready' | 'error';
	loadingMore: boolean;
	tagIds: number[];
	query: string;
	sort: ForumSort;
	view: ForumView;
	/** Set after a reconnect: frames may have been missed, so the next open refetches. */
	stale: boolean;
};

const viewKey = (channelId: number) => `forumView:${channelId}`;

function readView(channelId: number): ForumView {
	try {
		return localStorage.getItem(viewKey(channelId)) === 'gallery' ? 'gallery' : 'list';
	} catch {
		return 'list';
	}
}

function matches(post: ForumPost, tagIds: number[]): boolean {
	return tagIds.every((id) => post.tag_ids.includes(id));
}

const newestFirst = (key: 'last_activity_at' | 'created_at') => (a: ForumPost, b: ForumPost) =>
	b[key].localeCompare(a[key]) || b.id - a.id;

/**
 * Forum channels as the index and post views need them: the listed posts per
 * channel with their filter, sort and scroll position (so going back to the
 * index finds it as it was left), every post we know of, and each channel's
 * tags. Socket frames patch all of it.
 */
class ForumState {
	private indexes: Record<number, ForumIndex> = $state({});
	private posts: Record<number, ForumPost> = $state({});
	private openingIds: Record<number, string> = $state({});
	private tagLists: Record<number, ForumTag[]> = $state({});
	private tagsLoaded: Record<number, boolean> = $state({});
	private scroll = new Map<number, number>();
	private loadTokens = new Map<number, number>();

	index(channelId: number): ForumIndex | undefined {
		return this.indexes[channelId];
	}

	view(channelId: number): ForumView {
		return this.indexes[channelId]?.view ?? readView(channelId);
	}

	post(postId: number): ForumPost | undefined {
		return this.posts[postId];
	}

	openingMessageId(postId: number): string | undefined {
		return this.openingIds[postId];
	}

	tags(channelId: number): ForumTag[] {
		return this.tagLists[channelId] ?? [];
	}

	/** Pinned posts first, then by the chosen sort, narrowed by the title filter. */
	visiblePosts(channelId: number): ForumPost[] {
		const index = this.indexes[channelId];
		if (!index) return [];
		const query = index.query.trim().toLowerCase();
		const key = index.sort === 'newest' ? 'created_at' : 'last_activity_at';
		return index.ids
			.map((id) => this.posts[id])
			.filter((post): post is ForumPost => post != null)
			.filter((post) => !query || post.title.toLowerCase().includes(query))
			.sort((a, b) => Number(b.pinned) - Number(a.pinned) || newestFirst(key)(a, b));
	}

	private ensure(channelId: number): ForumIndex {
		if (!this.indexes[channelId]) {
			this.indexes[channelId] = {
				ids: [],
				nextCursor: null,
				status: 'loading',
				loadingMore: false,
				tagIds: [],
				query: '',
				sort: 'activity',
				view: readView(channelId),
				stale: false
			};
		}
		return this.indexes[channelId];
	}

	/** Make the channel's index current: loads it the first time or after a reconnect. */
	open(channelId: number) {
		const known = this.indexes[channelId];
		void this.loadTags(channelId);
		if (!known || known.stale || known.status === 'error') void this.reload(channelId);
	}

	async reload(channelId: number) {
		const index = this.ensure(channelId);
		const token = (this.loadTokens.get(channelId) ?? 0) + 1;
		this.loadTokens.set(channelId, token);
		index.stale = false;
		if (index.ids.length === 0) index.status = 'loading';
		try {
			const page = await getForumPosts(channelId, index.tagIds);
			if (this.loadTokens.get(channelId) !== token) return;
			this.remember(page.posts);
			index.ids = page.posts.map((p) => p.id);
			index.nextCursor = page.next_cursor;
			index.status = 'ready';
		} catch (e) {
			if (this.loadTokens.get(channelId) !== token) return;
			console.warn('Failed to load forum posts', e);
			index.status = 'error';
		}
	}

	async loadMore(channelId: number) {
		const index = this.indexes[channelId];
		if (!index?.nextCursor || index.loadingMore) return;
		const token = this.loadTokens.get(channelId);
		index.loadingMore = true;
		try {
			const page = await getForumPosts(channelId, index.tagIds, index.nextCursor);
			if (this.loadTokens.get(channelId) !== token) return;
			this.remember(page.posts);
			const known = new Set(index.ids);
			index.ids = [...index.ids, ...page.posts.map((p) => p.id).filter((id) => !known.has(id))];
			index.nextCursor = page.next_cursor;
		} finally {
			index.loadingMore = false;
		}
	}

	async loadTags(channelId: number) {
		if (this.tagsLoaded[channelId]) return;
		this.tagsLoaded[channelId] = true;
		try {
			this.tagLists[channelId] = await getForumTags(channelId);
		} catch (e) {
			this.tagsLoaded[channelId] = false;
			console.warn('Failed to load forum tags', e);
		}
	}

	setTagIds(channelId: number, tagIds: number[]) {
		this.ensure(channelId).tagIds = tagIds;
		void this.reload(channelId);
	}

	setQuery(channelId: number, query: string) {
		this.ensure(channelId).query = query;
	}

	setSort(channelId: number, sort: ForumSort) {
		this.ensure(channelId).sort = sort;
	}

	setView(channelId: number, view: ForumView) {
		this.ensure(channelId).view = view;
		try {
			localStorage.setItem(viewKey(channelId), view);
		} catch {
			/* storage unavailable: the choice lasts until reload */
		}
	}

	saveScroll(channelId: number, top: number) {
		this.scroll.set(channelId, top);
	}

	savedScroll(channelId: number): number {
		return this.scroll.get(channelId) ?? 0;
	}

	/** Fetch one post (a deep link or a push click) and keep it with its opening message id. */
	async loadPost(channelId: number, postId: number): Promise<ForumPostDetail> {
		const { opening_message_id, ...post } = await getForumPost(channelId, postId);
		this.posts[postId] = post;
		if (opening_message_id) this.openingIds[postId] = opening_message_id;
		return { ...post, opening_message_id };
	}

	/** A post we just created: the frames for it skip our own sockets. */
	addCreated(post: ForumPost, openingMessageId: string) {
		this.applyPost(post);
		this.openingIds[post.id] = openingMessageId;
	}

	private remember(posts: ForumPost[]) {
		for (const post of posts) this.posts[post.id] = post;
	}

	/** Upsert from forum_post_created / forum_post_updated, or our own change. */
	applyPost(post: ForumPost) {
		const known = this.posts[post.id] != null;
		const index = this.indexes[post.channel_id];
		if (!known && index?.status !== 'ready') return;
		this.posts[post.id] = post;
		if (!index) return;

		const listed = index.ids.includes(post.id);
		if (!matches(post, index.tagIds)) {
			if (listed) index.ids = index.ids.filter((id) => id !== post.id);
			return;
		}
		if (listed || index.status !== 'ready') return;
		const oldest = index.ids
			.map((id) => this.posts[id])
			.filter((p) => p && !p.pinned)
			.map((p) => p.last_activity_at)
			.sort()[0];
		// Past the loaded pages, the post arrives with "load more" instead.
		if (index.nextCursor && !post.pinned && oldest && post.last_activity_at < oldest) return;
		index.ids = [...index.ids, post.id];
	}

	applyPostDeleted(channelId: number, postId: number) {
		delete this.posts[postId];
		delete this.openingIds[postId];
		const index = this.indexes[channelId];
		if (index) index.ids = index.ids.filter((id) => id !== postId);
	}

	/** The full ordered tag list, from forum_tags_updated or our own change. */
	applyTags(channelId: number, tags: ForumTag[]) {
		this.tagLists[channelId] = tags;
		this.tagsLoaded[channelId] = true;
		const index = this.indexes[channelId];
		if (!index) return;
		const known = new Set(tags.map((t) => t.id));
		if (index.tagIds.every((id) => known.has(id))) return;
		index.tagIds = index.tagIds.filter((id) => known.has(id));
		void this.reload(channelId);
	}

	/** Frames may have been missed while the socket was down. */
	markStale() {
		for (const index of Object.values(this.indexes)) index.stale = true;
		this.tagsLoaded = {};
	}

	/** Forget a deleted channel. */
	forgetChannel(channelId: number) {
		delete this.indexes[channelId];
		delete this.tagLists[channelId];
		delete this.tagsLoaded[channelId];
		this.scroll.delete(channelId);
	}

	reset() {
		this.indexes = {};
		this.posts = {};
		this.openingIds = {};
		this.tagLists = {};
		this.tagsLoaded = {};
		this.scroll.clear();
		this.loadTokens.clear();
	}
}

export const forumState = new ForumState();
