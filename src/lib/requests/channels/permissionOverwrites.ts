import type {
	MemberOverwrite,
	OverwriteSubject,
	OverwriteTarget,
	Overwrites,
	RoleOverwrite
} from '$lib/types/overwrite.types';
import { axiosClient } from '../axiosClient';

const base = (target: OverwriteTarget) =>
	target.kind === 'channel'
		? `/channels/${target.id}/permissions`
		: `/channel-groups/${target.id}/permissions`;

export const getOverwrites = async (target: OverwriteTarget): Promise<Overwrites> => {
	const response = await axiosClient.get<Overwrites>(base(target));
	return response.data;
};

/** Set one row; empty masks delete it, and then the result is null. */
export const setOverwrite = async (
	target: OverwriteTarget,
	subject: OverwriteSubject,
	allow: bigint,
	deny: bigint
): Promise<RoleOverwrite | MemberOverwrite | null> => {
	const response = await axiosClient.put<RoleOverwrite | MemberOverwrite>(
		`${base(target)}/${subject.kind}/${subject.id}`,
		{ allow: allow.toString(), deny: deny.toString() }
	);
	return response.status === 204 ? null : response.data;
};

export const getChannelViewers = async (channelId: number): Promise<number[]> => {
	const response = await axiosClient.get<{ user_ids: number[] }>(`/channels/${channelId}/viewers`);
	return response.data.user_ids;
};
