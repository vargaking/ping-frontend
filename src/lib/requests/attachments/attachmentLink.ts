import { PUBLIC_BASE_URL } from '$env/static/public';
import type { Attachment } from '$lib/types/attachment.types';
import { axiosClient } from '../axiosClient';

type AttachmentLink = { url: string; expires_at: string };

const REFRESH_MARGIN_MS = 30_000;

const cache = new Map<string, { link: Promise<string>; usableUntil: number }>();

/** Absolute, short-lived URL that opens the attachment without the session
 *  cookie. Reused until shortly before it expires. */
export function getAttachmentLink(a: Attachment): Promise<string> {
	const cached = cache.get(a.id);
	if (cached && cached.usableUntil > Date.now()) return cached.link;

	const entry = {
		usableUntil: Date.now() + REFRESH_MARGIN_MS,
		link: axiosClient.post<AttachmentLink>(`/attachments/${a.id}/link`).then((response) => {
			entry.usableUntil = Date.parse(response.data.expires_at) - REFRESH_MARGIN_MS;
			return `${PUBLIC_BASE_URL}${response.data.url}`;
		})
	};
	cache.set(a.id, entry);
	entry.link.catch(() => {
		if (cache.get(a.id) === entry) cache.delete(a.id);
	});
	return entry.link;
}
