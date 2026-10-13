import type { Call, CallMeta, CallStatus } from '$lib/types/call.types';

export type CallRowView = {
	text: string;
	canJoin: boolean;
	canDecline: boolean;
};

export type CallViewer = {
	/** The viewer started the call. */
	caller: boolean;
	callerName: string;
	/** The call is no longer among the viewer's open calls, whatever the cached row says. */
	stale: boolean;
};

export function isOpenCall(state: CallStatus): boolean {
	return state === 'ringing' || state === 'active';
}

/** 4:12, or 1:02:03 from an hour on. */
export function formatCallDuration(seconds: number): string {
	const total = Math.max(0, Math.floor(seconds));
	const hours = Math.floor(total / 3600);
	const minutes = Math.floor((total % 3600) / 60);
	const rest = String(total % 60).padStart(2, '0');
	return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${rest}` : `${minutes}:${rest}`;
}

/** What a call row says, and which buttons it offers, for the person looking at it. */
export function callRowView(call: CallMeta, viewer: CallViewer): CallRowView {
	const view = (text: string, canJoin = false, canDecline = false) => ({
		text,
		canJoin,
		canDecline
	});

	if (isOpenCall(call.state) && viewer.stale) return view('Call ended');

	switch (call.state) {
		case 'ringing':
			return viewer.caller
				? view('Calling…', true)
				: view(`${viewer.callerName} is calling`, true, true);
		case 'active':
			return view('In a call', true);
		case 'ended':
			return view(
				call.duration_s != null
					? `Call ended · ${formatCallDuration(call.duration_s)}`
					: 'Call ended'
			);
		case 'missed':
			if (!viewer.caller) return view('Missed call');
			return view(call.reason === 'cancelled' ? 'Call cancelled' : 'No answer');
		case 'declined':
			return view('Call declined');
	}
}

/** The call row's `call` object, from the API's description of the same call. */
export function callMeta(call: Call): CallMeta {
	return {
		id: call.id,
		state: call.state,
		reason: call.reason,
		started_at: call.created_at,
		answered_at: call.answered_at,
		ended_at: call.ended_at,
		duration_s: call.duration_s
	};
}
