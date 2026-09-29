import { AxiosError } from 'axios';
import { ConnectionError } from 'livekit-client';

/** The page can't use the microphone at all: not HTTPS/localhost, or no media API. */
export class InsecureContextError extends Error {}

/** Toast text for a failed join: token request, LiveKit connect, or environment. */
export function describeVoiceError(err: unknown): string {
	if (err instanceof InsecureContextError) return 'Voice needs a secure connection (HTTPS).';
	if (err instanceof AxiosError) {
		const status = err.response?.status;
		if (status === 503) return "Voice isn't set up on this server.";
		if (status === 403 || status === 404) return "You don't have access to this voice channel.";
		if (!err.response) return "Couldn't reach the server.";
	}
	if (err instanceof ConnectionError) return "Couldn't reach the voice server.";
	return "Couldn't join voice.";
}

/** Toast text for a microphone that failed to start. */
export function describeMicError(err: unknown): string {
	const name = err instanceof Error ? err.name : '';
	switch (name) {
		case 'NotAllowedError':
		case 'SecurityError':
			return "Microphone access is blocked. Allow it in your browser's site settings, then unmute.";
		case 'NotFoundError':
			return 'No microphone found.';
		case 'NotReadableError':
			return 'Your microphone is being used by another app.';
		default:
			return "Couldn't start your microphone.";
	}
}
