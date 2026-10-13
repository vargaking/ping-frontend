import { axiosClient } from '../axiosClient';

export const dismissAnnouncement = async (id: number): Promise<void> => {
	await axiosClient.post(`/api/announcements/${id}/dismiss`);
};
