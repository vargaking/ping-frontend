import type { Handle } from '@sveltejs/kit';
import { landingMeta, metaTagsHtml } from '$lib/meta';

// The invite route is server-rendered and emits its own tags.
export const handle: Handle = ({ event, resolve }) => {
	const { url } = event;
	const isInvite = url.pathname === '/invite' || url.pathname.startsWith('/invite/');
	const tags = isInvite ? '' : metaTagsHtml(landingMeta(url));
	return resolve(event, {
		transformPageChunk: ({ html }) => html.replace('%zeta.meta%', () => tags)
	});
};
