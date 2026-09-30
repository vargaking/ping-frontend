<script lang="ts">
	import { usersState } from '$lib/states/usersState.svelte';
	import type { VoiceMember } from '$lib/states/voiceRoster.svelte';
	import VoiceTile from './VoiceTile.svelte';

	type Props = { member: VoiceMember };

	let { member }: Props = $props();

	const user = $derived(usersState.users[member.userId]);
	const name = $derived(
		(user?.username ?? member.fallbackName ?? '…') + (member.self ? ' (You)' : '')
	);

	$effect(() => {
		usersState.getOrFetchUser(member.userId);
	});
</script>

<VoiceTile
	{name}
	toneKey={member.userId}
	initialsFrom={user?.username ?? member.fallbackName ?? '?'}
	avatar={user?.profile?.avatar ?? member.fallbackAvatar}
	speaking={member.speaking}
	muted={member.muted}
	deafened={member.deafened}
	streaming={member.streaming}
/>
