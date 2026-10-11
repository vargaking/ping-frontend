<script lang="ts">
	import { Check, UserCheck, UserPlus } from 'lucide-svelte';
	import Button from '$lib/components/ui/button/button.svelte';
	import { friendsState } from '$lib/states/friendsState.svelte';
	import type { User } from '$lib/types/auth.types';
	import { acceptFriend, addFriend } from '$lib/utils/friendActions';

	let { user }: { user: User } = $props();

	let busy = $state(false);

	const relation = $derived(friendsState.stateOf(user.id));

	async function run(action: (user: User) => Promise<void>) {
		if (busy) return;
		busy = true;
		try {
			await action(user);
		} finally {
			busy = false;
		}
	}
</script>

{#if friendsState.loaded}
	{#if relation === 'none'}
		<Button variant="secondary" size="sm" disabled={busy} onclick={() => run(addFriend)}>
			<UserPlus size={14} strokeWidth={1.75} />
			Add friend
		</Button>
	{:else if relation === 'outgoing'}
		<Button variant="secondary" size="sm" disabled>
			<Check size={14} strokeWidth={1.75} />
			Request sent
		</Button>
	{:else if relation === 'incoming'}
		<Button variant="secondary" size="sm" disabled={busy} onclick={() => run(acceptFriend)}>
			<UserCheck size={14} strokeWidth={1.75} />
			Accept request
		</Button>
	{:else}
		<Button variant="secondary" size="sm" disabled>
			<UserCheck size={14} strokeWidth={1.75} />
			Friends
		</Button>
	{/if}
{/if}
