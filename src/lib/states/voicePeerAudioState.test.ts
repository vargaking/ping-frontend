import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
	PeerAudioStore,
	voicePeerAudioState,
	voiceStreamAudioState
} from './voicePeerAudioState.svelte';

function memoryStorage(initial: Record<string, string> = {}) {
	const data = new Map(Object.entries(initial));
	return {
		getItem: (key: string) => data.get(key) ?? null,
		setItem: (key: string, value: string) => void data.set(key, value),
		removeItem: (key: string) => void data.delete(key),
		clear: () => data.clear()
	};
}

let storage: ReturnType<typeof memoryStorage>;

function install(initial?: Record<string, string>) {
	storage = memoryStorage(initial);
	Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });
}

beforeEach(() => install());

afterEach(() => {
	Reflect.deleteProperty(globalThis, 'localStorage');
});

describe('PeerAudioStore', () => {
	it('defaults to full volume', () => {
		const store = new PeerAudioStore('test.audio');
		expect(store.get(1)).toEqual({ volume: 1, muted: false });
		expect(store.level(1)).toBe(1);
	});

	it('persists under its key and restores in a new store', () => {
		new PeerAudioStore('test.audio').set(7, { volume: 0.4 });
		expect(JSON.parse(storage.getItem('test.audio') ?? '{}')).toEqual({
			'7': { volume: 0.4, muted: false }
		});
		expect(new PeerAudioStore('test.audio').get(7)).toEqual({ volume: 0.4, muted: false });
	});

	it('removes entries that return to the default', () => {
		const store = new PeerAudioStore('test.audio');
		store.set(7, { volume: 0.4 });
		store.set(7, { volume: 1 });
		expect(JSON.parse(storage.getItem('test.audio') ?? '{}')).toEqual({});
		expect(new PeerAudioStore('test.audio').get(7).volume).toBe(1);
	});

	it('muting plays at zero and keeps the volume', () => {
		const store = new PeerAudioStore('test.audio');
		store.set(7, { volume: 0.4 });
		store.set(7, { muted: true });
		expect(store.level(7)).toBe(0);
		expect(store.get(7).volume).toBe(0.4);
		store.set(7, { muted: false });
		expect(store.level(7)).toBe(0.4);
	});

	it('keeps a muted person even at full volume', () => {
		const store = new PeerAudioStore('test.audio');
		store.set(7, { muted: true });
		expect(new PeerAudioStore('test.audio').level(7)).toBe(0);
	});

	it('ignores malformed storage', () => {
		install({ 'test.audio': '{not json' });
		expect(new PeerAudioStore('test.audio').get(1).volume).toBe(1);
	});

	it('skips invalid entries and keeps valid ones', () => {
		install({
			'test.audio': JSON.stringify({
				'1': { volume: 5 },
				'2': { volume: 'loud' },
				'3': { volume: 0.5, muted: true }
			})
		});
		const store = new PeerAudioStore('test.audio');
		expect(store.get(1).volume).toBe(1);
		expect(store.get(2).volume).toBe(1);
		expect(store.get(3)).toEqual({ volume: 0.5, muted: true });
	});

	it('works without localStorage', () => {
		Reflect.deleteProperty(globalThis, 'localStorage');
		const store = new PeerAudioStore('test.audio');
		expect(store.get(1).volume).toBe(1);
	});
});

describe('voice and stream stores', () => {
	it('are independent', () => {
		voicePeerAudioState.set(9, { volume: 0.2 });
		expect(voiceStreamAudioState.get(9)).toEqual({ volume: 1, muted: false });
		expect(voiceStreamAudioState.level(9)).toBe(1);
		expect(storage.getItem('voice.streamAudio')).toBeNull();

		voiceStreamAudioState.set(9, { muted: true });
		expect(voicePeerAudioState.level(9)).toBe(0.2);
		expect(voiceStreamAudioState.level(9)).toBe(0);
		expect(JSON.parse(storage.getItem('voice.peerAudio') ?? '{}')['9']).toEqual({
			volume: 0.2,
			muted: false
		});
		expect(JSON.parse(storage.getItem('voice.streamAudio') ?? '{}')['9']).toEqual({
			volume: 1,
			muted: true
		});
	});
});
