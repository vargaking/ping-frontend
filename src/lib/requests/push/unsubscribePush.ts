import { axiosClient } from '../axiosClient';

/** Idempotent: the server answers 204 even when nothing matched. The short
 *  timeout keeps a slow backend from stalling logout. */
export const unsubscribePush = async (endpoint: string): Promise<void> => {
	await axiosClient.delete('/api/push/subscriptions', { data: { endpoint }, timeout: 5000 });
};
