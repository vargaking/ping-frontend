import type { AdminAnnouncement, AnnouncementInput } from '$lib/types/announcement.types';
import { axiosClient } from '../axiosClient';

export const listAdminAnnouncements = async (): Promise<AdminAnnouncement[]> => {
	const response = await axiosClient.get<AdminAnnouncement[]>('/api/admin/announcements');
	return response.data;
};

export const createAnnouncement = async (input: AnnouncementInput): Promise<AdminAnnouncement> => {
	const response = await axiosClient.post<AdminAnnouncement>('/api/admin/announcements', input);
	return response.data;
};

export const endAnnouncement = async (id: number): Promise<AdminAnnouncement> => {
	const response = await axiosClient.post<AdminAnnouncement>(`/api/admin/announcements/${id}/end`);
	return response.data;
};
