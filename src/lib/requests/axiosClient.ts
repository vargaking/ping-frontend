import { PUBLIC_BASE_URL } from '$env/static/public';
import axios, { AxiosError } from 'axios';
import { normalizeError, type NormalizedError } from './errors';

export const axiosClient = axios.create({
	baseURL: PUBLIC_BASE_URL,
	// A 5 s ceiling was tripping on cold backends and slow links. 20 s is a more
	// realistic wait before we call a request dead; uploads opt out entirely below.
	timeout: 20000,
	withCredentials: true,
	headers: {
		'Content-Type': 'application/json',
		'ngrok-skip-browser-warning': 'true'
	}
});

// File uploads (FormData) can legitimately take much longer than a JSON call, so
// they run without a timeout rather than fighting the default ceiling.
axiosClient.interceptors.request.use((config) => {
	if (typeof FormData !== 'undefined' && config.data instanceof FormData) {
		config.timeout = 0;
	}
	return config;
});

/** Auth endpoints own their own error UX (inline messages on the login/register
 *  pages), so a 401 from them must not trigger the session-expiry redirect. */
const AUTH_ENDPOINTS = ['/auth/login', '/auth/register', '/auth/me', '/auth/logout'];
const isAuthEndpoint = (url?: string) => !!url && AUTH_ENDPOINTS.some((p) => url.includes(p));

// One redirect at a time: a burst of parallel calls failing with 401 should send
// us to /login once, not once per request.
let handlingSessionExpiry = false;

async function handleSessionExpired(): Promise<void> {
	if (typeof window === 'undefined' || handlingSessionExpiry) return;

	const path = window.location.pathname;
	if (path === '/login' || path === '/login/') return;

	handlingSessionExpiry = true;
	try {
		// Imported lazily to avoid an import cycle (session → stores → requests).
		const { clearSession, safeNext } = await import('$lib/auth/session');
		await clearSession();

		const next = safeNext(window.location.pathname + window.location.search);
		const { goto } = await import('$app/navigation');
		await goto(next ? `/login?next=${encodeURIComponent(next)}` : '/login');
	} finally {
		handlingSessionExpiry = false;
	}
}

axiosClient.interceptors.response.use(
	(response) => response,
	async (error: unknown) => {
		const normalized: NormalizedError = normalizeError(error);

		// Surface a friendly, ready-to-toast message on the error itself while
		// leaving `response` intact for callers that read field-level details.
		if (error instanceof AxiosError) {
			error.message = normalized.message;
			(error as AxiosError & { normalized?: NormalizedError }).normalized = normalized;

			if (normalized.status === 401 && !isAuthEndpoint(error.config?.url)) {
				await handleSessionExpired();
			}
		}

		return Promise.reject(error);
	}
);
