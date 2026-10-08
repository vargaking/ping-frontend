<script lang="ts">
	import { usersState } from '$lib/states/usersState.svelte';
	import type { VoiceMember } from '$lib/states/voiceRoster.svelte';
	import VoiceParticipant from './VoiceParticipant.svelte';
	import ActionContextMenu from '$lib/components/ui/context-menu/ActionContextMenu.svelte';
	import { voiceParticipantActions } from '$lib/utils/menuActions';

	type Props = { member: VoiceMember };

	let { member }: Props = $props();

	const user = $derived(usersState.users[member.userId]);
	const name = $derived(
		(user?.username ?? member.fallbackName ?? '…') + (member.self ? ' (You)' : '')
	);

	const actions = $derived(voiceParticipantActions(member));

	$effect(() => {
		usersState.getOrFetchUser(member.userId);
	});
</script>

<ActionContextMenu {actions}>
	{#snippet children(menuProps)}
		<VoiceParticipant
			{...menuProps}
			{name}
			toneKey={member.userId}
			initialsFrom={user?.username ?? member.fallbackName ?? '?'}
			avatar={user?.profile?.avatar ?? member.fallbackAvatar}
			speaking={member.speaking}
			muted={member.muted}
			deafened={member.deafened}
			serverMuted={member.serverMuted}
			localMuted={member.localMuted}
			streaming={member.streaming}
		/>
	{/snippet}
</ActionContextMenu>
