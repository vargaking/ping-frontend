import { PUBLIC_BASE_URL } from '$env/static/public';
import type { Attachment } from '$lib/types/attachment.types';
import type { MessageTarget } from '$lib/types/messages.types';
import { axiosClient } from '../axiosClient';
import { normalizeError } from '../errors';

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const MAX_ATTACHMENTS_PER_MESSAGE = 10;

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
			throw new Error('File is larger than 10 MB');
		}
		throw error;
	}
};

export const attachmentUrl = (a: Attachment) => `${PUBLIC_BASE_URL}${a.url}`;

export function formatBytes(n: number): string {
	if (n < 1024) return `${n} B`;
	if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
	return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
