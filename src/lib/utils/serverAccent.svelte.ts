import { page } from '$app/state';
import { serversState } from '$lib/states/serversState.svelte';
import { usersState } from '$lib/states/usersState.svelte';
import { ACCENT_TOKENS, accentTokens, parseAccent } from '$lib/utils/accent';

/**
 * Overrides the accent tokens on `root` while a server with an accent is open.
 * Call it while a component initialises; the overrides are removed when it is destroyed.
 */
export function watchServerAccent(root: Pick<HTMLElement, 'style'>) {
	const accent = $derived.by(() => {
		if (!usersState.loggedInUser || !page.route.id?.startsWith('/app/server/')) return null;
		const serverId = Number.parseInt(page.params.serverId ?? '', 10);
		return parseAccent(serversState.servers[serverId]?.server_profile?.accent ?? '');
	});

	$effect(() => {
		if (!accent) return;
		for (const [token, value] of Object.entries(accentTokens(accent))) {
			root.style.setProperty(token, value);
		}
		return () => {
			for (const token of ACCENT_TOKENS) root.style.removeProperty(token);
		};
	});
}
