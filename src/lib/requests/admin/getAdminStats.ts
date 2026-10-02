import type { AdminStats } from '$lib/types/admin.types';
import { axiosClient } from '../axiosClient';

export const getAdminStats = async (): Promise<AdminStats> => {
	const response = await axiosClient.get<AdminStats>('/admin/stats');
	return response.data;
};
