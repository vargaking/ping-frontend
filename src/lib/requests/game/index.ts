import { axiosClient } from '../axiosClient';
import type {
	GameIntegration,
	GameIntegrationCreate,
	GameIntegrationUpdate,
	GameKey,
	GameLink,
	GameLinkPreview,
	GameSession
} from '$lib/types/game.types';

const code = (value: string) => encodeURIComponent(value);

export const listGameIntegrations = async (serverId: number): Promise<GameIntegration[]> => {
	const response = await axiosClient.get<GameIntegration[]>(
		`/api/servers/${serverId}/game-integrations`
	);
	return response.data;
};

export const createGameIntegration = async (
	serverId: number,
	data: GameIntegrationCreate
): Promise<GameIntegration & GameKey> => {
	const response = await axiosClient.post<GameIntegration & GameKey>(
		`/api/servers/${serverId}/game-integrations`,
		data
	);
	return response.data;
};

export const updateGameIntegration = async (
	id: number,
	data: GameIntegrationUpdate
): Promise<GameIntegration> => {
	const response = await axiosClient.patch<GameIntegration>(`/api/game-integrations/${id}`, data);
	return response.data;
};

export const rotateGameKey = async (id: number): Promise<GameKey> => {
	const response = await axiosClient.post<GameKey>(`/api/game-integrations/${id}/key`);
	return response.data;
};

export const deleteGameIntegration = async (id: number): Promise<void> => {
	await axiosClient.delete(`/api/game-integrations/${id}`);
};

export const listGameLinks = async (id: number): Promise<GameLink[]> => {
	const response = await axiosClient.get<GameLink[]>(`/api/game-integrations/${id}/links`);
	return response.data;
};

export const unlinkGameUser = async (id: number, userId: number): Promise<void> => {
	await axiosClient.delete(`/api/game-integrations/${id}/links/${userId}`);
};

/** The running session in a voice channel, or null when there is none. */
export const getGameSession = async (channelId: number): Promise<GameSession | null> => {
	const response = await axiosClient.get<GameSession | ''>(`/api/game/sessions/${channelId}`);
	return response.status === 204 || !response.data ? null : response.data;
};

export const getGameLinkPreview = async (linkCode: string): Promise<GameLinkPreview> => {
	const response = await axiosClient.get<GameLinkPreview>(`/api/game/link-codes/${code(linkCode)}`);
	return response.data;
};

export const claimGameLink = async (linkCode: string): Promise<GameLink> => {
	const response = await axiosClient.post<GameLink>(
		`/api/game/link-codes/${code(linkCode)}/claim`
	);
	return response.data;
};
