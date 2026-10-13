import { SvelteMap } from 'svelte/reactivity';
import { getGameSession } from '$lib/requests/game';
import type { GameMix, GameSession } from '$lib/types/game.types';

/**
 * Game-driven voice: which voice channels have a running game session, and how
 * loud the game says each player is for this user.
 */
class GameVoiceState {
	/** Active sessions by voice channel id. */
	sessions = new SvelteMap<number, GameSession>();
	/** My gains by channel id, each keyed by speaker user id. */
	private myGains = new Map<number, Record<string, number>>();
	/** Bumped by every frame, so a load that started earlier can tell it is stale. */
	private frameSeq = new Map<number, number>();
	/** Bumped by reset(), so a load that started before it can't bring the old session back. */
	private epoch = 0;
	/** Called with the channel whenever its session or my gains change. */
	onChange: ((channelId: number) => void) | null = null;

	session(channelId: number): GameSession | null {
		return this.sessions.get(channelId) ?? null;
	}

	isPlayer(channelId: number, userId: number): boolean {
		return this.sessions.get(channelId)?.players.some((p) => p.user_id === userId) ?? false;
	}

	playerName(channelId: number, userId: number): string | null {
		return (
			this.sessions.get(channelId)?.players.find((p) => p.user_id === userId)?.player_name ?? null
		);
	}

	/** What to multiply someone's voice by for me, on top of my own volume for them. */
	factor(myUserId: number | null | undefined, channelId: number, peerUserId: number): number {
		const session = this.sessions.get(channelId);
		if (!session || myUserId == null || !this.isPlayer(channelId, myUserId)) return 1;
		if (this.isPlayer(channelId, peerUserId)) {
			return this.myGains.get(channelId)?.[String(peerUserId)] ?? 0;
		}
		return session.players_hear_spectators ? 1 : 0;
	}

	applySession(frame: GameSession) {
		this.touch(frame.channel_id);
		if (frame.active) {
			this.sessions.set(frame.channel_id, frame);
		} else {
			this.sessions.delete(frame.channel_id);
			this.myGains.delete(frame.channel_id);
		}
		this.onChange?.(frame.channel_id);
	}

	applyMix(frame: GameMix) {
		this.myGains.set(frame.channel_id, frame.gains);
		this.onChange?.(frame.channel_id);
	}

	/** Fetch the session for a channel joined after it started. */
	async load(channelId: number) {
		const seq = this.frameSeq.get(channelId) ?? 0;
		const epoch = this.epoch;
		let session: GameSession | null;
		try {
			session = await getGameSession(channelId);
		} catch (error) {
			console.warn('Failed to load game session', error);
			return;
		}
		if (epoch !== this.epoch || (this.frameSeq.get(channelId) ?? 0) !== seq) return;
		if (session?.active) {
			this.sessions.set(channelId, session);
		} else {
			this.sessions.delete(channelId);
			this.myGains.delete(channelId);
		}
		this.onChange?.(channelId);
	}

	/** After a reconnect, frames may have been missed; keep only the channel that is being reloaded. */
	dropExcept(channelId: number | null) {
		for (const id of [...this.sessions.keys()]) {
			if (id !== channelId) this.sessions.delete(id);
		}
		for (const id of [...this.myGains.keys()]) {
			if (id !== channelId) this.myGains.delete(id);
		}
	}

	reset() {
		this.epoch++;
		this.sessions.clear();
		this.myGains.clear();
		this.frameSeq.clear();
	}

	private touch(channelId: number) {
		this.frameSeq.set(channelId, (this.frameSeq.get(channelId) ?? 0) + 1);
	}
}

export const gameVoiceState = new GameVoiceState();
