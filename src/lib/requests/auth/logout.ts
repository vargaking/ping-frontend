import { axiosClient } from '../axiosClient';

/** Invalidate the current session server-side. Idempotent: a missing or expired
 *  cookie still returns 200, so callers never need to special-case it. */
export const logout = async () => {
	const response = await axiosClient.post('/auth/logout');
	return response.data;
};
