import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Call } from '$lib/types/call.types';

vi.mock('$lib/requests/calls/refreshCall', () => ({
	refreshCall: vi.fn(),
	refreshCallOnUnload: vi.fn()
}));
vi.mock('$lib/requests/voice/refreshVoicePresence', () => ({
	refreshVoicePresence: vi.fn(),
	refreshVoicePresenceOnUnload: vi.fn()
}));

import { callRoster } from './callRoster.svelte';
import { usersState } from './usersState.svelte';
import { voiceState, type VoicePeer } from './voiceState.svelte';

const ME = 1;
const OTHER = 2;
const CONVERSATION = 5;

const call = (state: Call['state']): Call => ({
	id: 10,
	conversation_id: CONVERSATION,
	message_id: 'm',
	caller_id: ME,
	callee_id: OTHER,
	state,
	reason: null,
	created_at: '2026-10-12T10:00:00Z',
	ring_expires_at: '2026-10-12T10:00:30Z',
	answered_at: null,
	ended_at: null,
	duration_s: null
});

const peer = (id: number): VoicePeer => ({
	id: String(id),
	username: `user${id}`,
	profile: {},
	isSpeaking: false,
	muted: false,
	deafened: false,
	serverMuted: false,
	streaming: false
});

function joinRoom(...ids: number[]) {
	Object.assign(voiceState, { callId: 10, callConversationId: CONVERSATION, connected: true });
	for (const id of ids) voiceState.peers.set(String(id), peer(id));
}

afterEach(() => {
	(voiceState as unknown as { cleanup: () => void }).cleanup();
	voiceState.peers.clear();
	usersState.loggedInUser = null;
});

const summary = (members: ReturnType<typeof callRoster>) =>
	members.map((m) => [m.userId, m.status ?? null]);

describe('callRoster', () => {
	it('lists the person being called as ringing until they are in the room', () => {
		usersState.loggedInUser = { id: ME } as typeof usersState.loggedInUser;
		joinRoom(ME);

		expect(summary(callRoster(call('ringing'), CONVERSATION))).toEqual([
			[ME, null],
			[OTHER, 'Ringing…']
		]);
	});

	it('drops the ringing note once the other person is in', () => {
		usersState.loggedInUser = { id: ME } as typeof usersState.loggedInUser;
		joinRoom(ME, OTHER);

		expect(summary(callRoster(call('active'), CONVERSATION))).toEqual([
			[ME, null],
			[OTHER, null]
		]);
	});

	it('leaves out the person who left an active call', () => {
		usersState.loggedInUser = { id: ME } as typeof usersState.loggedInUser;
		joinRoom(ME);

		expect(summary(callRoster(call('active'), CONVERSATION))).toEqual([[ME, null]]);
	});

	it('shows both people of an open call to someone who has not joined', () => {
		usersState.loggedInUser = { id: OTHER } as typeof usersState.loggedInUser;

		expect(summary(callRoster(call('ringing'), CONVERSATION))).toEqual([
			[ME, null],
			[OTHER, 'Ringing…']
		]);
	});

	it.each([
		{ name: 'a finished call', given: call('ended') },
		{ name: 'no call', given: null }
	])('is empty for $name when not in the room', ({ given }) => {
		expect(callRoster(given, CONVERSATION)).toEqual([]);
	});

	it('marks only the viewer as self and has no channel', () => {
		usersState.loggedInUser = { id: ME } as typeof usersState.loggedInUser;
		joinRoom(ME, OTHER);

		const members = callRoster(call('active'), CONVERSATION);

		expect(members.map((m) => m.self)).toEqual([true, false]);
		expect(members.every((m) => m.channelId === null && m.viewerInCall)).toBe(true);
	});
});
