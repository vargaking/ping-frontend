import { describe, expect, it } from 'vitest';
import type { CallMeta } from '$lib/types/call.types';
import { callRowView, formatCallDuration, type CallViewer } from './callText';

const meta = (overrides: Partial<CallMeta> = {}): CallMeta => ({
	id: 1,
	state: 'ringing',
	reason: null,
	started_at: '2026-10-12T10:00:00Z',
	answered_at: null,
	ended_at: null,
	duration_s: null,
	...overrides
});

const caller: CallViewer = { caller: true, callerName: 'Alice', stale: false };
const callee: CallViewer = { caller: false, callerName: 'Alice', stale: false };

describe('callRowView', () => {
	it.each([
		{
			side: 'caller',
			viewer: caller,
			expected: { text: 'Calling…', canJoin: true, canDecline: false }
		},
		{
			side: 'callee',
			viewer: callee,
			expected: { text: 'Alice is calling', canJoin: true, canDecline: true }
		}
	])('a ringing call looks right for the $side', ({ viewer, expected }) => {
		expect(callRowView(meta(), viewer)).toEqual(expected);
	});

	it.each([caller, callee])('an active call can be joined by either person', (viewer) => {
		expect(callRowView(meta({ state: 'active' }), viewer)).toEqual({
			text: 'In a call',
			canJoin: true,
			canDecline: false
		});
	});

	it.each([
		{ duration_s: 252, text: 'Call ended · 4:12' },
		{ duration_s: 5, text: 'Call ended · 0:05' },
		{ duration_s: 3723, text: 'Call ended · 1:02:03' },
		{ duration_s: null, text: 'Call ended' }
	])('an ended call with duration $duration_s reads "$text"', ({ duration_s, text }) => {
		const view = callRowView(meta({ state: 'ended', reason: 'hangup', duration_s }), callee);
		expect(view).toEqual({ text, canJoin: false, canDecline: false });
	});

	it.each([
		{ reason: 'timeout', viewer: caller, text: 'No answer' },
		{ reason: 'cancelled', viewer: caller, text: 'Call cancelled' },
		{ reason: 'timeout', viewer: callee, text: 'Missed call' },
		{ reason: 'cancelled', viewer: callee, text: 'Missed call' }
	] as const)('a missed call ($reason) reads "$text" for the one it was meant for', (c) => {
		expect(callRowView(meta({ state: 'missed', reason: c.reason }), c.viewer).text).toBe(c.text);
	});

	it.each([caller, callee])('a declined call reads the same for both', (viewer) => {
		const view = callRowView(meta({ state: 'declined', reason: 'declined' }), viewer);
		expect(view.text).toBe('Call declined');
		expect(view.canJoin).toBe(false);
	});

	it.each([
		{ state: 'ringing', viewer: caller },
		{ state: 'ringing', viewer: callee },
		{ state: 'active', viewer: callee }
	] as const)(
		'a cached $state row that the server no longer lists reads "Call ended"',
		({ state, viewer }) => {
			expect(callRowView(meta({ state }), { ...viewer, stale: true })).toEqual({
				text: 'Call ended',
				canJoin: false,
				canDecline: false
			});
		}
	);

	it('keeps a finished call as it is when the list is out of date', () => {
		const view = callRowView(meta({ state: 'declined' }), { ...callee, stale: true });
		expect(view.text).toBe('Call declined');
	});
});

describe('formatCallDuration', () => {
	it.each([
		[0, '0:00'],
		[59, '0:59'],
		[60, '1:00'],
		[3599, '59:59'],
		[3600, '1:00:00'],
		[-3, '0:00']
	])('%i seconds is %s', (seconds, text) => {
		expect(formatCallDuration(seconds)).toBe(text);
	});
});
