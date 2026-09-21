import { AxiosError } from 'axios';

/** A backend/network error boiled down to what the UI actually needs. */
export interface NormalizedError {
	/** HTTP status, or null when the request never reached the server. */
	status: number | null;
	/** A human-readable, already-friendly message safe to show in a toast. */
	message: string;
}

const GENERIC = 'Something went wrong. Please try again.';

/** Pull the first sensible string out of a FastAPI `detail` payload. */
function detailToMessage(detail: unknown): string | null {
	if (typeof detail === 'string') return detail;
	// 422 validation errors arrive as [{ loc, msg, type }, …].
	if (Array.isArray(detail)) {
		const first = detail.find((d) => d && typeof d.msg === 'string');
		return first?.msg ?? null;
	}
	return null;
}

/** Build the "too many attempts" line, using Retry-After when the server sends it. */
function rateLimitMessage(error: AxiosError): string {
	const retryAfter = error.response?.headers?.['retry-after'];
	const seconds = retryAfter ? Number(retryAfter) : NaN;
	if (Number.isFinite(seconds) && seconds > 0) {
		return `Too many attempts. Try again in ${Math.ceil(seconds)}s.`;
	}
	return 'Too many attempts. Please wait a moment and try again.';
}

/**
 * Collapse any thrown value into `{ status, message }`. This is the single place
 * that knows how the backend shapes errors, so components can just read
 * `.message` (or call `getErrorMessage`) instead of digging through `response`.
 */
export function normalizeError(error: unknown): NormalizedError {
	if (error instanceof AxiosError) {
		const status = error.response?.status ?? null;

		if (status === 429) {
			return { status, message: rateLimitMessage(error) };
		}

		// No response at all: timeout or the network dropped.
		if (!error.response) {
			const message =
				error.code === 'ECONNABORTED'
					? 'The server took too long to respond. Please try again.'
					: 'Cannot reach the server. Check your connection and try again.';
			return { status, message };
		}

		const detail = detailToMessage(error.response.data?.detail);
		return { status, message: detail ?? GENERIC };
	}

	if (error instanceof Error && error.message) {
		return { status: null, message: error.message };
	}

	return { status: null, message: GENERIC };
}

/** Convenience wrapper for the common `toast.error(getErrorMessage(err))` call. */
export function getErrorMessage(error: unknown): string {
	return normalizeError(error).message;
}

/**
 * For 422 validation responses, map each offending field name to its message,
 * e.g. `{ password: 'String should have at least 8 characters' }`. Returns an
 * empty object for anything that isn't a field-level validation error.
 */
export function fieldErrorsFrom(error: unknown): Record<string, string> {
	const out: Record<string, string> = {};
	if (!(error instanceof AxiosError)) return out;

	const detail = error.response?.data?.detail;
	if (!Array.isArray(detail)) return out;

	for (const item of detail) {
		const loc = item?.loc;
		const field = Array.isArray(loc) ? loc[loc.length - 1] : undefined;
		if (typeof field === 'string' && typeof item?.msg === 'string' && !(field in out)) {
			out[field] = item.msg;
		}
	}
	return out;
}
