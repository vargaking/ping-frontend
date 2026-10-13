import { AxiosError, type AxiosResponse } from 'axios';
import { describe, expect, it } from 'vitest';
import { linkCodeProblem } from './gameLinkError';

const failed = (status: number, detail: string) =>
	new AxiosError('failed', 'ERR_BAD_REQUEST', undefined, undefined, {
		status,
		data: { detail }
	} as AxiosResponse);

describe('linkCodeProblem', () => {
	it.each([
		[
			404,
			'Code not found or expired',
			'This code is invalid or expired. Run /zeta link again in the game.'
		],
		[403, 'Not a member of this server', 'Join the server in Zet first.'],
		[500, 'Boom', 'Boom']
	])('status %i', (status, detail, expected) => {
		expect(linkCodeProblem(failed(status, detail))).toBe(expected);
	});
});
