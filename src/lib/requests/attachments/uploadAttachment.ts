import { isAxiosError } from 'axios';
import { PUBLIC_BASE_URL } from '$env/static/public';
import type { Attachment } from '$lib/types/attachment.types';
import type { MessageTarget } from '$lib/types/messages.types';
import { axiosClient } from '../axiosClient';
import { normalizeError } from '../errors';
import { usersState } from '$lib/states/usersState.svelte';

/** Used when the server doesn't report its own cap. */
export const DEFAULT_MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const MAX_ATTACHMENTS_PER_MESSAGE = 10;

export function maxAttachmentBytes(): number {
	const reported = usersState.loggedInUser?.max_attachment_bytes;
	return typeof reported === 'number' && reported > 0 ? reported : DEFAULT_MAX_ATTACHMENT_BYTES;
}

export function formatSizeLimit(bytes: number): string {
	const mb = bytes / 1024 ** 2;
	return `${Number.isInteger(mb) ? mb : mb.toFixed(1)} MB`;
}

export const uploadAttachment = async (
	file: File,
	target: MessageTarget,
	onProgress?: (fraction: number) => void,
	signal?: AbortSignal
): Promise<Attachment> => {
	const formData = new FormData();
	formData.append('file', file);
	if (target.kind === 'channel') formData.append('channel_id', String(target.channelId));
	else formData.append('conversation_id', String(target.conversationId));

	try {
		const response = await axiosClient.post<Attachment>('/attachments', formData, {
			headers: { 'Content-Type': 'multipart/form-data' },
			signal,
			onUploadProgress: (event) => {
				if (event.total) onProgress?.(event.loaded / event.total);
			}
		});
		return response.data;
	} catch (error) {
		if (normalizeError(error).status === 413) {
			const detail = isAxiosError(error) ? error.response?.data?.detail : null;
			throw new Error(
				typeof detail === 'string'
					? detail
					: `File is larger than ${formatSizeLimit(maxAttachmentBytes())}`
			);
		}
		throw error;
	}
};

export const attachmentUrl = (a: Attachment) => `${PUBLIC_BASE_URL}${a.url}`;

export function formatBytes(n: number): string {
	if (n < 1024) return `${n} B`;
	if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
	if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
	if (n < 1024 ** 4) return `${(n / 1024 ** 3).toFixed(1)} GB`;
	return `${(n / 1024 ** 4).toFixed(1)} TB`;
}
