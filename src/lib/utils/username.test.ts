import { describe, expect, it } from 'vitest';
import { usernameProblem } from './username';

describe('usernameProblem', () => {
	it('accepts what the server accepts', () => {
		expect(usernameProblem('abc')).toBeNull();
		expect(usernameProblem('a.b-c_9')).toBeNull();
		expect(usernameProblem('x'.repeat(32))).toBeNull();
	});

	it('refuses what the server refuses', () => {
		expect(usernameProblem('')).toMatch(/required/);
		expect(usernameProblem('ab')).toMatch(/at least 3/);
		expect(usernameProblem('x'.repeat(33))).toMatch(/32 characters/);
		expect(usernameProblem('with space')).toMatch(/letters, numbers/);
		expect(usernameProblem('[imported]')).toMatch(/letters, numbers/);
	});
});
