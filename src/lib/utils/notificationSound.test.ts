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

const pagehide = vi.hoisted(() => ({ listeners: new Set<() => void>() }));

import { startRing } from './notificationSound';

beforeEach(() => {
	vi.useFakeTimers();
	context.state = 'suspended';
	context.createOscillator.mockReset().mockImplementation(node);
	context.createGain.mockReset().mockImplementation(node);
	pagehide.listeners.clear();
	vi.stubGlobal('window', {
		AudioContext: FakeAudioContext,
		addEventListener: (_: string, listener: () => void) => pagehide.listeners.add(listener),
		removeEventListener: (_: string, listener: () => void) => pagehide.listeners.delete(listener)
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
		expect(pagehide.listeners.size).toBe(0);
	});

	it('stops when the page is left', () => {
		context.state = 'running';
		startRing();
		pagehide.listeners.forEach((listener) => listener());
		vi.advanceTimersByTime(10_000);

		expect(context.createOscillator).toHaveBeenCalledTimes(2);
		expect(vi.getTimerCount()).toBe(0);
	});
});
