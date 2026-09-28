import { getServerChannels } from '$lib/requests/channels/getServerChannels';
import { markChannelRead } from '$lib/requests/channels/markChannelRead';
import type { Channel } from '$lib/types/channel.types';
import { conversationsState } from './conversationsState.svelte';

type ChannelUnread = {
	serverId: number;
	name: string;
	lastReadId: string | null;
	lastMessageId: string | null;
	mentions: number;
};

/**
 * Single source of truth for unread state across text channels and DMs (DM raw
 * data lives on conversationsState — see its last_read_message_id/last_message_id/
 * unread_count — this just aggregates it alongside channels).
 */
class UnreadState {
	/** Keyed by channel id. */
	private channels: Record<number, ChannelUnread> = $state({});

	/** The thread currently "being read" (route's thread, visible + focused). */
	private activeThreadKey: string | null = $state(null);

	setActiveThread(key: string | null) {
		this.activeThreadKey = key;
	}

	isBeingRead(key: string): boolean {
		return this.activeThreadKey === key;
	}

	private isChannelUnread(c: ChannelUnread): boolean {
		return c.lastMessageId != null && c.lastMessageId !== c.lastReadId;
	}

	channelUnread(channelId: number): boolean {
		const c = this.channels[channelId];
		return c ? this.isChannelUnread(c) : false;
	}

	channelMentions(channelId: number): number {
		return this.channels[channelId]?.mentions ?? 0;
	}

	channelName(channelId: number): string {
		return this.channels[channelId]?.name ?? '';
	}

	channelLastReadId(channelId: number): string | null {
		return this.channels[channelId]?.lastReadId ?? null;
	}

	channelLastMessageId(channelId: number): string | null {
		return this.channels[channelId]?.lastMessageId ?? null;
	}

	/** Any text channel of this server unread, and its summed mentions. */
	serverUnread(serverId: number): { unread: boolean; mentions: number } {
		let unread = false;
		let mentions = 0;
		for (const c of Object.values(this.channels)) {
			if (c.serverId !== serverId) continue;
			if (this.isChannelUnread(c)) unread = true;
			mentions += c.mentions;
		}
		return { unread, mentions };
	}

	/** Total mentions across every channel we know about. */
	readonly channelMentionsTotal: number = $derived(
		Object.values(this.channels).reduce((sum, c) => sum + c.mentions, 0)
	);

	readonly dmUnreadTotal: number = $derived(conversationsState.unreadTotal);

	readonly badgeTotal: number = $derived(this.channelMentionsTotal + this.dmUnreadTotal);

	readonly anyUnread: boolean = $derived(
		this.badgeTotal > 0 ||
			Object.values(this.channels).some((c) => this.isChannelUnread(c)) ||
			conversationsState.list.some((c) => conversationsState.isUnread(c))
	);

	/** Seed/patch channels from a fetched list (initial load, refetch, or a
	 *  freshly created/joined server). The fetched markers win. */
	private applyChannels(serverId: number, fetched: Channel[]) {
		for (const channel of fetched) {
			if (channel.type !== 'text') continue;
			const existing = this.channels[channel.id];
			const lastReadId = channel.last_read_message_id ?? null;
			const lastMessageId = channel.last_message_id ?? null;
			// Mentions are only counted live, so keep them unless the server says
			// the channel has been read since.
			const caughtUp = lastMessageId == null || lastMessageId === lastReadId;
			this.channels[channel.id] = {
				serverId,
				name: channel.name,
				lastReadId,
				lastMessageId,
				mentions: caughtUp ? 0 : (existing?.mentions ?? 0)
			};
		}
	}

	/** Seed unread state for every server's channels in parallel (app start). */
	async seedAllServers(serverIds: number[]) {
		await Promise.all(
			serverIds.map(async (serverId) => {
				try {
					const channels = await getServerChannels(serverId);
					this.applyChannels(serverId, channels);
				} catch (e) {
					console.warn('Failed to seed unread state for server', serverId, e);
				}
			})
		);
	}

	/** Called from every fetchServerChannels resolution. */
	noteFetchedChannels(serverId: number, channels: Channel[]) {
		this.applyChannels(serverId, channels);
	}

	/** A channel we learned about over the socket (channel_created) — unread fields
	 *  arrive null since nothing's been sent there yet. */
	noteNewChannel(serverId: number, channel: Channel) {
		if (channel.type !== 'text') return;
		if (this.channels[channel.id]) return;
		this.channels[channel.id] = {
			serverId,
			name: channel.name,
			lastReadId: channel.last_read_message_id ?? null,
			lastMessageId: channel.last_message_id ?? null,
			mentions: 0
		};
	}

	/**
	 * A `message` frame landed for this channel. `mine` means it arrived from one
	 * of our own other tabs (the server already advanced our marker); `mentionsMe`
	 * is computed client-side from the live frame's content; `read` means the
	 * channel is currently being read, so treat it as read right away.
	 */
	noteChannelMessage(
		channelId: number,
		serverId: number,
		messageId: string,
		opts: { mine?: boolean; mentionsMe?: boolean; read?: boolean }
	) {
		const existing = this.channels[channelId];
		const becomesRead = opts.mine || opts.read;
		this.channels[channelId] = {
			serverId,
			name: existing?.name ?? '',
			lastReadId: becomesRead ? messageId : (existing?.lastReadId ?? null),
			lastMessageId: messageId,
			mentions: becomesRead ? 0 : (existing?.mentions ?? 0) + (opts.mentionsMe ? 1 : 0)
		};
	}

	/** Apply a `read_state` frame for a channel. */
	applyChannelReadState(channelId: number, lastReadMessageId: string) {
		const existing = this.channels[channelId];
		if (!existing) return;
		const caughtUp = existing.lastMessageId == null || lastReadMessageId === existing.lastMessageId;
		this.channels[channelId] = {
			...existing,
			lastReadId: lastReadMessageId,
			mentions: caughtUp ? 0 : existing.mentions
		};
	}

	/** Mark local read state right up to a message, without a server round trip. */
	markChannelReadLocally(channelId: number, messageId: string) {
		const existing = this.channels[channelId];
		if (!existing) return;
		this.channels[channelId] = { ...existing, lastReadId: messageId, mentions: 0 };
	}

	/** The newest message of a channel was deleted: we can't know the one before
	 *  it locally, so refetch that server's markers. */
	async messageDeleted(messageId: string) {
		const channel = Object.values(this.channels).find((c) => c.lastMessageId === messageId);
		if (!channel) return;
		try {
			this.applyChannels(channel.serverId, await getServerChannels(channel.serverId));
		} catch (e) {
			console.warn('Failed to refresh unread state after a delete', e);
		}
	}

	/** Persist the read marker for a channel. Never throws. */
	async persistChannelRead(channelId: number, messageId: string) {
		try {
			await markChannelRead(channelId, messageId);
		} catch (e) {
			console.warn('Failed to persist channel read state', e);
		}
	}

	reset() {
		this.channels = {};
		this.activeThreadKey = null;
	}
}

export const unreadState = new UnreadState();
