import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getVoicePresence } from '$lib/requests/voice/getVoicePresence';
import type { VoicePresenceParticipant } from '$lib/types/voice.types';
import { voicePresenceState } from './voicePresenceState.svelte';

vi.mock('$lib/requests/voice/getVoicePresence', () => ({ getVoicePresence: vi.fn() }));

const fetchPresence = vi.mocked(getVoicePresence);
const person = (user_id: number) => ({ user_id }) as unknown as VoicePresenceParticipant;

beforeEach(() => {
	voicePresenceState.reset();
	fetchPresence.mockReset();
});

describe('voicePresenceState.reset', () => {
	it('forgets who was in every channel', () => {
		voicePresenceState.apply(1, 10, [person(7)]);
		voicePresenceState.apply(2, 20, [person(8)]);

		voicePresenceState.reset();

		expect(voicePresenceState.participants(10)).toEqual([]);
		expect(voicePresenceState.participants(20)).toEqual([]);
		expect(voicePresenceState.serverOf(10)).toBeNull();
	});

	it('keeps a load that started before it from filling the next session', async () => {
		let finish!: (rows: Awaited<ReturnType<typeof getVoicePresence>>) => void;
		fetchPresence.mockReturnValue(new Promise((resolve) => (finish = resolve)));
		const loading = voicePresenceState.load(1);

		voicePresenceState.reset();
		finish([{ channel_id: 10, participants: [person(7)] }]);
		await loading;

		expect(voicePresenceState.participants(10)).toEqual([]);
	});
});
