import type { User } from '$lib/types/auth.types';
import { axiosClient } from '../axiosClient';

export type UserChanges = { username?: string };

/** Sends only what changed; the server ignores everything else on this endpoint. */
export const updateUser = async (userId: number, changes: UserChanges) => {
	const response = await axiosClient.put<User>(`/users/${userId}`, changes);
	return response.data;
};
