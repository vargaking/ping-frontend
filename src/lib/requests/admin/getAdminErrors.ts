import type { AdminErrorList, AdminErrorSource } from '$lib/types/admin.types';
import { axiosClient } from '../axiosClient';

export const getAdminErrors = async (source?: AdminErrorSource): Promise<AdminErrorList> => {
	const response = await axiosClient.get<AdminErrorList>('/admin/errors', {
		params: source ? { source } : undefined
	});
	return response.data;
};
