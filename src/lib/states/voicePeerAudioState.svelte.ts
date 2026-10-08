import { SvelteMap } from 'svelte/reactivity';

export interface PeerAudio {
	/** 0 to 1. */
	volume: number;
	muted: boolean;
}

const DEFAULT: PeerAudio = { volume: 1, muted: false };

function load(storageKey: string): [number, PeerAudio][] {
	const saved: [number, PeerAudio][] = [];
	try {
		const parsed = JSON.parse(localStorage.getItem(storageKey) ?? '{}');
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
export class PeerAudioStore {
	private peers: SvelteMap<number, PeerAudio>;

	constructor(private storageKey: string) {
		this.peers = new SvelteMap(typeof localStorage === 'undefined' ? [] : load(storageKey));
	}

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
			localStorage.setItem(this.storageKey, JSON.stringify(Object.fromEntries(this.peers)));
		} catch {
			/* storage blocked: the choice just won't survive a reload */
		}
	}
}

/** How loud each person's voice is. */
export const voicePeerAudioState = new PeerAudioStore('voice.peerAudio');
/** How loud each person's screen share sound is. */
export const voiceStreamAudioState = new PeerAudioStore('voice.streamAudio');
