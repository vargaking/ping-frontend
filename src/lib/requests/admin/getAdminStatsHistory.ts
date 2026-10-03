import type { AdminHistoryRange, AdminStatsHistory } from '$lib/types/admin.types';
import { axiosClient } from '../axiosClient';

export const getAdminStatsHistory = async (
	range: AdminHistoryRange
): Promise<AdminStatsHistory> => {
	const response = await axiosClient.get<AdminStatsHistory>('/admin/stats/history', {
		params: { range }
	});
	return response.data;
};
