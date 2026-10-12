import { PUBLIC_BASE_URL } from '$env/static/public';
import { axiosClient } from '../axiosClient';

const refreshPath = (callId: number) => `/api/calls/${callId}/refresh`;

/** Ask the server to re-read who is in the call's room now, so it notices a join
 *  or leave right away. Best effort: its poll catches anything this misses. */
export const refreshCall = (callId: number): void => {
	axiosClient.post(refreshPath(callId)).catch(() => {});
};

/** The same, for page unload, where a normal request would be cancelled. */
export const refreshCallOnUnload = (callId: number): void => {
	navigator.sendBeacon?.(PUBLIC_BASE_URL + refreshPath(callId));
};
