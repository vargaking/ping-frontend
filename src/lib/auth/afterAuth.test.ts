import { describe, expect, it } from 'vitest';
import { UNREACHABLE_MESSAGE } from '$lib/requests/errors';
import { authProblem } from './afterAuth';

describe('authProblem', () => {
	it('lets a signed-in user into the app', () => {
		expect(authProblem('ok', true, 'login')).toBeNull();
		expect(authProblem('ok', true, 'register')).toBeNull();
	});

	it('explains a login that left no session and reports it', () => {
		const problem = authProblem('ok', false, 'login');
		expect(problem?.message).toBe(
			"Signed in, but this browser didn't keep you logged in. Allow cookies for this site, or open Zeta in another browser."
		);
		expect(problem?.report).toBeTruthy();
	});

	it('explains a registration that left no session', () => {
		const problem = authProblem('ok', false, 'register');
		expect(problem?.message).toBe(
			"Account created, but this browser didn't keep you logged in. Allow cookies for this site, or open Zeta in another browser."
		);
		expect(problem?.report).toBeTruthy();
	});

	it('uses the unreachable wording and does not report when the server cannot be reached', () => {
		for (const kind of ['login', 'register'] as const) {
			expect(authProblem('unreachable', false, kind)).toEqual({
				message: UNREACHABLE_MESSAGE,
				report: null
			});
		}
	});
});
