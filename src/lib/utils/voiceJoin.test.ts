import { describe, expect, it } from 'vitest';
import { decideVoiceTap, movingNotice, setSavedMute, type SelfStateControls } from './voiceJoin';

describe('decideVoiceTap', () => {
	it.each([
		{
			name: 'asks first on a phone',
			phone: true,
			inChannel: false,
			canConnect: true,
			want: 'sheet'
		},
		{
			name: 'joins at once elsewhere',
			phone: false,
			inChannel: false,
			canConnect: true,
			want: 'join'
		},
		{
			name: 'opens the channel you are in',
			phone: true,
			inChannel: true,
			canConnect: true,
			want: 'view'
		},
		{
			name: 'opens your channel on desktop',
			phone: false,
			inChannel: true,
			canConnect: true,
			want: 'view'
		},
		{
			name: 'opens the page without Connect',
			phone: true,
			inChannel: false,
			canConnect: false,
			want: 'view'
		},
		{
			name: 'opens the page without Connect on desktop',
			phone: false,
			inChannel: false,
			canConnect: false,
			want: 'view'
		}
	])('$name', ({ phone, inChannel, canConnect, want }) => {
		expect(decideVoiceTap({ phone, inChannel, canConnect })).toBe(want);
	});
});

describe('movingNotice', () => {
	it.each([
		{ name: 'not in a call', current: { channelId: null, channelName: null }, want: null },
		{ name: 'in the target', current: { channelId: 7, channelName: 'lobby' }, want: null },
		{
			name: 'in another channel',
			current: { channelId: 3, channelName: 'standup' },
			want: 'Joining will move you from standup.'
		},
		{
			name: 'in another channel with no known name',
			current: { channelId: 3, channelName: null },
			want: 'Joining will move you from your current voice channel.'
		}
	])('$name', ({ current, want }) => {
		expect(movingNotice(current, 7)).toBe(want);
	});
});

/** Behaves like the real toggles: unmuting while deafened also undeafens. */
function fakeVoice(start: { muted: boolean; deafened: boolean }) {
	const calls: string[] = [];
	const voice: SelfStateControls = {
		...start,
		async toggleMute() {
			calls.push('mute');
			this.muted = this.deafened ? false : !this.muted;
			this.deafened = false;
		},
		async toggleDeafen() {
			calls.push('deafen');
			this.deafened = !this.deafened;
		}
	};
	return { voice, calls };
}

describe('setSavedMute', () => {
	it.each([
		{ from: { muted: false, deafened: false }, to: true, calls: ['mute'] },
		{ from: { muted: true, deafened: false }, to: false, calls: ['mute'] },
		{ from: { muted: true, deafened: false }, to: true, calls: [] },
		{ from: { muted: false, deafened: false }, to: false, calls: [] },
		{ from: { muted: false, deafened: true }, to: true, calls: ['deafen', 'mute', 'deafen'] },
		{ from: { muted: true, deafened: true }, to: false, calls: ['deafen', 'mute', 'deafen'] },
		{ from: { muted: true, deafened: true }, to: true, calls: [] }
	])('$from -> muted $to', async ({ from, to, calls }) => {
		const fake = fakeVoice(from);
		await setSavedMute(fake.voice, to);
		expect(fake.voice.muted).toBe(to);
		expect(fake.voice.deafened).toBe(from.deafened);
		expect(fake.calls).toEqual(calls);
	});
});
