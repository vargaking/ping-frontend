import type { PushTestResult } from '$lib/types/push.types';
import { axiosClient } from '../axiosClient';

export const testPush = async (): Promise<PushTestResult[]> => {
	const response = await axiosClient.post('/api/push/test');
	return response.data;
};
