import { describe, expect, it } from 'vitest';
import { decideVoiceTap, movingNotice } from './voiceJoin';

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
