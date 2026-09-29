import { PUBLIC_BASE_URL } from '$env/static/public';
import { axiosClient } from '../axiosClient';

const refreshPath = (channelId: number) => `/api/voice/presence/channels/${channelId}/refresh`;

/** Ask the server to re-read who is in a voice channel, so other members see
 *  a join, leave or mute right away. Best effort: the server's poll catches
 *  anything this misses. */
export const refreshVoicePresence = (channelId: number): void => {
	axiosClient.post(refreshPath(channelId)).catch(() => {});
};

/** The same, for page unload, where a normal request would be cancelled. */
export const refreshVoicePresenceOnUnload = (channelId: number): void => {
	navigator.sendBeacon?.(PUBLIC_BASE_URL + refreshPath(channelId));
};
