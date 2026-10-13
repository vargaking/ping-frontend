import { normalizeError } from '$lib/requests/errors';

/** Why a link code didn't work, in words for the player. */
export function linkCodeProblem(error: unknown): string {
	const { status, message } = normalizeError(error);
	if (status === 404) return 'This code is invalid or expired. Run /zeta link again in the game.';
	if (status === 403) return 'Join the server in Zet first.';
	return message;
}
