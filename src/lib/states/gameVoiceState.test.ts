import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getGameSession } from '$lib/requests/game';
import type { GameSession } from '$lib/types/game.types';
import { gameVoiceState } from './gameVoiceState.svelte';

vi.mock('$lib/requests/game', () => ({ getGameSession: vi.fn() }));

const fetchSession = vi.mocked(getGameSession);

const ME = 4;
const CHANNEL = 9;

function session(overrides: Partial<GameSession> = {}): GameSession {
	return {
		server_id: 1,
		channel_id: CHANNEL,
		integration_id: 3,
		name: 'Minecraft',
		active: true,
		players_hear_spectators: false,
		players: [
			{ user_id: ME, player_name: 'Steve' },
			{ user_id: 7, player_name: 'Alex' }
		],
		...overrides
	};
}

beforeEach(() => {
	gameVoiceState.reset();
	gameVoiceState.onChange = null;
	fetchSession.mockReset();
});

describe('gameVoiceState.factor', () => {
	const mix = { channel_id: CHANNEL, integration_id: 3, gains: { '7': 0.42 } };

	it.each([
		['no session', undefined, false, 7, 1],
		['I am not a player', session({ players: [{ user_id: 7, player_name: 'Alex' }] }), true, 7, 1],
		['a player with a gain', session(), true, 7, 0.42],
		[
			'a player missing from my gains',
			session({ players: [...session().players, { user_id: 12, player_name: 'Bob' }] }),
			true,
			12,
			0
		],
		['a spectator, who players cannot hear', session(), true, 99, 0],
		['a spectator, who players can hear', session({ players_hear_spectators: true }), true, 99, 1],
		['a player before any mix arrived', session(), false, 7, 0]
	])('%s', (_label, frame, withMix, peer, expected) => {
		if (frame) gameVoiceState.applySession(frame);
		if (withMix) gameVoiceState.applyMix(mix);
		expect(gameVoiceState.factor(ME, CHANNEL, peer)).toBe(expected);
	});

	it('is 1 when my own id is unknown', () => {
		gameVoiceState.applySession(session());
		expect(gameVoiceState.factor(undefined, CHANNEL, 7)).toBe(1);
	});

	it('ignores gains and sessions of another channel', () => {
		gameVoiceState.applySession(session());
		gameVoiceState.applyMix({ channel_id: 12, integration_id: 5, gains: { '7': 0.9 } });
		expect(gameVoiceState.factor(ME, CHANNEL, 7)).toBe(0);
		expect(gameVoiceState.factor(ME, 12, 7)).toBe(1);
	});
});

describe('gameVoiceState frames', () => {
	it('keeps the session and who is playing', () => {
		gameVoiceState.applySession(session());
		expect(gameVoiceState.isPlayer(CHANNEL, 7)).toBe(true);
		expect(gameVoiceState.isPlayer(CHANNEL, 99)).toBe(false);
		expect(gameVoiceState.playerName(CHANNEL, 7)).toBe('Alex');
		expect(gameVoiceState.playerName(CHANNEL, 99)).toBeNull();
	});

	it('forgets the session and my gains when it ends', () => {
		gameVoiceState.applySession(session());
		gameVoiceState.applyMix({ channel_id: CHANNEL, integration_id: 3, gains: { '7': 0.42 } });

		gameVoiceState.applySession(session({ active: false, players: [] }));

		expect(gameVoiceState.session(CHANNEL)).toBeNull();
		expect(gameVoiceState.factor(ME, CHANNEL, 7)).toBe(1);

		gameVoiceState.applySession(session());
		expect(gameVoiceState.factor(ME, CHANNEL, 7)).toBe(0);
	});

	it('reports each change with its channel', () => {
		const changed = vi.fn();
		gameVoiceState.onChange = changed;

		gameVoiceState.applySession(session());
		gameVoiceState.applyMix({ channel_id: 12, integration_id: 5, gains: {} });

		expect(changed.mock.calls).toEqual([[CHANNEL], [12]]);
	});
});

describe('gameVoiceState.load', () => {
	it('sets the session from a 200', async () => {
		fetchSession.mockResolvedValue(session());
		await gameVoiceState.load(CHANNEL);
		expect(gameVoiceState.isPlayer(CHANNEL, ME)).toBe(true);
	});

	it('clears the session on a 204', async () => {
		gameVoiceState.applySession(session());
		fetchSession.mockResolvedValue(null);
		await gameVoiceState.load(CHANNEL);
		expect(gameVoiceState.session(CHANNEL)).toBeNull();
	});

	it('keeps what it had when the request fails', async () => {
		gameVoiceState.applySession(session());
		fetchSession.mockRejectedValue(new Error('offline'));
		await gameVoiceState.load(CHANNEL);
		expect(gameVoiceState.session(CHANNEL)).not.toBeNull();
	});

	it('lets a frame that arrived meanwhile win', async () => {
		let finish!: (value: GameSession | null) => void;
		fetchSession.mockReturnValue(new Promise((resolve) => (finish = resolve)));
		const loading = gameVoiceState.load(CHANNEL);

		gameVoiceState.applySession(session({ active: false, players: [] }));
		finish(session());
		await loading;

		expect(gameVoiceState.session(CHANNEL)).toBeNull();
	});
});
