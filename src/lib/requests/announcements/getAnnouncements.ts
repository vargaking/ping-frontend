import type { Announcement } from '$lib/types/announcement.types';
import { axiosClient } from '../axiosClient';

export const getAnnouncements = async (): Promise<Announcement[]> => {
	const response = await axiosClient.get<Announcement[]>('/api/announcements');
	return response.data;
};
