<script lang="ts">
	import Button from '$lib/components/ui/button/button.svelte';
	import { friendsState } from '$lib/states/friendsState.svelte';
	import { addFriendFailure, addFriendMessage } from '$lib/utils/friends';

	const uid = $props.id();

	let username = $state('');
	let busy = $state(false);
	let result = $state<{ text: string; failed: boolean } | null>(null);

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		const name = username.trim();
		if (!name || busy) return;
		busy = true;
		result = null;
		const before = friendsState.stateOfName(name);
		try {
			const sent = await friendsState.request({ username: name });
			result = { text: addFriendMessage(sent.user.username, before, sent), failed: false };
			username = '';
		} catch (e) {
			result = { text: addFriendFailure(name, e), failed: true };
		} finally {
			busy = false;
		}
	}
</script>

<form onsubmit={submit} class="flex flex-col gap-1.5">
	<label for="{uid}-username" class="text-[13px] font-medium text-text-label">
		Add by username
	</label>
	<div class="flex items-center gap-2">
		<input
			id="{uid}-username"
			type="text"
			bind:value={username}
			maxlength={50}
			autocomplete="off"
			autocapitalize="off"
			spellcheck="false"
			class="h-10 min-w-0 flex-1 rounded-[10px] border border-input bg-surface-input px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50"
		/>
		<Button type="submit" class="h-10 rounded-[10px]" disabled={busy || username.trim() === ''}>
			Send request
		</Button>
	</div>
	<p
		role="status"
		class="min-h-4 text-xs {result?.failed ? 'text-destructive' : 'text-text-subtle'}"
	>
		{result?.text ?? ''}
	</p>
</form>
