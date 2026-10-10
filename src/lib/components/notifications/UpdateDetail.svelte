<script lang="ts">
	import { updateState } from '$lib/states/updateState.svelte';
	import { voiceState } from '$lib/states/voiceState.svelte';
	import { composerDraftState } from '$lib/states/composerDraftState.svelte';
	import { updateNoticeDetail } from '$lib/utils/updateNotice';

	const detail = $derived(
		updateNoticeDetail({
			offline: updateState.offline,
			inCall: voiceState.connecting || voiceState.connected || voiceState.reconnecting,
			unsentAttachments: composerDraftState.hasUnsentAttachments
		})
	);
</script>

<svelte:window ononline={() => (updateState.offline = false)} />

{#if detail}<span class="text-xs text-muted-foreground">{detail}</span>{/if}
