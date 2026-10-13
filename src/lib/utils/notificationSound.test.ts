import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const context = vi.hoisted(() => ({
	state: 'suspended',
	currentTime: 0,
	destination: {},
	createOscillator: vi.fn(),
	createGain: vi.fn()
}));

class FakeAudioContext {
	constructor() {
		return context;
	}
}

function node() {
	return {
		type: '',
		frequency: { value: 0 },
		gain: { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() },
		connect: vi.fn(),
		start: vi.fn(),
		stop: vi.fn()
	};
}

const listeners = vi.hoisted(() => new Map<string, Set<(event: { persisted: boolean }) => void>>());

function fire(type: string, persisted = false) {
	listeners.get(type)?.forEach((listener) => listener({ persisted }));
}

import { startRing } from './notificationSound';

beforeEach(() => {
	vi.useFakeTimers();
	context.state = 'suspended';
	context.createOscillator.mockReset().mockImplementation(node);
	context.createGain.mockReset().mockImplementation(node);
	listeners.clear();
	vi.stubGlobal('window', {
		AudioContext: FakeAudioContext,
		addEventListener: (type: string, listener: (event: { persisted: boolean }) => void) => {
			if (!listeners.has(type)) listeners.set(type, new Set());
			listeners.get(type)!.add(listener);
		},
		removeEventListener: (type: string, listener: (event: { persisted: boolean }) => void) =>
			listeners.get(type)?.delete(listener)
	});
});

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

describe('the ring', () => {
	it('rings at once and again every couple of seconds', () => {
		context.state = 'running';
		const stop = startRing();
		expect(context.createOscillator).toHaveBeenCalledTimes(2);

		vi.advanceTimersByTime(4_000);
		expect(context.createOscillator).toHaveBeenCalledTimes(6);
		stop();
	});

	it('stays silent until the audio context is running, then is heard', () => {
		const stop = startRing();
		vi.advanceTimersByTime(4_000);
		expect(context.createOscillator).not.toHaveBeenCalled();

		context.state = 'running';
		vi.advanceTimersByTime(2_000);
		expect(context.createOscillator).toHaveBeenCalledTimes(2);
		stop();
	});

	it('stops when told to', () => {
		context.state = 'running';
		const stop = startRing();
		stop();
		vi.advanceTimersByTime(10_000);

		expect(context.createOscillator).toHaveBeenCalledTimes(2);
		expect(vi.getTimerCount()).toBe(0);
		expect([...listeners.values()].every((set) => set.size === 0)).toBe(true);
	});

	it('pauses when the page is left and rings again when it comes back from the cache', () => {
		context.state = 'running';
		const stop = startRing();
		fire('pagehide');
		vi.advanceTimersByTime(10_000);
		expect(context.createOscillator).toHaveBeenCalledTimes(2);
		expect(vi.getTimerCount()).toBe(0);

		fire('pageshow', true);
		expect(context.createOscillator).toHaveBeenCalledTimes(4);
		vi.advanceTimersByTime(2_000);
		expect(context.createOscillator).toHaveBeenCalledTimes(6);
		stop();
	});

	it('does not ring twice when the page is shown without having been hidden', () => {
		context.state = 'running';
		const stop = startRing();
		fire('pageshow', true);
		expect(context.createOscillator).toHaveBeenCalledTimes(2);
		expect(vi.getTimerCount()).toBe(1);
		stop();
	});
});
