import { AxiosError } from 'axios';
import { ConnectionError } from 'livekit-client';

/** The page can't use the microphone at all: not HTTPS/localhost, or no media API. */
export class InsecureContextError extends Error {}

/** The call ended before the token was asked for. */
export function isCallEnded(err: unknown): boolean {
	return err instanceof AxiosError && err.response?.status === 409;
}

/** Toast text for a failed join: token request, LiveKit connect, or environment. */
export function describeVoiceError(err: unknown, kind: 'channel' | 'call' = 'channel'): string {
	if (err instanceof InsecureContextError) return 'Voice needs a secure connection (HTTPS).';
	if (err instanceof AxiosError) {
		const status = err.response?.status;
		if (status === 503) return "Voice isn't set up on this server.";
		if (kind === 'call') {
			if (status === 409) return 'This call has ended.';
			if (status === 403 || status === 404) return "You can't join this call.";
		} else if (status === 403 || status === 404) {
			return "You don't have access to this voice channel.";
		}
		if (!err.response) return "Couldn't reach the server.";
	}
	if (err instanceof ConnectionError) return "Couldn't reach the voice server.";
	return "Couldn't join voice.";
}

/** Why the microphone isn't live. 'off' means it hasn't been asked for yet or the user skipped it. */
export type MicIssue = 'off' | 'blocked' | 'notFound' | 'inUse' | 'failed';

export function classifyMicError(err: unknown): MicIssue {
	switch (err instanceof Error ? err.name : '') {
		case 'NotAllowedError':
		case 'SecurityError':
			return 'blocked';
		case 'NotFoundError':
			return 'notFound';
		case 'NotReadableError':
			return 'inUse';
		default:
			return 'failed';
	}
}

/** Banner text for a microphone that isn't live. */
export function micIssueText(issue: MicIssue): string {
	switch (issue) {
		case 'blocked':
			return "Microphone blocked — allow it in your browser's site settings";
		case 'notFound':
			return 'No microphone found';
		case 'inUse':
			return 'Your microphone is being used by another app';
		case 'failed':
			return "Couldn't start your microphone";
		case 'off':
			return 'Your microphone is off';
	}
}

/** Toast text for a microphone that failed to start. */
export function describeMicError(err: unknown): string {
	switch (classifyMicError(err)) {
		case 'blocked':
			return "Microphone access is blocked. Allow it in your browser's site settings, then unmute.";
		case 'notFound':
			return 'No microphone found.';
		case 'inUse':
			return 'Your microphone is being used by another app.';
		default:
			return "Couldn't start your microphone.";
	}
}
