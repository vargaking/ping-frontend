<script lang="ts">
	import { fade } from 'svelte/transition';
	import { serversState } from '$lib/states/serversState.svelte';
	import { listServerInvites, createInvite, deleteInvite } from '$lib/requests/invites';
	import type { InviteResponse } from '$lib/types/invite.types';

	let invites = $state<InviteResponse[]>([]);
	let isLoading = $state(true);
	let isCreating = $state(false);

	// Create form bound variables
	let maxUses = $state<number | null>(null);
	let validUntilHours = $state<number | null>(null);
	let password = $state('');

	let serverId = $derived(serversState.selectedServer?.id);

	$effect(() => {
		if (serverId) {
			fetchInvites();
		}
	});

	async function fetchInvites() {
		if (!serverId) return;
		isLoading = true;
		try {
			invites = await listServerInvites(serverId);
		} catch (e) {
			console.error('Failed to fetch invites', e);
		} finally {
			isLoading = false;
		}
	}

	async function handleCreateInvite() {
		if (!serverId) return;
		isCreating = true;

		let valid_until: string | null = null;
		if (validUntilHours && validUntilHours > 0) {
			const date = new Date();
			date.setHours(date.getHours() + validUntilHours);
			valid_until = date.toISOString();
		}

		try {
			const newInvite = await createInvite({
				server_id: serverId,
				max_uses: maxUses && maxUses > 0 ? maxUses : null,
				valid_until,
				password: password.trim() ? password.trim() : null
			});
			invites = [...invites, newInvite];

			// reset form
			maxUses = null;
			validUntilHours = null;
			password = '';
		} catch (e) {
			console.error('Failed to create invite', e);
			alert('Failed to create invite');
		} finally {
			isCreating = false;
		}
	}

	async function handleRevoke(inviteId: string) {
		try {
			await deleteInvite(inviteId);
			invites = invites.filter((i) => i.id !== inviteId);
		} catch (e) {
			console.error('Failed to revoke invite', e);
			alert('Failed to revoke invite');
		}
	}

	function copyToClipboard(id: string) {
		// Here we build an invite link. Adjust domain based on your app.
		const inviteLink = `${window.location.origin}/invite/${id}`;
		navigator.clipboard.writeText(inviteLink);
		alert('Invite link copied to clipboard!');
	}
</script>

<div class="flex flex-col gap-6" in:fade={{ duration: 150 }}>
	<div>
		<h2 class="mb-1 text-xl font-bold">Server Invites</h2>
		<p class="text-sm text-gray-400">Manage invitations to this server.</p>
	</div>

	<!-- Create Invite Section -->
	<div class="flex flex-col gap-4 rounded-md bg-[#2b2d31] p-4">
		<h3 class="text-sm font-bold text-gray-300 uppercase">Create New Invite</h3>
		<div class="flex flex-col gap-4">
			<label class="flex flex-col gap-1 text-xs font-bold text-gray-400 uppercase">
				Max Uses (0 for unlimited)
				<input
					type="number"
					min="0"
					bind:value={maxUses}
					class="rounded border border-transparent bg-[#1e1e1e] p-2 font-normal text-white outline-none focus:border-blue-500"
					placeholder="Unlimited"
				/>
			</label>
			<label class="flex flex-col gap-1 text-xs font-bold text-gray-400 uppercase">
				Expires in (Hours)
				<input
					type="number"
					min="0"
					bind:value={validUntilHours}
					class="rounded border border-transparent bg-[#1e1e1e] p-2 font-normal text-white outline-none focus:border-blue-500"
					placeholder="Never"
				/>
			</label>
			<label class="flex flex-col gap-1 text-xs font-bold text-gray-400 uppercase">
				Password
				<input
					type="password"
					bind:value={password}
					class="rounded border border-transparent bg-[#1e1e1e] p-2 font-normal text-white outline-none focus:border-blue-500"
					placeholder="Optional"
				/>
			</label>
		</div>
		<button
			class="w-max rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
			onclick={handleCreateInvite}
			disabled={isCreating}
		>
			{isCreating ? 'Generating...' : 'Generate a New Link'}
		</button>
	</div>

	<!-- Invites List Section -->
	<div>
		<h3 class="mb-3 text-sm font-bold text-gray-400 uppercase">Active Invites</h3>

		{#if isLoading}
			<div class="text-sm text-gray-500">Loading invites...</div>
		{:else if invites.length === 0}
			<div class="text-sm text-gray-400 italic">No active invites for this server.</div>
		{:else}
			<div class="flex flex-col gap-2">
				{#each invites as invite (invite.id)}
					<div class="flex items-center justify-between gap-4 rounded bg-[#2b2d31] p-3">
						<div class="flex flex-col gap-1 overflow-hidden">
							<div class="flex items-center gap-2 text-sm font-medium">
								<button
									class="cursor-pointer truncate border-none bg-transparent p-0 text-left text-blue-400 hover:underline"
									onclick={() => copyToClipboard(invite.id)}
									title="Click to copy"
								>
									{window.location.origin}/invite/{invite.id}
								</button>
							</div>
							<div class="flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-400">
								<span
									>Uses: {invite.use_count}
									{invite.max_uses ? `/ ${invite.max_uses}` : '(Unlimited)'}</span
								>
								<span
									>Expires: {invite.valid_until
										? new Date(invite.valid_until).toLocaleString()
										: 'Never'}</span
								>
								{#if invite.has_password}
									<span class="text-yellow-500">Password Protected</span>
								{/if}
							</div>
						</div>
						<div class="flex shrink-0 gap-2">
							<button
								class="flex h-8 w-8 items-center justify-center rounded bg-gray-600 transition-colors hover:bg-gray-500"
								onclick={() => copyToClipboard(invite.id)}
								title="Copy Link"
							>
								<svg
									class="h-4 w-4 text-white"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
									xmlns="http://www.w3.org/2000/svg"
									><path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
									></path></svg
								>
							</button>
							<button
								class="flex h-8 w-8 items-center justify-center rounded bg-red-600 transition-colors hover:bg-red-700"
								onclick={() => handleRevoke(invite.id)}
								title="Revoke Invite"
							>
								<svg
									class="h-4 w-4 text-white"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
									xmlns="http://www.w3.org/2000/svg"
									><path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M6 18L18 6M6 6l12 12"
									></path></svg
								>
							</button>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</div>
</div>
