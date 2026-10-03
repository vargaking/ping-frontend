import { SvelteMap } from 'svelte/reactivity';

export interface PeerAudio {
	/** 0 to 1. */
	volume: number;
	muted: boolean;
}

const STORAGE_KEY = 'voice.peerAudio';
const DEFAULT: PeerAudio = { volume: 1, muted: false };

function load(): [number, PeerAudio][] {
	const saved: [number, PeerAudio][] = [];
	try {
		const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
		for (const [id, value] of Object.entries(parsed)) {
			const { volume, muted } = value as Partial<PeerAudio>;
			if (typeof volume !== 'number' || !(volume >= 0 && volume <= 1)) continue;
			saved.push([Number(id), { volume, muted: muted === true }]);
		}
	} catch {
		/* unavailable or malformed: everyone at full volume */
	}
	return saved;
}

/** How loud each person is for this user, on this device only. */
class VoicePeerAudioState {
	private peers = new SvelteMap<number, PeerAudio>(
		typeof localStorage === 'undefined' ? [] : load()
	);

	get(userId: number): PeerAudio {
		return this.peers.get(userId) ?? DEFAULT;
	}

	/** What the audio element should play at. */
	level(userId: number): number {
		const { volume, muted } = this.get(userId);
		return muted ? 0 : volume;
	}

	set(userId: number, change: Partial<PeerAudio>) {
		const next = { ...this.get(userId), ...change };
		if (next.volume === DEFAULT.volume && !next.muted) this.peers.delete(userId);
		else this.peers.set(userId, next);
		this.persist();
	}

	private persist() {
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(this.peers)));
		} catch {
			/* storage blocked: the choice just won't survive a reload */
		}
	}
}

export const voicePeerAudioState = new VoicePeerAudioState();
