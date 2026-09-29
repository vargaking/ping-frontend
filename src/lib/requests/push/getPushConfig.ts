import type { PushConfig } from '$lib/types/push.types';
import { axiosClient } from '../axiosClient';

export const getPushConfig = async (): Promise<PushConfig> => {
	const response = await axiosClient.get('/api/push/config');
	return response.data;
};
