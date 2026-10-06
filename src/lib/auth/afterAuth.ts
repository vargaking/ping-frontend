import { UNREACHABLE_MESSAGE } from '$lib/requests/errors';

export type AuthKind = 'login' | 'register';

export type AuthProblem = {
	/** Shown as the form error. */
	message: string;
	/** Sent to the error log, or null when there is nothing for the server to learn. */
	report: string | null;
};

const SESSION_HINT =
	"this browser didn't keep you logged in. Allow cookies for this site, or open Zeta in another browser.";

/** What to do once the server accepted the credentials: null to go on into the app,
 *  otherwise why staying put is better than bouncing off the route guard. */
export function authProblem(
	init: 'ok' | 'unreachable',
	signedIn: boolean,
	kind: AuthKind
): AuthProblem | null {
	if (init === 'unreachable') return { message: UNREACHABLE_MESSAGE, report: null };
	if (signedIn) return null;
	return kind === 'login'
		? { message: `Signed in, but ${SESSION_HINT}`, report: 'Login succeeded without a session' }
		: {
				message: `Account created, but ${SESSION_HINT}`,
				report: 'Registration succeeded without a session'
			};
}
