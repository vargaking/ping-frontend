import type { PushSubscriptionBody } from '$lib/types/push.types';
import { axiosClient } from '../axiosClient';

/** Register this browser's push subscription for the signed-in user. Safe to
 *  repeat: the server upserts by endpoint. */
export const subscribePush = async (subscription: PushSubscriptionBody): Promise<void> => {
	await axiosClient.post('/api/push/subscriptions', subscription);
};
