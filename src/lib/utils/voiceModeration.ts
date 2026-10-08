import { toast } from 'svelte-sonner';
import { disconnectFromVoice } from '$lib/requests/voice/disconnectFromVoice';
import { setServerMute } from '$lib/requests/voice/setServerMute';
import { getErrorMessage } from '$lib/requests/errors';

export async function serverMuteMember(
	serverId: number,
	userId: number,
	name: string,
	muted: boolean
) {
	try {
		await setServerMute(serverId, userId, muted);
		toast.success(muted ? `Muted ${name} for everyone.` : `Unmuted ${name} for everyone.`);
	} catch (e) {
		toast.error(getErrorMessage(e));
	}
}

export async function disconnectMember(serverId: number, userId: number, name: string) {
	try {
		await disconnectFromVoice(serverId, userId);
		toast.success(`Disconnected ${name} from voice.`);
	} catch (e) {
		toast.error(getErrorMessage(e));
	}
}
