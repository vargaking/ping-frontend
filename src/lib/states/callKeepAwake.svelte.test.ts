import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/requests/voice/refreshVoicePresence', () => ({
	refreshVoicePresence: vi.fn(),
	refreshVoicePresenceOnUnload: vi.fn()
}));

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

function fakeSentinel() {
	const listeners: (() => void)[] = [];
	const sentinel = {
		released: false,
		addEventListener: (_type: string, listener: () => void) => listeners.push(listener),
		release: vi.fn(async () => {
			sentinel.released = true;
			listeners.forEach((listener) => listener());
		})
	};
	return sentinel;
}

type Sentinel = ReturnType<typeof fakeSentinel>;

let visibility: 'visible' | 'hidden';
let onVisibilityChange: (() => void)[];
let sentinels: Sentinel[];
let request: ReturnType<typeof vi.fn>;
let storage: Map<string, string>;
let storageBlocked: boolean;

function stubBrowser(wakeLock: { request: unknown } | undefined) {
	visibility = 'visible';
	onVisibilityChange = [];
	storage = new Map();
	storageBlocked = false;
	vi.stubGlobal('document', {
		get visibilityState() {
			return visibility;
		},
		addEventListener: (_type: string, listener: () => void) => onVisibilityChange.push(listener)
	});
	vi.stubGlobal('navigator', { wakeLock });
	vi.stubGlobal('localStorage', {
		getItem: (key: string) => {
			if (storageBlocked) throw new Error('blocked');
			return storage.get(key) ?? null;
		},
		setItem: (key: string, value: string) => {
			if (storageBlocked) throw new Error('blocked');
			storage.set(key, value);
		}
	});
}

async function load(wakeLock: { request: unknown } | undefined = { request }) {
	vi.resetModules();
	stubBrowser(wakeLock);
	const { phoneState } = await import('./phoneState.svelte');
	const { voiceState } = await import('./voiceState.svelte');
	const { callKeepAwake } = await import('./callKeepAwake.svelte');
	callKeepAwake.start();
	return { phoneState, voiceState, callKeepAwake };
}

async function changeVisibility(next: 'visible' | 'hidden') {
	visibility = next;
	if (next === 'hidden') sentinels.forEach((sentinel) => void sentinel.release());
	onVisibilityChange.forEach((listener) => listener());
	await settle();
}

