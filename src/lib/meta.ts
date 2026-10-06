export type PageMeta = {
	title: string;
	description: string;
	image: string;
	url: string;
};

export type MetaTag = { attr: 'name' | 'property'; key: string; content: string };

export const SITE_NAME = 'Zeta';
export const THEME_COLOR = '#8ab4d8';
/** The app's top bar colour, so the status bar of an installed app blends into it. */
export const APP_THEME_COLOR = '#0d0f11';

const LANDING_DESCRIPTION = "A calm home for your server's chat and voice.";

export function brandImage(origin: string): string {
	return `${origin}/icon-512.png`;
}

export function landingMeta(url: URL): PageMeta {
	return {
		title: SITE_NAME,
		description: LANDING_DESCRIPTION,
		image: brandImage(url.origin),
		url: url.origin + url.pathname
	};
}

export function invalidInviteMeta(url: URL): PageMeta {
	return {
		title: 'Zeta invite',
		description: 'This invite is invalid or has expired',
		image: brandImage(url.origin),
		url: url.origin + url.pathname
	};
}

export function inviteMeta(
	url: URL,
	invite: { serverName: string; serverIcon: string | null; memberCount: number },
	apiBase: string
): PageMeta {
	const members = `${invite.memberCount} ${invite.memberCount === 1 ? 'member' : 'members'}`;
	return {
		title: `Join ${invite.serverName} on ${SITE_NAME}`,
		description: `You've been invited to ${invite.serverName}. ${members}.`,
		image: invite.serverIcon ? new URL(invite.serverIcon, apiBase).href : brandImage(url.origin),
		url: url.origin + url.pathname
	};
}

export function metaTags(meta: PageMeta, themeColor = THEME_COLOR): MetaTag[] {
	return [
		{ attr: 'name', key: 'description', content: meta.description },
		{ attr: 'name', key: 'theme-color', content: themeColor },
		{ attr: 'property', key: 'og:title', content: meta.title },
		{ attr: 'property', key: 'og:description', content: meta.description },
		{ attr: 'property', key: 'og:image', content: meta.image },
		{ attr: 'property', key: 'og:url', content: meta.url },
		{ attr: 'property', key: 'og:site_name', content: SITE_NAME },
		{ attr: 'property', key: 'og:type', content: 'website' },
		{ attr: 'name', key: 'twitter:card', content: 'summary' },
		{ attr: 'name', key: 'twitter:title', content: meta.title },
		{ attr: 'name', key: 'twitter:description', content: meta.description },
		{ attr: 'name', key: 'twitter:image', content: meta.image }
	];
}

export function escapeHtml(value: string): string {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');
}

export function metaTagsHtml(meta: PageMeta, themeColor = THEME_COLOR): string {
	const tags = metaTags(meta, themeColor).map(
		(tag) => `<meta ${tag.attr}="${tag.key}" content="${escapeHtml(tag.content)}" />`
	);
	return [`<title>${escapeHtml(meta.title)}</title>`, ...tags].join('\n\t\t');
}
