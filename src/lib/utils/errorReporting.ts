import { PUBLIC_BASE_URL } from '$env/static/public';

export type ClientErrorKind = 'error' | 'unhandledrejection' | 'svelte';

export interface ClientErrorPayload {
	kind: ClientErrorKind;
	message: string;
	stack?: string;
	line?: number;
	column?: number;
}

const MAX_MESSAGE_LENGTH = 1000;
const MAX_STACK_LENGTH = 8000;
const MAX_REPORTS_PER_PAGE_LOAD = 10;
const OPAQUE_CROSS_ORIGIN_MESSAGE = 'Script error.';

const seen = new Set<string>();
let sentCount = 0;
let rateLimited = false;
let installed = false;

function truncate(value: string | undefined, max: number): string | null {
	return value ? value.slice(0, max) : null;
}

function nonNegativeInt(value: number | undefined): number | null {
	return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;
}

/** Sends an error to the server log. Never throws, so it can't cause an error loop. */
export function reportClientError(payload: ClientErrorPayload): void {
	try {
		const message = payload.message?.trim();
		if (!message || message === OPAQUE_CROSS_ORIGIN_MESSAGE) return;
		if (rateLimited || sentCount >= MAX_REPORTS_PER_PAGE_LOAD) return;

		const key = `${message}\n${payload.stack ?? ''}`;
		if (seen.has(key)) return;
		seen.add(key);
		sentCount++;

		fetch(`${PUBLIC_BASE_URL}/api/client-errors`, {
			method: 'POST',
			credentials: 'include',
			keepalive: true,
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				kind: payload.kind,
				message: message.slice(0, MAX_MESSAGE_LENGTH),
				stack: truncate(payload.stack, MAX_STACK_LENGTH),
				// No query or hash: they can carry tokens.
				url: location.origin + location.pathname,
				line: nonNegativeInt(payload.line),
				column: nonNegativeInt(payload.column)
			})
		})
			.then((response) => {
				if (response.status === 429) rateLimited = true;
			})
			.catch(() => {});
	} catch {
		// Reporting must never throw.
	}
}

function describe(reason: unknown): { message: string; stack?: string } {
	if (reason instanceof Error)
		return { message: reason.message || reason.name, stack: reason.stack };
	if (typeof reason === 'string') return { message: reason };
	try {
		return { message: JSON.stringify(reason) ?? String(reason) };
	} catch {
		return { message: String(reason) };
	}
}

/** Reports uncaught errors and unhandled promise rejections. Safe to call more than once. */
export function installErrorReporting(): void {
	if (typeof window === 'undefined' || installed) return;
	installed = true;

	window.addEventListener('error', (event) => {
		reportClientError({
			kind: 'error',
			message: event.message || event.error?.message,
			stack: event.error?.stack,
			line: event.lineno,
			column: event.colno
		});
	});

	window.addEventListener('unhandledrejection', (event) => {
		reportClientError({ kind: 'unhandledrejection', ...describe(event.reason) });
	});
}
