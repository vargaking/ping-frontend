import type { JSONContent } from '@tiptap/core';

export type CallStatus = 'ringing' | 'active' | 'ended' | 'missed' | 'declined';

export type CallEndReason =
	| 'hangup'
	| 'alone'
	| 'timeout'
	| 'cancelled'
	| 'declined'
	| 'abandoned'
	| 'expired';

export type Call = {
	id: number;
	conversation_id: number;
	/** The uuid of the call's row in the conversation. */
	message_id: string;
	caller_id: number;
	callee_id: number;
	state: CallStatus;
	reason: CallEndReason | null;
	created_at: string;
	ring_expires_at: string;
	answered_at: string | null;
	ended_at: string | null;
	duration_s: number | null;
};

/** The `call` object on a call row, in history and in direct_message frames. */
export type CallMeta = {
	id: number;
	state: CallStatus;
	reason: CallEndReason | null;
	started_at: string;
	answered_at: string | null;
	ended_at: string | null;
	duration_s: number | null;
};

export type CallStateFrame = {
	type: 'call_state';
	call: Call;
	/** The row's new fallback text. */
	content: JSONContent;
};

export type CallToken = { token: string; url: string; room: string };