beforeEach(() => {
	sentinels = [];
	request = vi.fn(async () => {
		const sentinel = fakeSentinel();
		sentinels.push(sentinel);
		return sentinel;
	});
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('wake lock', () => {
	it('is taken when the call connects and released when it ends', async () => {
		const { phoneState, voiceState } = await load();
		phoneState.touch = true;
		voiceState.connected = true;
		await settle();
		expect(request).toHaveBeenCalledExactlyOnceWith('screen');

		voiceState.connected = false;
		await settle();
		expect(sentinels[0].release).toHaveBeenCalledOnce();
	});

	it('is kept while the call reconnects', async () => {
		const { phoneState, voiceState } = await load();
		phoneState.touch = true;
		voiceState.connected = true;
		await settle();

		voiceState.connected = false;
		voiceState.reconnecting = true;
		await settle();
		expect(sentinels[0].release).not.toHaveBeenCalled();
		expect(request).toHaveBeenCalledOnce();
	});

	it('is taken again when the page becomes visible during the call', async () => {
		const { phoneState, voiceState } = await load();
		phoneState.touch = true;
		voiceState.connected = true;
		await settle();

		await changeVisibility('hidden');
		expect(request).toHaveBeenCalledOnce();

		await changeVisibility('visible');
		expect(request).toHaveBeenCalledTimes(2);
		expect(sentinels[1].released).toBe(false);
	});

	it('is not taken while the page is hidden', async () => {
		const { phoneState, voiceState } = await load();
		visibility = 'hidden';
		phoneState.touch = true;
		voiceState.connected = true;
		await settle();
		expect(request).not.toHaveBeenCalled();

		await changeVisibility('visible');
		expect(request).toHaveBeenCalledOnce();
	});

	it('is not taken again on return once the call has ended', async () => {
		const { phoneState, voiceState } = await load();
		phoneState.touch = true;
		voiceState.connected = true;
		await settle();

		await changeVisibility('hidden');
		voiceState.connected = false;
		await settle();
		await changeVisibility('visible');
		expect(request).toHaveBeenCalledOnce();
	});

	it('is released when the request finishes after the call has ended', async () => {
		const pending = fakeSentinel();
		let grant!: () => void;
		request.mockImplementation(
			() =>
				new Promise((resolve) => {
					grant = () => resolve(pending);
				})
		);
		const { phoneState, voiceState } = await load();
		phoneState.touch = true;
		voiceState.connected = true;
		await settle();
		voiceState.connected = false;
		await settle();

		grant();
		await settle();
		expect(pending.release).toHaveBeenCalledOnce();
	});

	it.each([
		['without a touch screen', { touch: false, connected: true }],
		['outside a call', { touch: true, connected: false }]
	])('is not taken %s', async (_name, { touch, connected }) => {
		const { phoneState, voiceState } = await load();
		phoneState.touch = touch;
		voiceState.connected = connected;
		await settle();
		expect(request).not.toHaveBeenCalled();
	});

	it('tries again after a refused request', async () => {
		request.mockRejectedValueOnce(new DOMException('refused', 'NotAllowedError'));
		const { phoneState, voiceState } = await load();
		phoneState.touch = true;
		voiceState.connected = true;
		await settle();
		expect(request).toHaveBeenCalledOnce();
		expect(sentinels).toHaveLength(0);

		await changeVisibility('hidden');
		await changeVisibility('visible');
		expect(sentinels).toHaveLength(1);
	});
});

describe('phone note', () => {
	it('shows on a phone during a call', async () => {
		const { phoneState, voiceState, callKeepAwake } = await load();
		expect(callKeepAwake.noteVisible).toBe(false);

		phoneState.phone = true;
		voiceState.connected = true;
		await settle();
		expect(callKeepAwake.noteVisible).toBe(true);
	});

	it('stays hidden off a phone', async () => {
		const { voiceState, callKeepAwake } = await load();
		voiceState.connected = true;
		await settle();
		expect(callKeepAwake.noteVisible).toBe(false);
	});

	it('hides once dismissed and stays hidden on later calls', async () => {
		const { phoneState, voiceState, callKeepAwake } = await load();
		phoneState.phone = true;
		voiceState.connected = true;
		await settle();

		callKeepAwake.dismissNote();
		expect(callKeepAwake.noteVisible).toBe(false);

		voiceState.connected = false;
		await settle();
		voiceState.connected = true;
		await settle();
		expect(callKeepAwake.noteVisible).toBe(false);
	});

	it('is marked seen when the call ends, even without a dismiss', async () => {
		const first = await load();
		first.phoneState.phone = true;
		first.voiceState.connected = true;
		await settle();
		expect(first.callKeepAwake.noteVisible).toBe(true);

		first.voiceState.connected = false;
		await settle();
		first.voiceState.connected = true;
		await settle();
		expect(first.callKeepAwake.noteVisible).toBe(false);
	});

	it('is remembered across loads', async () => {
		const first = await load();
		first.phoneState.phone = true;
		first.voiceState.connected = true;
		await settle();
		first.callKeepAwake.dismissNote();

		vi.resetModules();
		const { phoneState } = await import('./phoneState.svelte');
		const { voiceState } = await import('./voiceState.svelte');
		const { callKeepAwake } = await import('./callKeepAwake.svelte');
		phoneState.phone = true;
		voiceState.connected = true;
		await settle();
		expect(callKeepAwake.noteVisible).toBe(false);
	});

	it.each([
		['a call off a phone', { phone: false, field: 'connected' }],
		['a phone join that never connects', { phone: true, field: 'connecting' }]
	] as const)('is not used up by %s', async (_name, { phone, field }) => {
		const { phoneState, voiceState, callKeepAwake } = await load();
		phoneState.phone = phone;
		voiceState[field] = true;
		await settle();
		voiceState[field] = false;
		await settle();

		phoneState.phone = true;
		voiceState.connected = true;
		await settle();
		expect(callKeepAwake.noteVisible).toBe(true);
	});

	it('still hides for the session when storage is blocked', async () => {
		const { phoneState, voiceState, callKeepAwake } = await load();
		storageBlocked = true;
		phoneState.phone = true;
		voiceState.connected = true;
		await settle();

		expect(() => callKeepAwake.dismissNote()).not.toThrow();
		expect(callKeepAwake.noteVisible).toBe(false);
	});
});
