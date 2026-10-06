import type { Handle } from '@sveltejs/kit';
import { APP_THEME_COLOR, landingMeta, metaTagsHtml, THEME_COLOR } from '$lib/meta';

// The invite route is server-rendered and emits its own tags.
export const handle: Handle = ({ event, resolve }) => {
	const { url } = event;
	const isInvite = url.pathname === '/invite' || url.pathname.startsWith('/invite/');
	const inApp = url.pathname === '/app' || url.pathname.startsWith('/app/');
	const tags = isInvite
		? ''
		: metaTagsHtml(landingMeta(url), inApp ? APP_THEME_COLOR : THEME_COLOR);
	return resolve(event, {
		transformPageChunk: ({ html }) => html.replace('%zeta.meta%', () => tags)
	});
};
