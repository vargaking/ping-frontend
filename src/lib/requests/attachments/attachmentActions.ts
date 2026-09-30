import type { Attachment } from '$lib/types/attachment.types';
import { toast } from 'svelte-sonner';
import { getAttachmentLink } from './attachmentLink';

export const isPlainLeftClick = (e: MouseEvent) =>
	e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;

// The plain hrefs stay for middle-click, copy-link and no-JS. A left click
// opens a short-lived signed URL instead, since the API origin doesn't get
// the session cookie in a new tab when third-party cookies are partitioned.
export async function openFullSize(e: MouseEvent, a: Attachment) {
	if (!isPlainLeftClick(e)) return;
	// Opened before the await so the popup blocker still sees the click.
	const tab = window.open('', '_blank');
	if (!tab) return;
	e.preventDefault();
	try {
		const url = await getAttachmentLink(a);
		tab.opener = null;
		tab.location.replace(url);
	} catch {
		tab.close();
		toast.error("Couldn't open the attachment");
	}
}

export async function download(e: MouseEvent, a: Attachment) {
	if (!isPlainLeftClick(e)) return;
	e.preventDefault();
	try {
		const link = document.createElement('a');
		link.href = await getAttachmentLink(a);
		link.rel = 'noopener';
		document.body.append(link);
		link.click();
		link.remove();
	} catch {
		toast.error("Couldn't download the file");
	}
}

const playableTypes = new Map<string, boolean>();

function canPlay(contentType: string): boolean {
	if (typeof document === 'undefined') return false;
	let playable = playableTypes.get(contentType);
	if (playable === undefined) {
		playable = document.createElement('video').canPlayType(contentType) !== '';
		playableTypes.set(contentType, playable);
	}
	return playable;
}

export type MediaKind = 'image' | 'video';

export function mediaKind(a: Attachment): MediaKind | null {
	if (a.kind === 'image') return 'image';
	if (a.kind === 'file' && a.content_type.startsWith('video/') && canPlay(a.content_type)) {
		return 'video';
	}
	return null;
}
