import { axiosClient } from '../axiosClient';
import type { InviteCreate, InviteUpdate, InviteResponse, InvitePublicResponse, InviteUseRequest, InviteUseResponse } from '$lib/types/invite.types';

export const createInvite = async (data: InviteCreate): Promise<InviteResponse> => {
	const response = await axiosClient.post<InviteResponse>('/invites/', data);
	return response.data;
};

export const listServerInvites = async (serverId: number): Promise<InviteResponse[]> => {
	const response = await axiosClient.get<InviteResponse[]>(`/invites/server/${serverId}`);
	return response.data;
};

export const getInvite = async (inviteId: string): Promise<InvitePublicResponse> => {
	const response = await axiosClient.get<InvitePublicResponse>(`/invites/${inviteId}`);
	return response.data;
};

export const updateInvite = async (inviteId: string, data: InviteUpdate): Promise<InviteResponse> => {
	const response = await axiosClient.put<InviteResponse>(`/invites/${inviteId}`, data);
	return response.data;
};

export const deleteInvite = async (inviteId: string): Promise<void> => {
	await axiosClient.delete(`/invites/${inviteId}`);
};

export const useInvite = async (inviteId: string, data: InviteUseRequest): Promise<InviteUseResponse> => {
	const response = await axiosClient.post<InviteUseResponse>(`/invites/${inviteId}/use`, data);
	return response.data;
};
