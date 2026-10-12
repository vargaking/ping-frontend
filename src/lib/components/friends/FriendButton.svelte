<script lang="ts">
	import { Check, UserCheck, UserPlus } from 'lucide-svelte';
	import Button from '$lib/components/ui/button/button.svelte';
	import { friendsState } from '$lib/states/friendsState.svelte';
	import type { User } from '$lib/types/auth.types';
	import { acceptFriend, addFriend } from '$lib/utils/friendActions';

	let { user }: { user: User } = $props();

	let busy = $state(false);

	const relation = $derived(friendsState.stateOf(user.id));

	const status =
		'inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-border px-2.5 text-sm whitespace-nowrap text-muted-foreground pointer-coarse:h-11';

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
		<span class={status}>
			<Check size={14} strokeWidth={1.75} />
			Request sent
		</span>
	{:else if relation === 'incoming'}
		<Button variant="secondary" size="sm" disabled={busy} onclick={() => run(acceptFriend)}>
			<UserCheck size={14} strokeWidth={1.75} />
			Accept request
		</Button>
	{:else}
		<span class={status}>
			<UserCheck size={14} strokeWidth={1.75} />
			Friends
		</span>
	{/if}
{/if}
