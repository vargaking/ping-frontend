import SettingsModal from '$lib/components/settings/SettingsModal.svelte';
import { overlayState } from '$lib/states/overlayState.svelte';
import { SERVER_REQUESTS_TAB } from '$lib/types/serverRequest.types';

export function openServerRequestsSettings() {
	overlayState.open(SettingsModal, { category: 'account', tab: SERVER_REQUESTS_TAB });
}
