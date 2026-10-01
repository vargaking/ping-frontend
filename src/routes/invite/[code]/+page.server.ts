import { env } from '$env/dynamic/private';
import { PUBLIC_BASE_URL } from '$env/static/public';
import { inviteMeta, invalidInviteMeta, landingMeta } from '$lib/meta';
import type { InvitePublicResponse } from '$lib/types/invite.types';
import type { PageServerLoad } from './$types';

export const ssr = true;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isAbsolute = (value: string | undefined): value is string => /^https?:\/\//.test(value ?? '');

export const load: PageServerLoad = async ({ params, url, fetch }) => {
	const apiBase = [env.API_URL, PUBLIC_BASE_URL].find(isAbsolute);
	if (!UUID.test(params.code)) return { meta: invalidInviteMeta(url) };
	if (!apiBase) return { meta: landingMeta(url) };

	try {
		const res = await fetch(`${apiBase.replace(/\/+$/, '')}/invites/${params.code}`, {
			signal: AbortSignal.timeout(3000)
		});
		if (res.status === 404) return { meta: invalidInviteMeta(url) };
		if (!res.ok) return { meta: landingMeta(url) };
		const invite: InvitePublicResponse = await res.json();
		if (!invite.is_valid) return { meta: invalidInviteMeta(url) };
		return {
			meta: inviteMeta(
				url,
				{
					serverName: invite.server_name,
					serverIcon: invite.server_icon,
					memberCount: invite.member_count
				},
				apiBase
			)
		};
	} catch {
		return { meta: landingMeta(url) };
	}
};
