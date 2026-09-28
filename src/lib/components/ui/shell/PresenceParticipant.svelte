<script lang="ts">
	import { usersState } from '$lib/states/usersState.svelte';
	import type { User } from '$lib/types/auth.types';
	import VoiceParticipant from './VoiceParticipant.svelte';

	type Props = { userId: number; muted: boolean; deafened: boolean };

	let { userId, muted, deafened }: Props = $props();

	let user = $state<User | null>(null);

	$effect(() => {
		let cancelled = false;
		Promise.resolve(usersState.getOrFetchUser(userId)).then((u) => {
			if (!cancelled) user = u;
		});
		return () => {
			cancelled = true;
		};
	});
</script>

<VoiceParticipant name={user?.username ?? '…'} avatar={user?.profile?.avatar} {muted} {deafened} />
